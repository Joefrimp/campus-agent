/**
 * W12 Dead Letter Queue processor — every 15 min.
 * Retries failed items with exponential backoff (15min, 1h, 6h, 24h, 72h).
 * After 5 attempts, items are flagged as permanent failures.
 */
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

const BACKOFF_MS = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000, 72 * 60 * 60_000];

export async function runDLQ(): Promise<void> {
  const now = new Date().toISOString();
  const { data: items } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .eq('resolved', false)
    .lte('next_retry_at', now)
    .lt('retry_count', 5)
    .limit(50);
  if (!items) return;

  for (const item of items) {
    try {
      let success = false;
      if (item.source === 'outbound') {
        const result = await send(item.payload as Parameters<typeof send>[0]);
        success = result.sent;
      }
      // 'inbound' replays would re-POST to /whapi/inbound — left for v2 to avoid loops.
      // 'webhook' / 'cron' similar.

      if (success) {
        await supabase.from('dead_letter_queue').update({ resolved: true }).eq('id', item.id);
      } else {
        await advanceRetry(item.id, item.retry_count);
      }
    } catch (err) {
      logger.error({ err, item_id: item.id }, 'DLQ retry threw');
      await advanceRetry(item.id, item.retry_count);
    }
  }

  // Stale-approval follow-throughs — keep the customer informed instead of ghosting them.
  await processStaleApprovals();

  // Stale voice notes — owner ignored the verification request.
  await processStaleVoiceNotes();
}

/**
 * Two-stage customer follow-through for pending approvals:
 *   • 60 min pending, no follow-up sent → "Still working on this — back soon 🙏"
 *   • 24 h  pending                     → "Sorry for the delay — handing to {{owner}} directly"
 *                                         + URGENT DM to owner, mark expired.
 */
async function processStaleApprovals(): Promise<void> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Stage 1 — 60+ min, no follow-up yet
  const { data: stage1 } = await supabase
    .from('approval_queue')
    .select('id, user_id, customer_phone')
    .eq('status', 'pending')
    .lt('created_at', oneHourAgo)
    .is('customer_followup_sent_at', null)
    .limit(50);
  for (const row of stage1 ?? []) {
    await send({
      user_id: row.user_id,
      to: row.customer_phone,
      message: 'Still working on this — back to you very soon 🙏',
      type: 'text',
      force: true,
      idempotency_key: `approval-followup-1-${row.id}`,
    });
    await supabase
      .from('approval_queue')
      .update({ customer_followup_sent_at: now.toISOString() })
      .eq('id', row.id);
  }

  // Stage 2 — 24 h+ → expire
  const { data: stage2 } = await supabase
    .from('approval_queue')
    .select('id, user_id, customer_phone, customer_name:customer_phone')
    .eq('status', 'pending')
    .lt('created_at', oneDayAgo)
    .limit(50);
  for (const row of stage2 ?? []) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, phone')
      .eq('id', row.user_id)
      .single();
    const ownerName = profile?.first_name ?? 'the owner';

    await send({
      user_id: row.user_id,
      to: row.customer_phone,
      message: `Sorry for the delay — I'm handing this directly to ${ownerName} so they can get back to you ASAP 🙏`,
      type: 'text',
      force: true,
      idempotency_key: `approval-followup-2-${row.id}`,
    });
    if (profile?.phone) {
      await send({
        user_id: row.user_id,
        to: profile.phone,
        message: `🚨 URGENT: ${row.customer_phone} has been waiting 24h for a reply. Open dashboard now.`,
        type: 'text',
        force: true,
        idempotency_key: `urgent-owner-${row.id}`,
      });
    }
    await supabase
      .from('approval_queue')
      .update({ status: 'expired', resolved_at: now.toISOString() })
      .eq('id', row.id);
    await audit({ user_id: row.user_id, workflow: 'W12-approval-expired', input: { approval_id: row.id }, severity: 'warn' });
  }
}

/**
 * Voice notes pending owner verification > 30 min → ask the customer to type
 * it out instead, mark the row as expired so it stops blocking new ones.
 */
async function processStaleVoiceNotes(): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stale } = await supabase
    .from('pending_voice')
    .select('id, user_id, customer_phone')
    .eq('resolved', false)
    .lt('created_at', cutoff)
    .limit(50);

  for (const row of stale ?? []) {
    await send({
      user_id: row.user_id,
      to: row.customer_phone,
      message: "Could you type out what you sent earlier? I want to make sure I get it right 🙏",
      type: 'text',
      force: true,
      idempotency_key: `voice-stale-${row.id}`,
    });
    await supabase
      .from('pending_voice')
      .update({ resolved: true, resolution: 'expired', resolved_at: new Date().toISOString() })
      .eq('id', row.id);
    await audit({ user_id: row.user_id, workflow: 'W12-voice-expired', input: { pending_id: row.id }, severity: 'info' });
  }
  if (stale && stale.length > 0) logger.info({ expired: stale.length }, 'voice notes expired (>30min)');
}

async function advanceRetry(id: string, current: number): Promise<void> {
  const next = current + 1;
  const delay = BACKOFF_MS[Math.min(next, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!;
  await supabase
    .from('dead_letter_queue')
    .update({
      retry_count: next,
      next_retry_at: new Date(Date.now() + delay).toISOString(),
    })
    .eq('id', id);
}
