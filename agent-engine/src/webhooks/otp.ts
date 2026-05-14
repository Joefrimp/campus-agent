/**
 * OTP send + verify.
 *
 * Send: generates a 6-digit code, stores in otp_verifications, ships via
 * the system Whapi channel (config.WHAPI_TOKEN). For v1 the system channel
 * is also the tenant's channel; in production you'd use a dedicated
 * "Eastern AI" sender channel.
 *
 * Verify: matches the most recent unused, non-expired code for the user;
 * on success marks profile.is_verified = true.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { whapiPost } from '../lib/whapi.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

const SendSchema = z.object({
  user_id: z.string().uuid(),
  phone: z.string().min(8),
});

const VerifySchema = z.object({
  user_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

function generateCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d]/g, '');
}

export async function handleSendOtp(c: Context): Promise<Response> {
  const parsed = SendSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);

  const { user_id, phone } = parsed.data;
  const normalized = normalizePhone(phone);
  const code = generateCode();

  // Rate-limit: at most 3 OTP sends per user_id per 10 min
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('otp_verifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .gt('created_at', tenMinAgo);
  if ((recentCount ?? 0) >= 3) {
    return c.json({ success: false, error: 'Too many OTP requests. Wait a few minutes.' }, 200);
  }

  // Save the phone the user typed onto their profile (we keep capturing it
  // even though delivery is via email — useful for when Whapi upgrades + for
  // customer-facing identity later).
  await supabase.from('profiles').update({ phone: normalized }).eq('id', user_id);

  const { error: insertErr } = await supabase.from('otp_verifications').insert({
    user_id,
    otp_code: code,
  });
  if (insertErr) {
    logger.error({ err: insertErr }, 'otp insert failed');
    return c.json({ success: false, error: 'Could not store OTP' }, 200);
  }

  // WhatsApp delivery via Whapi — primary channel.
  const message = `Your Eastern AI verification code is ${code}. It expires in 10 minutes.`;
  const result = await whapiPost({
    token: config.WHAPI_TOKEN,
    path: '/messages/text',
    body: { to: normalized, body: message },
  });
  if (!result.ok) {
    const detail = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    logger.error({ status: result.status, detail }, 'OTP whapi send failed');
    await audit({
      user_id,
      workflow: 'otp-send-fail',
      input: { phone_last4: normalized.slice(-4), whapi_status: result.status },
      output: { detail },
      severity: 'error',
    });
    const userMsg =
      result.status === 401 || result.status === 403
        ? 'WhatsApp channel not authorized. Reconnect Whapi and try again.'
        : result.status === 422
          ? 'That phone number was rejected by WhatsApp. Check the country code (no spaces, no "+").'
          : result.status === 429
            ? 'WhatsApp send limit reached. Try again later.'
            : `Could not deliver OTP (whapi ${result.status}).`;
    return c.json({ success: false, error: userMsg }, 200);
  }
  await audit({ user_id, workflow: 'otp-send-whatsapp', input: { phone_last4: normalized.slice(-4) } });
  return c.json({ success: true, channel: 'whatsapp' });
}

export async function handleVerifyOtp(c: Context): Promise<Response> {
  const parsed = VerifySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);

  const { user_id, code } = parsed.data;

  const { data: row } = await supabase
    .from('otp_verifications')
    .select('id, otp_code, expires_at')
    .eq('user_id', user_id)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || row.otp_code !== code) {
    await audit({ user_id, workflow: 'otp-verify-fail' });
    return c.json({ success: false, error: 'Invalid or expired code.' }, 200);
  }

  // Mark code used + flip profile to verified (parallel)
  await Promise.all([
    supabase.from('otp_verifications').update({ used: true }).eq('id', row.id),
    supabase.from('profiles').update({ is_verified: true }).eq('id', user_id),
  ]);

  await audit({ user_id, workflow: 'otp-verify-success' });
  return c.json({ success: true });
}
