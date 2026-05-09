/**
 * Owner WhatsApp commands.
 * The owner sends these from their own number; we route to the right
 * handler BEFORE any AI / channel-health / quota gates run.
 *
 *   PAUSE / RESUME / STATUS / HELP
 *   APPROVE LAST
 *   VOICE OK / VOICE FIX <text>
 *   STOP CUSTOMER +233xxx / RESUME CUSTOMER +233xxx / DELETE +233xxx
 *   ADD <name> <price> / STOCK <name> <qty> / PRICE <name> <new_price>
 *   PRODUCTS
 *   EXPENSE <amount> <description>
 *   EARNINGS [TODAY|WEEK|MONTH]
 *   BEST SELLER [WEEK|MONTH] / TOP CUSTOMER [WEEK|MONTH] / CONVERSION RATE
 *   TODAY
 *   DRAFT STATUS / DRAFT GROUP / WEEK PLAN
 *   DELIVERIES
 */
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { audit } from '../lib/audit.js';
import { resolveLatestPending } from './voice.js';
import {
  cmdAdd,
  cmdStock,
  cmdPrice,
  cmdProducts,
} from '../owner-commands/catalog.js';
import { cmdExpense, cmdEarnings } from '../owner-commands/finance.js';
import {
  cmdBestSeller,
  cmdTopCustomer,
  cmdConversion,
  cmdToday,
} from '../owner-commands/analytics.js';
import { cmdDraftStatus, cmdDraftGroup, cmdWeekPlan } from '../owner-commands/marketing.js';
import { cmdDeliveries } from '../owner-commands/delivery.js';

/**
 * Single regex covering every command head. If the body matches, it goes
 * through this handler. The actual dispatch parses cmd+args inside.
 */
const COMMAND_RE = new RegExp(
  '^(' +
    [
      'PAUSE',
      'RESUME(?!\\s+CUSTOMER)', // RESUME alone (not RESUME CUSTOMER)
      'STATUS',
      'HELP',
      'APPROVE LAST',
      'VOICE OK',
      'VOICE FIX\\s+.+',
      'STOP CUSTOMER\\s+\\+?\\d+',
      'RESUME CUSTOMER\\s+\\+?\\d+',
      'DELETE\\s+\\+?\\d+',
      'ADD\\s+.+\\s+\\d+(?:\\.\\d+)?',
      'STOCK\\s+.+\\s+\\d+',
      'PRICE\\s+.+\\s+\\d+(?:\\.\\d+)?',
      'PRODUCTS',
      'EXPENSE\\s+\\d+(?:\\.\\d+)?\\s+.+',
      'EARNINGS(?:\\s+(?:TODAY|WEEK|MONTH))?',
      'BEST SELLER(?:\\s+(?:WEEK|MONTH))?',
      'TOP CUSTOMER(?:\\s+(?:WEEK|MONTH))?',
      'CONVERSION RATE',
      'TODAY',
      'DRAFT STATUS',
      'DRAFT GROUP',
      'WEEK PLAN',
      'DELIVERIES',
    ].join('|') +
    ')$',
  'i',
);

export function isPanicCommand(body: string): boolean {
  return COMMAND_RE.test(body.trim());
}

export async function handlePanic(args: { user_id: string; owner_phone: string; body: string }): Promise<void> {
  const raw = args.body.trim();
  const reply = await dispatch(args.user_id, raw);
  await send({
    user_id: args.user_id,
    to: args.owner_phone,
    message: reply,
    type: 'text',
    force: true,
    idempotency_key: `panic-${args.user_id}-${Date.now()}`,
  });
  await audit({ user_id: args.user_id, workflow: 'W1-panic', input: { raw }, output: { reply } });
}

