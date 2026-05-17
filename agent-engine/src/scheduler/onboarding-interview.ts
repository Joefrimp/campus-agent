/**
 * Onboarding interview.
 *
 * When a new tenant verifies + connects WhatsApp, we send them a SHORT
 * interview on WhatsApp so the agent learns their voice + business
 * specifics before going live with real customers. The owner answers
 * naturally, one question at a time; after Q6 we summarise the answers
 * into business_settings.tenant_style_guide so the brain has rich
 * context from the start.
 *
 * Two surfaces:
 *   - runOnboardingInterviewKickoffs() — cron, fires the FIRST question
 *     to any tenant that's verified + WhatsApp-connected but state=pending
 *   - handleInterviewAnswer(user_id, body) — called from webhook.ts
 *     owner branch when the owner replies while state=in_progress
 *
 * Owner can text SKIP INTERVIEW at any point to abandon (panic command).
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { sha256 } from '../lib/crypto.js';

const QUESTIONS = [
  "Welcome to Vector 👋 I'm here to learn your business so I can answer customers exactly the way you would. Quick 6-question chat — takes 2 minutes. Reply SKIP INTERVIEW at any time to do this later.\n\nQ1: In one sentence, what does your business sell or do?",
  "Q2: When are you open / when can customers reach you? (e.g., 'Mon-Sat 9am-7pm', or '24/7 online')",
  "Q3: What are your top 3 best-selling items or services right now?",
  "Q4: Any phrases, openers, or words you use a lot when texting customers? (e.g., 'My brother', 'Charle', 'God bless', 'Boss'). The more, the better — I'll talk like you.",
  "Q5: Do you offer discounts? If yes, what's your usual lowest price as a percentage of your asking price? (e.g., '10% off max', 'never discount', 'depends on customer')",
  "Q6 (last one): Anything important customers should know? (delivery zones, accepted payments, return policy, anything else)",
];

const TOTAL_STEPS = QUESTIONS.length;

interface ProfileRow {
  id: string;
  phone: string | null;
  business_name: string;
  is_verified: boolean;
  onboarding_interview_state: string | null;
  onboarding_interview_step: number | null;
  onboarding_interview_data: Array<{ q: string; a: string }> | null;
}

/* ─── Cron: kick off pending interviews ─── */

export async function runOnboardingInterviewKickoffs(): Promise<void> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, phone, business_name, is_verified, onboarding_interview_state, onboarding_interview_step, onboarding_interview_data')
    .eq('is_verified', true)
    .eq('onboarding_interview_state', 'pending')
    .not('phone', 'is', null)
    .limit(20);

  if (!profiles || profiles.length === 0) return;

  for (const p of profiles as ProfileRow[]) {
    try {
      // Confirm we have a Whapi channel for this tenant — otherwise the
      // send call would 401. (whatsapp-setup flow inserts this row.)
      const { data: chan } = await supabase
        .from('whapi_channels')
        .select('token, status')
        .eq('user_id', p.id)
        .maybeSingle();
      if (!chan?.token) continue;

      await startInterview(p);
    } catch (err) {
      logger.error({ err, user_id: p.id }, 'onboarding-interview kickoff failed (isolated)');
    }
  }
}

async function startInterview(p: ProfileRow): Promise<void> {
  if (!p.phone) return;
  const result = await send({
    user_id: p.id,
    to: p.phone,
    message: QUESTIONS[0]!,
    type: 'text',
    force: true,
    idempotency_key: sha256(`onboarding-q1|${p.id}`),
  });
  if (!result.sent) {
    logger.warn({ user_id: p.id, reason: result.reason }, 'onboarding: Q1 send failed');
    return;
  }
  await supabase
    .from('profiles')
    .update({
      onboarding_interview_state: 'in_progress',
      onboarding_interview_step: 1,
      onboarding_interview_data: [],
    })
    .eq('id', p.id);
  await audit({ user_id: p.id, workflow: 'onboarding-interview-start' });
  logger.info({ user_id: p.id, business: p.business_name }, 'onboarding: interview started');
}

/* ─── Inbound: owner answered the current question ─── */

/**
 * Called from webhook.ts owner branch when state=in_progress and the message
 * is NOT a panic command. Returns true if the message was absorbed by the
 * interview (so webhook.ts can stop processing). False if interview isn't
 * active and webhook.ts should fall through to its normal owner handling.
 */
