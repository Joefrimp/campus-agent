/**
 * Provision a Whapi channel row for the tenant.
 *
 * v1 single-tenant: uses the system WHAPI_TOKEN from env. Each new tenant
 * shares the same channel — fine for demo + first paid customer.
 *
 * v2 multi-tenant: this endpoint will call the Whapi Partner API to mint
 * a fresh channel + token per tenant (requires WHAPI_PARTNER_KEY).
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { whapiGet } from '../lib/whapi.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

const Schema = z.object({ user_id: z.string().uuid() });

export async function handleWhatsAppSetup(c: Context): Promise<Response> {
  const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  const { user_id } = parsed.data;

  // Hit the Whapi /health endpoint with the system token to figure out the
  // channel's id + current status + QR url (if it's still in pairing mode).
  const channelInfo = await whapiGet({ token: config.WHAPI_TOKEN, path: '/users/login' }).catch(() => null);
  const healthInfo = await whapiGet({ token: config.WHAPI_TOKEN, path: '/health' }).catch(() => null);

  // Whapi reports `status` inconsistently across endpoints/versions:
  //   • /health    → { status: { text: "AUTH", code: 200 } }  (OBJECT)
  //   • some builds → { status: "AUTH" }                       (STRING)
  // Comparing an object to the string 'AUTH' always failed, so an
  // already-authorized production channel was mis-read as 'pending' and
  // the UI looped back to the "Connect" default. Coerce to a string first.
  type WhapiStatus = string | { text?: string; code?: number } | undefined;
  type WhapiBody = { id?: string; channel_id?: string; status?: WhapiStatus; qr?: string; qr_code?: string; image?: string };
  const merged: WhapiBody = {
    ...((healthInfo?.body as WhapiBody | undefined) ?? {}),
    ...((channelInfo?.body as WhapiBody | undefined) ?? {}),
  };
  const statusText = (s: WhapiStatus): string => {
    if (!s) return '';
    if (typeof s === 'string') return s;
    return s.text ?? '';
  };
  const rawStatus = statusText(merged.status).toUpperCase();
  const channel_id = merged.id ?? merged.channel_id ?? `channel-${user_id.slice(0, 8)}`;
  const qr_code_url = merged.qr ?? merged.qr_code ?? merged.image ?? null;
  const whapi_status =
    rawStatus === 'AUTH' || rawStatus === 'AUTHORIZED' || rawStatus === 'CONNECTED' || rawStatus === 'READY'
      ? 'authorized'
      : rawStatus === 'QR' || rawStatus === 'INIT' || rawStatus === 'INITIALIZING' ||
          rawStatus === 'LOADING' || rawStatus === 'PAIRING' || qr_code_url
        ? 'initializing'
        : 'pending';
  logger.info({ user_id, rawStatus, hasQr: !!qr_code_url, whapi_status }, 'whatsapp-setup status resolved');

  const { error: upErr } = await supabase
    .from('whapi_channels')
    .upsert(
      {
        user_id,
        whapi_channel_id: channel_id,
        token: config.WHAPI_TOKEN,
        status: whapi_status,
        qr_code_url,
      },
      { onConflict: 'user_id' },
    );
  if (upErr) {
    logger.error({ err: upErr }, 'whapi_channels upsert failed');
    await audit({ user_id, workflow: 'whatsapp-setup-fail', input: {}, severity: 'error' });
    return c.json({ success: false, error: upErr.message }, 200);
  }

  await audit({ user_id, workflow: 'whatsapp-setup', output: { status: whapi_status, channel_id } });
  return c.json({ success: true, status: whapi_status });
}
