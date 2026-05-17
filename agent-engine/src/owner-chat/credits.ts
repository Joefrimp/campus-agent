/**
 * Owner-chat credit system: 300 credits per 48-hour rolling window.
 *
 * The window opens on the first send AFTER a reset. The window stays
 * open for 48h. When the next send arrives, if (now - window_start) > 48h
 * we reset credits_used=0 and start a new window. The owner sees
 * "credits reset in Xh" in the dashboard, computed from window_start.
 *
 * Cost guidelines (kept small so 300 credits = ~30-100 messages):
 *   - 1   plain text turn (no tools)
 *   - +1  per tool call
 *   - +5  per file generated (PDF/XLSX/DOCX)
 *   - +2  for any escalation to Gemini Pro (heavier model)
 */
import { supabase } from '../lib/supabase.js';

export const OWNER_CHAT_CAP = 300;
export const OWNER_CHAT_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface CreditState {
  used: number;
  cap: number;
  remaining: number;
  window_start_at: string;
  resets_in_ms: number;
  reset_at: string;
}

/** Read current state (with rolling-window reset applied). */
export async function getCreditState(user_id: string): Promise<CreditState> {
  const { data } = await supabase
    .from('profiles')
    .select('owner_chat_credits_used, owner_chat_credits_window_start_at')
    .eq('id', user_id)
    .maybeSingle();

  const now = new Date();
  let used = data?.owner_chat_credits_used ?? 0;
  let windowStart = data?.owner_chat_credits_window_start_at
    ? new Date(data.owner_chat_credits_window_start_at)
    : null;

  // Reset if expired or never started
  if (!windowStart || now.getTime() - windowStart.getTime() > OWNER_CHAT_WINDOW_MS) {
    used = 0;
    windowStart = now;
    await supabase
      .from('profiles')
      .update({
        owner_chat_credits_used: 0,
        owner_chat_credits_window_start_at: now.toISOString(),
      })
      .eq('id', user_id);
  }

  const resetAt = new Date(windowStart.getTime() + OWNER_CHAT_WINDOW_MS);
  return {
    used,
    cap: OWNER_CHAT_CAP,
    remaining: Math.max(0, OWNER_CHAT_CAP - used),
    window_start_at: windowStart.toISOString(),
    resets_in_ms: Math.max(0, resetAt.getTime() - now.getTime()),
    reset_at: resetAt.toISOString(),
  };
}

/** Charge N credits atomically. Returns true if the charge succeeded. */
export async function chargeCredits(user_id: string, amount: number): Promise<{
  ok: boolean;
  state: CreditState;
}> {
  if (amount <= 0) {
    return { ok: true, state: await getCreditState(user_id) };
  }
  const state = await getCreditState(user_id);
  if (state.remaining < amount) {
    return { ok: false, state };
  }
  await supabase
    .from('profiles')
    .update({ owner_chat_credits_used: state.used + amount })
    .eq('id', user_id);
  return {
    ok: true,
    state: {
      ...state,
      used: state.used + amount,
      remaining: Math.max(0, state.cap - (state.used + amount)),
    },
  };
}
