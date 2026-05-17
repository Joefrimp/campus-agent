/**
 * Stale-inquiry follow-up.
 *
 * Customer enquires about a product but never orders. After ~3 days of
 * silence, send ONE warm follow-up in the owner's learned voice. Goal:
 * re-open the conversation without being pushy or salesy.
 *
 * Runs daily at 10:00 UTC. Idempotent — customers.inquiry_followup_sent_at
 * prevents double-firing on the same person.
 *
 * Honest design constraints:
 *   - Skip if the customer placed ANY order since the inquiry
 *   - Skip if the most recent conversation turn was non-business
 *     (classifier intent was greeting / smalltalk / forwarded_blast / spam)
 *   - Skip if customer.is_blocked
 *   - Respect tenant timezone quiet hours
 *   - Never fire more than once per customer per 30-day window
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { isQuietHour } from '../lib/time.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { sha256 } from '../lib/crypto.js';

const LOOKBACK_DAYS = 3;       // we want customers last seen ~3 days ago
const WINDOW_HOURS = 24;       // ...inside a 1-day window so we fire once
const REFIRE_MIN_DAYS = 30;    // don't ping the same person again for 30 days

interface CustomerRow {
  id: string;
  user_id: string;
  phone: string;
  display_name: string | null;
  last_contact_at: string | null;
  inquiry_followup_sent_at: string | null;
  is_blocked: boolean;
}

export async function runStaleInquiryFollowup(): Promise<void> {
  const now = Date.now();
  const windowEnd = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();
  const windowStart = new Date(now - (LOOKBACK_DAYS * 86_400_000 + WINDOW_HOURS * 3_600_000)).toISOString();
  const refireCutoff = new Date(now - REFIRE_MIN_DAYS * 86_400_000).toISOString();

  const { data: candidates } = await supabase
    .from('customers')
    .select('id, user_id, phone, display_name, last_contact_at, inquiry_followup_sent_at, is_blocked')
    .gte('last_contact_at', windowStart)
    .lte('last_contact_at', windowEnd)
    .eq('is_blocked', false)
    .or(`inquiry_followup_sent_at.is.null,inquiry_followup_sent_at.lt.${refireCutoff}`)
    .limit(150);

  if (!candidates || candidates.length === 0) {
    logger.debug('stale-inquiry: no candidates this run');
    return;
  }

  let sent = 0;
  for (const c of candidates as CustomerRow[]) {
    try {
      const ok = await processCustomer(c);
      if (ok) sent++;
    } catch (err) {
      logger.error({ err, customer_id: c.id }, 'stale-inquiry: isolated failure');
    }
  }
  logger.info({ scanned: candidates.length, sent }, 'stale-inquiry: done');
}

async function processCustomer(c: CustomerRow): Promise<boolean> {
  // 1. Disqualify: any order since last_contact_at means they already
  //    converted — no follow-up needed.
  const sinceISO = c.last_contact_at ?? new Date(0).toISOString();
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', c.user_id)
    .eq('customer_id', c.id)
    .gte('created_at', sinceISO);
  if ((orderCount ?? 0) > 0) {
    await touchSent(c.id);   // mark as "considered" so we skip until refire window
    return false;
  }

  // 2. Was the last conversation actually a business inquiry?
  //    We check the most recent agent_logs row — if there's no inbound
  //    that mentions a product or asks a price question, skip.
  const { data: lastLog } = await supabase
    .from('agent_logs')
    .select('inbound_message, created_at')
    .eq('user_id', c.user_id)
    .eq('contact_phone', c.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastLog || !lastLog.inbound_message || lastLog.inbound_message.length < 4) {
    await touchSent(c.id);
    return false;
  }

  // 3. Load tenant profile + settings for voice + timezone + business name
  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, business_name, brand_voice, human_in_loop')
      .eq('id', c.user_id)
      .maybeSingle(),
    supabase
      .from('business_settings')
      .select('timezone, tenant_style_guide, learned_style_summary')
      .eq('user_id', c.user_id)
      .maybeSingle(),
  ]);
  if (!profile) return false;

  // 4. Manual mode: silence the agent — owner takes over manually
  if (profile.human_in_loop) return false;

  // 5. Quiet hours — don't fire late at night in the tenant's local time
  if (isQuietHour(settings?.timezone ?? 'Africa/Accra')) return false;

  // 6. Compose the follow-up in the owner's learned voice
  const message = await composeFollowup({
    customer_name: c.display_name,
    business_name: profile.business_name,
    brand_voice: profile.brand_voice as string,
    style_guide: settings?.tenant_style_guide as string | null,
    learned_summary: settings?.learned_style_summary as string | null,
    last_inquiry: lastLog.inbound_message,
  });
  if (!message) {
    await touchSent(c.id);  // mark anyway to avoid retry storms on broken LLM
    return false;
  }

  // 7. Send
  const result = await send({
    user_id: c.user_id,
    to: c.phone,
    message,
    type: 'text',
    idempotency_key: sha256(`stale-inquiry|${c.id}|${(c.last_contact_at ?? '').slice(0, 10)}`),
  });
  if (!result.sent) {
    logger.warn({ customer_id: c.id, reason: result.reason }, 'stale-inquiry: send failed');
    return false;
  }

  // 8. Mark sent + audit
  await Promise.allSettled([
    supabase
      .from('customers')
      .update({ inquiry_followup_sent_at: new Date().toISOString() })
      .eq('id', c.id),
    supabase
      .from('conversation_memory')
      .insert({ user_id: c.user_id, customer_phone: c.phone, role: 'assistant', content: message }),
    audit({
      user_id: c.user_id,
      workflow: 'stale-inquiry-followup',
      input: { customer_phone: c.phone, last_inquiry: lastLog.inbound_message.slice(0, 120) },
      output: { sent: message },
    }),
  ]);
  return true;
}

async function touchSent(customer_id: string): Promise<void> {
  await supabase
    .from('customers')
    .update({ inquiry_followup_sent_at: new Date().toISOString() })
    .eq('id', customer_id);
}

interface ComposeArgs {
  customer_name: string | null;
  business_name: string;
  brand_voice: string;
  style_guide: string | null;
  learned_summary: string | null;
  last_inquiry: string;
}

async function composeFollowup(a: ComposeArgs): Promise<string | null> {
  const persona = [a.style_guide, a.learned_summary].filter(Boolean).join('\n\n').trim();
  const prompt = `You ARE the owner of ${a.business_name}. Write a SHORT WhatsApp follow-up to a customer who enquired about something 3 days ago and never came back. Tone: ${a.brand_voice} brand voice${persona ? `, and especially match the owner's personal style:\n\n${persona}` : ''}.

Customer's name: ${a.customer_name ?? 'unknown'}
Their last message to us (3 days ago): "${a.last_inquiry.slice(0, 240)}"

Hard rules:
- Speak as a HUMAN owner, never as a bot or "assistant".
- Reference the SPECIFIC thing they asked about — show you remember.
- Warm, professional, respectful. Not pushy. NEVER use the words "follow up", "checking in", "circling back", "just wanted to".
- ONE soft question to re-open the chat. No call-to-action stack.
- 25-45 words max. No emojis unless brand voice is hype_man (then 1 max).
- Plain text only. No markdown. No greeting like "Hi {Name}!" — start with substance.
- NEVER promise discounts. NEVER mention "3 days" or "follow-up".

Output ONLY the message text — no preface, no quotes, no signature.`;

  try {
    const { text } = await generateText({
      model: models.agent,
      prompt,
      temperature: 0.7,
      maxTokens: 120,
      maxRetries: 1,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    if (cleaned.length < 8 || cleaned.length > 360) return null;
    return cleaned;
  } catch (err) {
    logger.warn({ err }, 'stale-inquiry: Gemini compose failed');
    return null;
  }
}
