/**
 * Pro plan auto-activation via MoMo screenshot OCR.
 *
 * Public surface:
 *   getOperatorConfig()           — env vars merged with operator_config row
 *   startUpgrade(user_id)         — mints a fresh code, returns payment instructions
 *   getActivationStatus(code)     — frontend polls this to detect activation
 *   tryActivateFromScreenshot()   — Whapi inbound calls this with extracted OCR data
 *   sweepExpiredActivations()     — cron clears stale pending rows
 *
 * Code format: VEC-XXXX-XXXX  (8 chars from a 32-char alphabet → ~1.2e12 codes).
 */
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

// Avoid look-alikes: no 0/O, no 1/I/L.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface OperatorConfig {
  momo_number: string;
  momo_account_name: string;
  pro_price_ghs: number;
  activation_whatsapp: string;
  activation_minutes: number;
}

export interface PendingActivation {
  code: string;
  user_id: string;
  amount_due_ghs: number;
  duration_months: number;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  expires_at: string;
  matched_txn_id?: string | null;
  matched_at?: string | null;
}

/* ─── Operator config (MoMo number, name, price) ─── */

export async function getOperatorConfig(): Promise<OperatorConfig> {
  const { data: row } = await supabase
    .from('operator_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  return {
    momo_number:
      config.EASTERN_AI_MOMO_NUMBER || row?.momo_number || '',
    momo_account_name:
      config.EASTERN_AI_MOMO_NAME || row?.momo_account_name || 'Eastern AI',
    pro_price_ghs:
      config.EASTERN_AI_PRO_PRICE_GHS || Number(row?.pro_price_ghs ?? 100),
    activation_whatsapp:
      config.EASTERN_AI_ACTIVATION_PHONE || row?.activation_whatsapp || '',
    activation_minutes: Number(row?.activation_minutes ?? 20),
  };
}

/* ─── Code minting + lifecycle ─── */

function generateCode(): string {
  const part = (n: number) =>
    Array.from({ length: n }, () =>
      ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
    ).join('');
  return `VEC-${part(4)}-${part(4)}`;
}

export async function startUpgrade(
  user_id: string,
  duration_months = 1,
): Promise<{
  code: string;
  amount_due_ghs: number;
  expires_at: string;
  duration_months: number;
  operator: OperatorConfig;
}> {
  const operator = await getOperatorConfig();
  const amount = operator.pro_price_ghs * duration_months;

  // Cancel any prior pending rows for this user — fresh code only.
  await supabase
    .from('pro_activation_pending')
    .update({ status: 'cancelled' })
    .eq('user_id', user_id)
    .eq('status', 'pending');

  // Mint a unique code (retry on the rare collision)
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const { error } = await supabase.from('pro_activation_pending').insert({
      code,
      user_id,
      amount_due_ghs: amount,
      duration_months,
      expires_at: new Date(
        Date.now() + operator.activation_minutes * 60_000,
      ).toISOString(),
    });
    if (!error) break;
    if (error.code === '23505') {
      code = generateCode();
      continue;
    }
    logger.error({ err: error }, 'pro_activation_pending insert failed');
    throw new Error('Could not start upgrade');
  }

  await audit({
    user_id,
    workflow: 'billing-start-upgrade',
    output: { code, amount, duration_months },
  });
  await supabase.from('billing_audit').insert({
    user_id,
    code,
    event: 'started',
    amount_ghs: amount,
    reason: `User initiated upgrade for ${duration_months}m`,
  });

  const { data: row } = await supabase
    .from('pro_activation_pending')
    .select('expires_at')
    .eq('code', code)
    .single();

  return {
    code,
    amount_due_ghs: amount,
    expires_at: row!.expires_at,
    duration_months,
    operator,
  };
}

export async function getActivationStatus(
  user_id: string,
  code: string,
): Promise<PendingActivation | null> {
  const { data } = await supabase
    .from('pro_activation_pending')
    .select(
      'code, user_id, amount_due_ghs, duration_months, status, expires_at, matched_txn_id, matched_at',
    )
    .eq('code', code)
    .eq('user_id', user_id)
    .maybeSingle();
  return (data ?? null) as PendingActivation | null;
}

export async function cancelActivation(user_id: string, code: string): Promise<void> {
  await supabase
    .from('pro_activation_pending')
    .update({ status: 'cancelled' })
    .eq('code', code)
    .eq('user_id', user_id)
    .eq('status', 'pending');
}

/* ─── OCR matcher (called from Whapi inbound on activation channel) ─── */

export interface ScreenshotExtraction {
  amount: number | null;
  reference: string | null;
  recipient_visible: string | null;
  txn_id: string | null;
  network: string | null;
  raw?: unknown;
}

export interface MatchOutcome {
  matched: boolean;
  user_id?: string;
  code?: string;
  reason?: string;
}

/**
 * Try to match an OCR'd MoMo screenshot to a pending activation.
 * Returns matched=true and flips the user to Pro on success.
 *
 * Validation rules (in order):
 *   1. amount >= amount_due_ghs (allow tip/overpay; reject underpay)
 *   2. recipient (if visible) contains last 6 of operator MoMo number
 *   3. txn_id not previously matched (replay protection)
 *   4. reference contains a valid VEC-XXXX-XXXX code
 *   5. that code's pro_activation_pending row is status=pending and not expired
 */