export async function handleInterviewAnswer(
  user_id: string,
  body: string,
): Promise<boolean> {
  const { data: p } = await supabase
    .from('profiles')
    .select('id, phone, business_name, brand_voice, onboarding_interview_state, onboarding_interview_step, onboarding_interview_data')
    .eq('id', user_id)
    .maybeSingle<ProfileRow & { brand_voice: string }>();
  if (!p || p.onboarding_interview_state !== 'in_progress') return false;
  if (!p.phone) return false;

  // SKIP at any point
  if (/^SKIP\s*INTERVIEW$/i.test(body.trim())) {
    await supabase
      .from('profiles')
      .update({ onboarding_interview_state: 'skipped' })
      .eq('id', user_id);
    await send({
      user_id,
      to: p.phone,
      message: "No worries — skipped. You can run the interview from the dashboard whenever you're ready.",
      type: 'text',
      force: true,
      idempotency_key: sha256(`onboarding-skip|${user_id}`),
    });
    return true;
  }

  const step = p.onboarding_interview_step ?? 1;
  const qIndex = step - 1;
  if (qIndex < 0 || qIndex >= TOTAL_STEPS) return false;

  // Persist the answer
  const transcript = Array.isArray(p.onboarding_interview_data) ? p.onboarding_interview_data : [];
  transcript.push({ q: QUESTIONS[qIndex]!, a: body.trim().slice(0, 1500) });

  const nextStep = step + 1;
  const isLast = nextStep > TOTAL_STEPS;

  if (isLast) {
    // All questions answered — summarise into tenant_style_guide
    await supabase
      .from('profiles')
      .update({
        onboarding_interview_state: 'completed',
        onboarding_interview_step: nextStep,
        onboarding_interview_data: transcript,
      })
      .eq('id', user_id);

    const summary = await summariseInterview(transcript, p.business_name, p.brand_voice);
    if (summary) {
      await supabase
        .from('business_settings')
        .update({ tenant_style_guide: summary })
        .eq('user_id', user_id);
    }

    await send({
      user_id,
      to: p.phone,
      message:
        "Got it 🎯 I've absorbed all of that and I'm ready. From now on I'll answer your customers exactly the way you would. You can fine-tune anything I learned from your dashboard → Settings → Style Guide. Let's go.",
      type: 'text',
      force: true,
      idempotency_key: sha256(`onboarding-done|${user_id}`),
    });
    await audit({ user_id, workflow: 'onboarding-interview-complete', output: { summary_len: summary?.length ?? 0 } });
    return true;
  }

  // Send next question
  await supabase
    .from('profiles')
    .update({
      onboarding_interview_step: nextStep,
      onboarding_interview_data: transcript,
    })
    .eq('id', user_id);

  await send({
    user_id,
    to: p.phone,
    message: QUESTIONS[nextStep - 1]!,
    type: 'text',
    force: true,
    idempotency_key: sha256(`onboarding-q${nextStep}|${user_id}`),
  });
  return true;
}

/* ─── Summarise the Q+A transcript into a style guide ─── */

async function summariseInterview(
  transcript: Array<{ q: string; a: string }>,
  business_name: string,
  brand_voice: string,
): Promise<string | null> {
  const qa = transcript
    .map((t, i) => `Q${i + 1}: ${t.q.replace(/^Q\d+[^:]*:\s*/i, '')}\nA: ${t.a}`)
    .join('\n\n');

  const prompt = `You are translating an onboarding interview with the owner of ${business_name} into a STYLE GUIDE that an AI agent will use to reply to customers on the owner's WhatsApp.

INTERVIEW:
${qa}

Produce a tight 200-300 word style guide that captures:
- What the business sells / does (one line)
- Business hours / availability
- Top-selling items (bullet list)
- Owner's voice — specific phrases, openers, language register, any local slang. Be SPECIFIC and quote the owner's exact phrases.
- Discount policy (% floor, situational rules, never-discount items)
- Operational facts customers should know (delivery, payments, returns, locations)
- Base brand voice: ${brand_voice}

Hard rules:
- Speak as instructions to the AI agent, NOT a summary of the owner.
- Do NOT invent anything not in the answers. Where the owner said "don't know" / left blank, omit rather than guess.
- Output ONLY the style guide text — no preface, no headings beyond what's natural in the prose.`;

  try {
    const { text } = await generateText({
      model: models.escalation,
      prompt,
      temperature: 0.3,
      maxTokens: 600,
      maxRetries: 1,
    });
    return text.trim();
  } catch (err) {
    logger.warn({ err }, 'onboarding: summarise failed');
    return null;
  }
}
