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
import { sendEmail } from '../lib/email.js';
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

  // Resolve the user's email from auth.users (their signup identity)
  const { data: authResp, error: authErr } = await supabase.auth.admin.getUserById(user_id);
  const email = authResp?.user?.email;
  if (authErr || !email) {
    logger.error({ err: authErr }, 'OTP: could not resolve user email');
    return c.json({ success: false, error: 'Could not find your email on file. Try signing out and back in.' }, 200);
  }

  // Primary path — email via Resend
  if (config.RESEND_API_KEY) {
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0F1A2E">
        <h2 style="margin:0 0 8px;font-size:20px">Your Eastern AI verification code</h2>
        <p style="color:#4F5E78;font-size:14px;margin:0 0 24px">
          Enter this code on the verification page to finish setting up your account. It expires in 10 minutes.
        </p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;color:#2563EB;background:#F1F5FA;border-radius:12px;padding:18px 24px;text-align:center;font-family:Menlo,Consolas,monospace">${code}</div>
        <p style="color:#8896AC;font-size:12px;margin:24px 0 0">
          Didn't request this? You can safely ignore this email — no action will be taken on your account.
        </p>
      </div>`.trim();
    const text = `Your Eastern AI verification code is ${code}. It expires in 10 minutes.`;
    const result = await sendEmail({
      to: email,
      subject: `Eastern AI verification code: ${code}`,
      html,
      text,
    });
    if (result.sent) {
      await audit({ user_id, workflow: 'otp-send-email', output: { email_last8: email.slice(-8) } });
      return c.json({ success: true, channel: 'email' });
    }
    logger.warn({ reason: result.reason }, 'OTP: email send failed, falling through');
    // Fall through to WhatsApp fallback below
  }

  // Fallback — WhatsApp via Whapi (only attempted if Resend isn't configured
  // or it failed). Keeps the system usable even without Resend.
  const message = `Your Eastern AI verification code is ${code}. It expires in 10 minutes.`;
  const result = await whapiPost({
    token: config.WHAPI_TOKEN,
    path: '/messages/text',
    body: { to: normalized, body: message },
  });
  if (!result.ok) {
    const detail = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    logger.error({ status: result.status, detail }, 'OTP whapi fallback failed');
    await audit({
      user_id,
      workflow: 'otp-send-fail',
      input: { phone_last4: normalized.slice(-4), whapi_status: result.status },
      output: { detail },
      severity: 'error',
    });
    return c.json({
      success: false,
      error:
        'Could not deliver code. Email is not configured on the server (set RESEND_API_KEY) and the WhatsApp fallback also failed. Contact support.',
    }, 200);
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
