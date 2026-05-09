/**
 * Voice note pipeline.
 *
 * Flow:
 *   1. Customer sends voice/audio → Whapi posts inbound with `voice`/`audio` field.
 *   2. We download the audio from Whapi using the per-tenant token.
 *   3. Gemini Flash transcribes (audio natively supported, no extra service).
 *   4. We insert a pending_voice row, DM the owner with the transcript,
 *      and send the customer a brief holding message.
 *   5. Owner replies with VOICE OK or VOICE FIX <correction>; panic.ts
 *      picks that up and calls resumeAfterVerification() below.
 *
 * If transcription fails, we DM the customer asking them to type it out.
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import type { WhapiInbound } from '../types.js';

type Msg = NonNullable<WhapiInbound['messages']>[number];

interface IngestArgs {
  msg: Msg;
  user_id: string;
  customer_phone: string;
  customer_name: string | null;
  owner_phone: string | null;
}

const HOLDING_REPLY = 'Got your voice note — getting back to you in a moment 🎧';
const TRANSCRIBE_FAIL_REPLY =
  "I had trouble hearing your voice note clearly. Could you type out what you'd like? Thanks 🙏";

export async function ingestVoiceNote(args: IngestArgs): Promise<void> {
  const { msg, user_id, customer_phone, customer_name, owner_phone } = args;

  const audio = msg.voice ?? msg.audio;
  if (!audio?.id) {
    logger.warn({ message_id: msg.id }, 'voice message without media id');
    return;
  }

  // 1. Resolve token
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token')
    .eq('user_id', user_id)
    .maybeSingle();
  if (!channel?.token) {
    logger.error({ user_id }, 'no token for voice download');
    return;
  }

  // 2. Download audio bytes from Whapi
  const audioBytes = await downloadWhapiMedia(channel.token, audio.id);
  if (!audioBytes) {
    await fallbackToText(user_id, customer_phone, msg.id);
    return;
  }

  // 3. Transcribe with Gemini (audio natively supported)
  const transcript = await transcribe(audioBytes, audio.mime_type ?? 'audio/ogg');
  if (!transcript) {
    await fallbackToText(user_id, customer_phone, msg.id);
    return;
  }

  // 4. Insert pending row
  const { data: pending, error: pendErr } = await supabase
    .from('pending_voice')
    .insert({
      user_id,
      customer_phone,
      customer_name,
      transcript,
      audio_url: audio.link ?? null,
      message_id: msg.id,
    })
    .select('id')
    .single();
  if (pendErr || !pending) {
    logger.error({ err: pendErr }, 'pending_voice insert failed');
    await fallbackToText(user_id, customer_phone, msg.id);
    return;
  }

  // 5. DM owner for verification
  if (owner_phone) {
    const ownerMsg =
      `🎤 Voice from ${customer_name ?? customer_phone} (${customer_phone}):\n` +
      `"${transcript}"\n\n` +
      `Reply VOICE OK to send my reply, or VOICE FIX <correct version> to fix.`;
    await send({
      user_id,
      to: owner_phone,
      message: ownerMsg,
      type: 'text',
      force: true,
      idempotency_key: `voice-notify-${pending.id}`,
    });
  }

  // 6. Holding message to customer
  await send({
    user_id,
    to: customer_phone,
    message: HOLDING_REPLY,
    type: 'text',
    force: true,
    idempotency_key: `voice-holding-${msg.id}`,
  });

  await audit({
    user_id,
    workflow: 'W1-voice-pending',
    model: 'gemini-2.5-flash',
    input: { customer_phone, message_id: msg.id },
    output: { transcript, pending_id: pending.id },
  });
}

async function downloadWhapiMedia(token: string, mediaId: string): Promise<Uint8Array | null> {
  const url = `${config.WHAPI_BASE_URL}/media/${mediaId}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.error({ status: res.status, mediaId }, 'whapi media download failed');
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    logger.error({ err, mediaId }, 'whapi media download threw');
    return null;
  }
}

async function transcribe(audio: Uint8Array, mime: string): Promise<string | null> {
  try {
    const { text } = await generateText({
      model: models.agent,
      system:
        'Transcribe this voice note from a Ghanaian campus customer. Output ONLY the transcript text — no preamble, no quotes, no commentary. If the audio is silent, contains only background noise, or is unintelligible, output exactly the literal string [UNCLEAR].',
      messages: [
        {
          role: 'user',
          content: [{ type: 'file', data: audio, mimeType: mime }],
        },
      ],
      temperature: 0,
      maxTokens: 500,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    if (!cleaned || cleaned === '[UNCLEAR]') return null;
    return cleaned;
  } catch (err) {
    logger.error({ err }, 'gemini transcription failed');
    return null;
  }
}

async function fallbackToText(user_id: string, customer_phone: string, message_id: string): Promise<void> {
  await send({
    user_id,
    to: customer_phone,
    message: TRANSCRIBE_FAIL_REPLY,
    type: 'text',
    force: true,
    idempotency_key: `voice-fail-${message_id}`,
  });
}

/**
 * Called by panic.ts when the owner sends VOICE OK or VOICE FIX.
 * Returns a short owner-facing confirmation string.
 */
export async function resolveLatestPending(
  user_id: string,
  decision: { kind: 'confirm' } | { kind: 'correct'; text: string },
): Promise<string> {
  const { data: pending } = await supabase
    .from('pending_voice')
    .select('id, customer_phone, customer_name, transcript')
    .eq('user_id', user_id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending) return 'No voice note pending verification.';

  const finalText = decision.kind === 'confirm' ? pending.transcript : decision.text;

  // Mark resolved BEFORE running brain so a slow brain run doesn't double-process.
  await supabase
    .from('pending_voice')
    .update({
      resolved: true,
      resolution: decision.kind === 'confirm' ? 'confirmed' : 'corrected',
      final_text: finalText,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', pending.id);

  // Now feed the verified text into the normal inbound flow.
  // We import lazily to break circular dep.
  const { processVerifiedText } = await import('./webhook.js');
  try {
    await processVerifiedText({
      user_id,
      customer_phone: pending.customer_phone,
      customer_name: pending.customer_name,
      body: finalText,
      origin_message_id: `voice-${pending.id}`,
    });
  } catch (err) {
    logger.error({ err, pending_id: pending.id }, 'verified-text processing failed');
    return `Failed to send reply to ${pending.customer_phone}. Logged.`;
  }

  return decision.kind === 'confirm'
    ? `✅ Sent to ${pending.customer_name ?? pending.customer_phone}.`
    : `✅ Sent corrected reply to ${pending.customer_name ?? pending.customer_phone}.`;
}