export async function tryActivateFromScreenshot(
  e: ScreenshotExtraction,
): Promise<MatchOutcome> {
  const operator = await getOperatorConfig();

  // 1. Amount sanity. (Pending row's amount may differ if duration_months != 1,
  //    so we re-check after we find the row. Here we just guard against trivially
  //    bad screenshots.)
  if (e.amount == null || e.amount <= 0) {
    await logRejection(null, e, 'no amount in screenshot');
    return { matched: false, reason: 'no_amount' };
  }

  // 2. Recipient check (best-effort; OCR may not always extract it).
  if (operator.momo_number && e.recipient_visible) {
    const last6 = operator.momo_number.replace(/\D/g, '').slice(-6);
    if (last6 && !e.recipient_visible.replace(/\D/g, '').includes(last6)) {
      await logRejection(null, e, `wrong recipient (saw ${e.recipient_visible})`);
      return { matched: false, reason: 'wrong_recipient' };
    }
  }

  // 3. Replay protection.
  if (e.txn_id) {
    const { data: existing } = await supabase
      .from('pro_activation_pending')
      .select('code, user_id')
      .eq('matched_txn_id', e.txn_id)
      .maybeSingle();
    if (existing) {
      await logRejection(existing.user_id, e, 'txn_id already used');
      return { matched: false, reason: 'replay' };
    }
  }

  // 4. Find a VEC-XXXX-XXXX code in the reference.
  const code = findCode(e.reference);
  if (!code) {
    await logRejection(null, e, 'no VEC code in reference');
    return { matched: false, reason: 'no_code' };
  }

  // 5. Look up the pending row.
  const { data: pending } = await supabase
    .from('pro_activation_pending')
    .select('code, user_id, amount_due_ghs, duration_months, status, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (!pending) {
    await logRejection(null, e, `code ${code} not found`);
    return { matched: false, reason: 'unknown_code' };
  }
  if (pending.status !== 'pending') {
    await logRejection(pending.user_id, e, `code ${code} already ${pending.status}`);
    return { matched: false, reason: pending.status };
  }
  if (new Date(pending.expires_at) < new Date()) {
    await markExpired(code);
    await logRejection(pending.user_id, e, `code ${code} expired`);
    return { matched: false, reason: 'expired' };
  }
  if (e.amount < Number(pending.amount_due_ghs)) {
    await logRejection(
      pending.user_id,
      e,
      `underpaid (sent ${e.amount}, owed ${pending.amount_due_ghs})`,
    );
    return { matched: false, reason: 'underpaid' };
  }

  // 6. Atomic: mark paid + flip plan. Use unique txn index for replay safety.
  const months = pending.duration_months ?? 1;
  const expiresAt = new Date(
    Date.now() + months * 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: updErr } = await supabase
    .from('pro_activation_pending')
    .update({
      status: 'paid',
      matched_txn_id: e.txn_id,
      matched_amount: e.amount,
      matched_at: new Date().toISOString(),
    })
    .eq('code', code)
    .eq('status', 'pending');

  if (updErr) {
    logger.error({ err: updErr, code }, 'activation update failed');
    return { matched: false, reason: 'db_error' };
  }

  await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      plan_expires_at: expiresAt,
      plan_activated_at: new Date().toISOString(),
      plan_activation_method: 'momo_ocr',
    })
    .eq('id', pending.user_id);

  await supabase.from('billing_audit').insert({
    user_id: pending.user_id,
    code,
    event: 'matched',
    amount_ghs: e.amount,
    txn_id: e.txn_id,
    raw_extraction: e.raw,
  });
  await audit({
    user_id: pending.user_id,
    workflow: 'billing-activated',
    output: { code, amount: e.amount, months, expires_at: expiresAt },
  });

  return { matched: true, user_id: pending.user_id, code };
}

function findCode(s: string | null): string | null {
  if (!s) return null;
  const m = s.toUpperCase().match(/VEC-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  return m ? m[0] : null;
}

async function logRejection(
  user_id: string | null,
  e: ScreenshotExtraction,
  reason: string,
): Promise<void> {
  await supabase.from('billing_audit').insert({
    user_id,
    event: 'rejected',
    amount_ghs: e.amount,
    txn_id: e.txn_id,
    reason,
    raw_extraction: e.raw,
  });
}

async function markExpired(code: string): Promise<void> {
  await supabase
    .from('pro_activation_pending')
    .update({ status: 'expired' })
    .eq('code', code)
    .eq('status', 'pending');
}

/* ─── Cron sweep ─── */

export async function sweepExpiredActivations(): Promise<number> {
  const { data, error } = await supabase
    .from('pro_activation_pending')
    .update({ status: 'expired' })
    .lt('expires_at', new Date().toISOString())
    .eq('status', 'pending')
    .select('code');
  if (error) {
    logger.error({ err: error }, 'sweep expired activations failed');
    return 0;
  }
  return data?.length ?? 0;
}

/* ─── Manual admin grant (escape hatch) ─── */

export async function manualGrantPro(
  user_id: string,
  duration_months = 1,
  reason = 'admin_grant',
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + duration_months * 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await supabase
    .from('profiles')
    .update({
      plan: 'pro',
      plan_expires_at: expiresAt,
      plan_activated_at: new Date().toISOString(),
      plan_activation_method: 'manual_admin',
    })
    .eq('id', user_id);
  await supabase.from('billing_audit').insert({
    user_id,
    event: 'manual_grant',
    reason,
  });
}