async function dispatch(user_id: string, raw: string): Promise<string> {
  const upper = raw.toUpperCase();

  // ─── system controls ──────────────────────────────
  if (upper === 'PAUSE') {
    await supabase.from('channel_health').update({ panic_paused: true }).eq('user_id', user_id);
    return 'Agent paused 🛑 Send RESUME to reactivate.';
  }
  if (upper === 'RESUME') {
    await supabase
      .from('channel_health')
      .update({ panic_paused: false, status: 'healthy', consecutive_errors: 0 })
      .eq('user_id', user_id);
    return 'Agent live again 🟢';
  }
  if (upper === 'HELP') return helpText();

  // ─── voice verification ──────────────────────────
  if (upper === 'VOICE OK') return resolveLatestPending(user_id, { kind: 'confirm' });
  const voiceFix = raw.match(/^VOICE FIX\s+(.+)$/i);
  if (voiceFix) return resolveLatestPending(user_id, { kind: 'correct', text: voiceFix[1]!.trim() });

  // ─── customer controls ───────────────────────────
  const stopMatch = upper.match(/^STOP CUSTOMER\s+(\+?\d+)$/);
  if (stopMatch) {
    const phone = stopMatch[1]!;
    await supabase
      .from('customers')
      .update({ is_blocked: true, block_reason: 'owner panic' })
      .eq('user_id', user_id)
      .eq('phone', phone);
    return `Blocked ${phone} — they'll get no replies.`;
  }
  const resumeCustMatch = upper.match(/^RESUME CUSTOMER\s+(\+?\d+)$/);
  if (resumeCustMatch) {
    const phone = resumeCustMatch[1]!;
    await supabase
      .from('customers')
      .update({ is_blocked: false, block_reason: null })
      .eq('user_id', user_id)
      .eq('phone', phone);
    return `Unblocked ${phone}.`;
  }
  const delMatch = upper.match(/^DELETE\s+(\+?\d+)$/);
  if (delMatch) return deleteCustomer(user_id, delMatch[1]!);

  // ─── approval ────────────────────────────────────
  if (upper === 'APPROVE LAST') return approveLastEscalation(user_id);

  // ─── catalog ─────────────────────────────────────
  if (upper.startsWith('ADD ')) return cmdAdd(user_id, raw.slice(4));
  if (upper.startsWith('STOCK ')) return cmdStock(user_id, raw.slice(6));
  if (upper.startsWith('PRICE ')) return cmdPrice(user_id, raw.slice(6));
  if (upper === 'PRODUCTS') return cmdProducts(user_id);

  // ─── finance ─────────────────────────────────────
  if (upper.startsWith('EXPENSE ')) return cmdExpense(user_id, raw.slice(8));
  if (upper.startsWith('EARNINGS')) return cmdEarnings(user_id, raw.slice(8));

  // ─── analytics ───────────────────────────────────
  if (upper.startsWith('BEST SELLER')) return cmdBestSeller(user_id, raw.slice(11));
  if (upper.startsWith('TOP CUSTOMER')) return cmdTopCustomer(user_id, raw.slice(12));
  if (upper === 'CONVERSION RATE') return cmdConversion(user_id);
  if (upper === 'TODAY' || upper === 'STATUS') return cmdToday(user_id);

  // ─── marketing (drafts) ──────────────────────────
  if (upper === 'DRAFT STATUS') return cmdDraftStatus(user_id);
  if (upper === 'DRAFT GROUP') return cmdDraftGroup(user_id);
  if (upper === 'WEEK PLAN') return cmdWeekPlan(user_id);

  // ─── delivery ────────────────────────────────────
  if (upper === 'DELIVERIES') return cmdDeliveries(user_id);

  return 'Command recognized but not handled. Send HELP for the list.';
}

function helpText(): string {
  return [
    'Commands:',
    '',
    'System:    PAUSE · RESUME · STATUS · HELP',
    'Customer:  STOP CUSTOMER +233xxx · RESUME CUSTOMER +233xxx · DELETE +233xxx',
    'Approval:  APPROVE LAST · VOICE OK · VOICE FIX <text>',
    '',
    'Catalog:   ADD <name> <price> · STOCK <name> <qty> · PRICE <name> <new_price> · PRODUCTS',
    'Finance:   EXPENSE <amt> <desc> · EARNINGS [TODAY|WEEK|MONTH]',
    'Analytics: BEST SELLER [WEEK|MONTH] · TOP CUSTOMER [WEEK|MONTH] · CONVERSION RATE',
    'Marketing: DRAFT STATUS · DRAFT GROUP · WEEK PLAN',
    'Delivery:  DELIVERIES',
  ].join('\n');
}

async function deleteCustomer(user_id: string, phone: string): Promise<string> {
  const deletes = await Promise.all([
    supabase.from('customers').delete().eq('user_id', user_id).eq('phone', phone),
    supabase.from('message_logs').delete().eq('user_id', user_id).eq('contact_phone', phone),
    supabase.from('agent_logs').delete().eq('user_id', user_id).eq('contact_phone', phone),
    supabase.from('conversation_memory').delete().eq('user_id', user_id).eq('customer_phone', phone),
    supabase.from('followups').delete().eq('user_id', user_id).eq('customer_phone', phone),
  ]);
  const total = deletes.reduce((s, r) => s + (r.count ?? 0), 0);
  await supabase.from('deletion_log').insert({
    user_id,
    customer_phone: phone,
    completed_at: new Date().toISOString(),
    rows_deleted: total,
  });
  return `Deleted ${total} rows for ${phone}. They are erased from this system.`;
}

async function approveLastEscalation(user_id: string): Promise<string> {
  const { data: latest } = await supabase
    .from('approval_queue')
    .select('id, customer_phone, drafted_reply')
    .eq('user_id', user_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return 'Nothing pending.';
  const result = await send({
    user_id,
    to: latest.customer_phone,
    message: latest.drafted_reply,
    type: 'text',
    force: true,
    idempotency_key: `approve-${latest.id}`,
  });
  await supabase
    .from('approval_queue')
    .update({ status: 'approved', resolved_at: new Date().toISOString(), final_reply: latest.drafted_reply })
    .eq('id', latest.id);
  return result.sent ? `Sent to ${latest.customer_phone} ✅` : `Tried to send but failed: ${result.reason}`;
}
