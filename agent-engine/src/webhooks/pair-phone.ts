/**
 * Whapi Phone-pair endpoint.
 *
 * The Whapi channel emits an 8-character pairing code that the owner enters
 * on their phone (WhatsApp → Settings → Linked Devices → Link with phone
 * number instead). No QR scanning required.
 *
 * Whapi reference: GET /users/login/{phone}  →  { pairing_code: "AAAA-BBBB" }
 * (Different Whapi plans/versions may use a slightly different shape; we
 * relay whatever the API returns to the frontend so the user always sees
 * something useful even if our parsing fails.)
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { whapiGet } from '../lib/whapi.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

const Schema = z.object({
  user_id: z.string().uuid(),
  phone: z.string().min(8),
});

function normalize(p: string): string {
  return p.replace(/[^\d]/g, '');
}

export async function handlePairPhone(c: Context): Promise<Response> {
  const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);

  const { user_id, phone } = parsed.data;
  const normalized = normalize(phone);

  // Resolve this tenant's Whapi token (must already exist in whapi_channels)
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token, status')
    .eq('user_id', user_id)
    .maybeSingle();
  if (!channel?.token) {
    return c.json({
      success: false,
      error: 'No Whapi channel registered yet. Use the QR option to provision the channel first, then phone-pair on subsequent re-links.',
    }, 200);
  }
  if (channel.status === 'authorized') {
    return c.json({
      success: false,
      error: 'Channel is already authorized. Log out first if you want to re-link.',
    }, 200);
  }

  const result = await whapiGet({
    token: channel.token,
    path: `/users/login/${encodeURIComponent(normalized)}`,
  });

  if (!result.ok) {
    logger.error({ status: result.status, body: result.body }, 'phone-pair request failed');
    await audit({ user_id, workflow: 'phone-pair-fail', input: { phone_last4: normalized.slice(-4) }, severity: 'error' });
    const userMsg =
      result.status === 401
        ? 'Whapi channel token is invalid. Reconnect from the Whapi panel.'
        : result.status === 403
          ? 'Channel is in a state that doesn\'t allow phone pairing right now. Try again or fall back to QR.'
          : `Could not get pairing code (whapi ${result.status}).`;
    return c.json({ success: false, error: userMsg }, 200);
  }

  // Whapi returns shape like { pairing_code: "ABCD-EFGH" } or sometimes
  // { code: "...", expires_in: 60 } — accept either.
  const body = result.body as Record<string, unknown>;
  const code = (body.pairing_code ?? body.code ?? body.pair_code) as string | undefined;
  if (!code) {
    return c.json({
      success: false,
      error: 'Whapi did not return a pairing code. Use QR fallback.',
      raw: body,
    }, 200);
  }

  await audit({ user_id, workflow: 'phone-pair-issued', input: { phone_last4: normalized.slice(-4) } });
  return c.json({ success: true, code, expires_in_seconds: (body.expires_in as number | undefined) ?? 60 });
}
