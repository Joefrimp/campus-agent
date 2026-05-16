/**
 * Weekly style learning — synthesises business_settings.learned_style_summary
 * from the owner's manual-mode messages + the agent's own replies + any
 * owner-curated style guide. Runs Sunday 02:00 UTC.
 *
 * Why it works:
 *   - owner_messages captures every reply the owner sends from their own
 *     WhatsApp (populated by webhook.ts from_me branch). These are the
 *     ground truth for "how this owner actually talks to customers".
 *   - agent_logs captures every reply Vector sent. Compared against the
 *     owner's tone, the LLM can spot where Vector drifts.
 *   - tenant_style_guide is the owner's explicit hand-written rules.
 *
 * Output: a 200-300 word summary saved to business_settings.learned_style_summary.
 * brain.ts already reads this into the system prompt — no other wiring needed.
 */
import { generateText } from 'ai';
import { supabase } from '../lib/supabase.js';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';

const MIN_SAMPLES = 5;          // skip tenants with too little signal
const LOOKBACK_DAYS = 7;
const MAX_OWNER_MSGS = 60;       // cap tokens
const MAX_AGENT_LOGS = 40;

interface TenantRow { user_id: string }

export async function runStyleLearning(): Promise<void> {
  // Tenants with any owner activity in the lookback window.
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600_000).toISOString();
  const { data: tenants } = await supabase
    .from('owner_messages')
    .select('user_id')
    .gt('sent_at', since);

  // De-dup
  const uniq = new Set<string>((tenants ?? []).map((t: TenantRow) => t.user_id));
  if (uniq.size === 0) {
    logger.debug('style-learning: no active tenants this week');
    return;
  }

  for (const user_id of uniq) {
    await synthesizeForTenant(user_id, since).catch((err) => {
      logger.error({ err, user_id }, 'style-learning: tenant synth failed (isolated)');
    });
  }
}

async function synthesizeForTenant(user_id: string, since: string): Promise<void> {
  // Pull samples in parallel
  const [ownerRes, agentRes, settingsRes] = await Promise.all([
    supabase
      .from('owner_messages')
      .select('content, sent_at, is_group')
      .eq('user_id', user_id)
      .gt('sent_at', since)
      .eq('is_group', false)
      .order('sent_at', { ascending: false })
      .limit(MAX_OWNER_MSGS),
    supabase
      .from('agent_logs')
      .select('inbound_message, ai_response, was_overridden, created_at')
      .eq('user_id', user_id)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_AGENT_LOGS),
    supabase
      .from('business_settings')
      .select('tenant_style_guide, learned_style_summary')
      .eq('user_id', user_id)
      .maybeSingle(),
  ]);

  const ownerMsgs = (ownerRes.data ?? []).filter((r: { content: string }) => r.content?.trim().length > 0);
  const agentLogs = agentRes.data ?? [];

  if (ownerMsgs.length < MIN_SAMPLES) {
    await supabase.from('style_synthesis_runs').insert({
      user_id,
      source: 'weekly_style',
      inputs_considered: ownerMsgs.length,
      error: `below MIN_SAMPLES (${MIN_SAMPLES})`,
    });
    return;
  }

  const ownerSnippets = ownerMsgs
    .slice(0, 30)
    .map((m: { content: string }) => `- "${m.content.slice(0, 240)}"`)
    .join('\n');

  const agentSnippets = agentLogs
    .slice(0, 20)
    .map(
      (l: { inbound_message: string; ai_response: string }) =>
        `Customer: "${(l.inbound_message ?? '').slice(0, 120)}"\nVector: "${(l.ai_response ?? '').slice(0, 200)}"`,
    )
    .join('\n---\n');

  const existingGuide = (settingsRes.data?.tenant_style_guide ?? '').trim();
  const existingLearned = (settingsRes.data?.learned_style_summary ?? '').trim();

  const prompt = `You are analysing how a small-business owner personally writes to their WhatsApp customers, so that an AI agent ("Vector") can mimic their voice more closely.

OWNER'S OWN MESSAGES (past ${LOOKBACK_DAYS} days, ${ownerMsgs.length} samples):
${ownerSnippets}

WHAT VECTOR HAS BEEN SENDING ON THE OWNER'S BEHALF (recent):
${agentSnippets || '(no agent replies yet)'}

OWNER-CURATED STYLE RULES (explicit instructions the owner wrote):
${existingGuide || '(none)'}

PRIOR LEARNED SUMMARY (last run — refresh, don't blindly preserve):
${existingLearned || '(none)'}

Produce a CONCISE 200-300 word "STYLE SUMMARY" describing exactly how Vector should write to be indistinguishable from this owner. Include:

1. Tone and energy (e.g. "warm, direct, slight humour")
2. Specific vocabulary the owner uses (slang, nicknames, openers like "Hello boss")
3. Length and structure preferences (short bursts? full sentences? bullet lists?)
4. Emoji use (which ones, how often)
5. How they handle: price questions, stock-out apologies, delivery delays, complaints
6. Any catchphrases or signatures
7. Things to AVOID (formal-isms, corporate phrasing the owner clearly never uses)

Be specific and concrete. Quote exact phrases the owner uses when relevant. Do NOT pad with generic SaaS advice. Output ONLY the summary text — no preamble, no headings beyond what's natural prose.`;

  let summary = '';
  try {
    const { text } = await generateText({
      model: models.escalation,
      prompt,
      temperature: 0.3,
      maxRetries: 1,
    });
    summary = text.trim();
  } catch (err) {
    logger.error({ err, user_id }, 'style-learning: Gemini failed');
    await supabase.from('style_synthesis_runs').insert({
      user_id,
      source: 'weekly_style',
      inputs_considered: ownerMsgs.length,
      error: (err as Error).message?.slice(0, 500) ?? 'unknown',
    });
    return;
  }

  if (!summary || summary.length < 80) {
    await supabase.from('style_synthesis_runs').insert({
      user_id,
      source: 'weekly_style',
      inputs_considered: ownerMsgs.length,
      error: 'empty/short summary',
    });
    return;
  }

  await supabase
    .from('business_settings')
    .update({ learned_style_summary: summary })
    .eq('user_id', user_id);

  await supabase.from('style_synthesis_runs').insert({
    user_id,
    source: 'weekly_style',
    inputs_considered: ownerMsgs.length,
    summary_excerpt: summary.slice(0, 240),
  });

  logger.info({ user_id, samples: ownerMsgs.length, len: summary.length }, 'style-learning: updated');
}
