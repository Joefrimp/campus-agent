/**
 * W1 Inbound Brain — entrypoint.
 *
 * Whapi posts every inbound message here. Heavy logic lives in
 * classifier.ts, brain.ts, panic.ts, voice.ts.
 *
 * Two reentry points:
 *   - handleInboundWebhook: Whapi POST /whapi/inbound
 *   - processVerifiedText:  voice.ts calls back here after owner verifies a transcript
 */
import type { Context } from 'hono';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit, deadLetter } from '../lib/audit.js';
import { sha256 } from '../lib/crypto.js';
import { send } from '../outbound/send.js';
import { classify } from './classifier.js';
import { runBrain, SKIP_REPLY_SENTINEL } from './brain.js';
import { isPanicCommand, handlePanic } from './panic.js';
import { handleInterviewAnswer } from '../scheduler/onboarding-interview.js';
import { isAddCaption, cmdAddWithImage } from '../owner-commands/catalog.js';
import { ingestVoiceNote } from './voice.js';
import { ingestPaymentImage } from './payment.js';
import { matchForwardedImage, formatMatchReply } from './image-match.js';
import { whapiMarkRead } from '../lib/whapi.js';
import { config } from '../config.js';
import type { WhapiInbound, Profile, BusinessSettings, Customer } from '../types.js';

const HOLDING_REPLY = "Got your message — I'll get back to you shortly 🙏";

type Msg = NonNullable<WhapiInbound['messages']>[number];

export async function handleInboundWebhook(c: Context): Promise<Response> {
  let payload: WhapiInbound;
  try {
    payload = (await c.req.json()) as WhapiInbound;
  } catch (err) {
    logger.warn({ err }, 'inbound payload not JSON');
    return c.json({ ok: true }, 200);
  }

  const messages = payload.messages ?? [];
  if (messages.length === 0) return c.json({ ok: true }, 200);

  for (const msg of messages) {
    processMessage(msg, payload.channel_id).catch((err) => {
      logger.error({ err, message_id: msg.id }, 'unhandled error in message processing');
      deadLetter({ source: 'inbound', payload: msg, error: (err as Error).message });
    });
  }
  return c.json({ ok: true }, 200);
}

async function processMessage(msg: Msg, channel_id?: string): Promise<void> {
  const from = msg.from;
  if (!from) return;

  const isVoice = msg.type === 'voice' || msg.type === 'audio' || !!msg.voice || !!msg.audio;
  const isImage = msg.type === 'image' || !!msg.image;
  let body = msg.text?.body ?? msg.image?.caption ?? '';
  if (!isVoice && !isImage && !body) return;

  // ─── Owner's own outbound (from_me) — observe quietly, do NOT reply.
  // We log it so v2 can extract style patterns and personalize the agent.
  if (msg.from_me === true) {
    const tenant_id = await resolveTenant(channel_id);
    if (tenant_id && body) {
      await supabase.from('owner_messages').insert({
        user_id: tenant_id,
        contact_phone: msg.chat_id ?? from,
        content: body,
        is_group: !!msg.chat_id?.includes('@g.us'),
        message_id: msg.id,
        sent_at: new Date(msg.timestamp * 1000).toISOString(),
      });
    }
    return;
  }

  // 1. Idempotency
  const idem_key = sha256(`inbound|${msg.id}`);
  const { data: existing } = await supabase
    .from('idempotency_keys')
    .select('key')
    .eq('key', idem_key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (existing) return;
  await supabase.from('idempotency_keys').insert({ key: idem_key, result: { processed: true } });

  // 2. Resolve tenant
  const tenant_id = await resolveTenant(channel_id);
  if (!tenant_id) {
    logger.warn({ channel_id, message_id: msg.id }, 'no tenant for channel — dropping');
    return;
  }

  // 3. Load profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, business_name, phone, brand_voice, human_in_loop, plan, message_count')
    .eq('id', tenant_id)
    .single<Profile & { message_count?: number }>();
  if (!profile) return;

  // 4. Owner branch (BEFORE channel gates so RESUME works while paused)
  if (profile.phone && normalizePhone(from) === normalizePhone(profile.phone)) {
    if (isVoice) {
      logger.debug({ tenant_id }, 'voice from owner — dropping (not supported)');
      return;
    }
    // Owner sent an IMAGE with a caption "ADD <name> <price> [| description]"
    // → add the product to catalogue with photo.
    if (isImage && isAddCaption(body)) {
      const image = msg.image as { id?: string } | undefined;
      const mediaId = image?.id;
      if (mediaId) {
        const { data: chan } = await supabase
          .from('whapi_channels')
          .select('token')
          .eq('user_id', tenant_id)
          .maybeSingle();
        if (chan?.token) {
          const reply = await cmdAddWithImage({
            user_id: tenant_id,
            whapi_token: chan.token,
            media_id: mediaId,
            caption: body,
          });
          await send({
            user_id: tenant_id,
            to: profile.phone,
            message: reply,
            type: 'text',
            force: true,
            idempotency_key: sha256(`owner-add-image|${msg.id}`),
          });
        }
      }
      return;
    }
    if (isPanicCommand(body)) {
      await handlePanic({ user_id: tenant_id, owner_phone: profile.phone, body });
      return;
    }
    // Onboarding interview — if owner is mid-interview, this message is
    // their answer to the current question. handleInterviewAnswer returns
    // true if it consumed the message.
    const consumed = await handleInterviewAnswer(tenant_id, body);
    if (consumed) return;
    // Owner sending other non-command message to their own number — ignore
    return;
  }

  // 5. Group filter
  if (msg.chat_id?.includes('@g.us')) {
    const { data: ok } = await supabase
      .from('marketing_groups')
      .select('id')
      .eq('user_id', tenant_id)
      .eq('group_id', msg.chat_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!ok) return;
  }

  // 5b. Mark inbound as read on Whapi side (fire-and-forget; gives customer the ✓✓).
  //     Done before health check so even paused-channel messages are acknowledged.
  const { data: chan } = await supabase
    .from('whapi_channels')
    .select('token')
    .eq('user_id', tenant_id)
    .maybeSingle();
  if (chan?.token) {
    void whapiMarkRead(chan.token, msg.id);
  }

  // 6. Channel health gate
  const { data: health } = await supabase
    .from('channel_health')
    .select('status, panic_paused')
    .eq('user_id', tenant_id)
    .maybeSingle();
  if (health?.panic_paused || health?.status === 'paused') {
    await supabase.from('message_logs').insert({
      user_id: tenant_id,
      direction: 'inbound',
      contact_phone: from,
      content: body || '[voice]',
    });
    return;
  }

  // 7. Customer block + upsert
  const customer = await upsertCustomer(tenant_id, from, msg.from_name ?? null);
  if (!customer) return;

  // 8. Trial quota gate
  if (profile.plan === 'trial' && (profile.message_count ?? 0) >= config.TRIAL_MSG_LIMIT) {
    await send({
      user_id: tenant_id,
      to: from,
      message: `${profile.first_name}'s 1st Employee is on a free trial that's just maxed out. Please ask them to upgrade so I can keep helping you 🙏`,
      type: 'text',
      force: true,
      idempotency_key: `quota-${tenant_id}-${from}`,
    });
    await supabase
      .from('message_logs')
      .insert({ user_id: tenant_id, direction: 'inbound', contact_phone: from, content: body || '[voice]' });
    return;
  }

  // 9. Voice branch
  if (isVoice) {
    await supabase.from('message_logs').insert({
      user_id: tenant_id,
      direction: 'inbound',
      contact_phone: from,
      content: '[voice note pending verification]',
    });
    await ingestVoiceNote({
      msg,
      user_id: tenant_id,
      customer_phone: from,
      customer_name: customer.display_name,
      owner_phone: profile.phone,
    });
    return;
  }

  // 10. Image branch — try payment OCR first
  if (isImage) {
    await supabase.from('message_logs').insert({
      user_id: tenant_id,
      direction: 'inbound',
      contact_phone: from,
      content: body ? `[image] ${body}` : '[image]',
    });
    const paymentResult = await ingestPaymentImage({
      msg,
      user_id: tenant_id,
      customer_id: customer.id,
      customer_phone: from,
      customer_name: customer.display_name,
      owner_phone: profile.phone,
    });
    if (paymentResult.handled) return;

    // Not a payment screenshot — try the catalogue image matcher next.
    // Use case: customer forwards a product photo (often from a competitor
    // WhatsApp group) and asks "do you have this?". Matcher returns exact
    // (>=0.85), similar (>=0.60), or none. We reply directly on exact;
    // append match context to body on similar+caption so brain can riff
    // honestly; fall through to acknowledge on no-caption no-match.
    const imageBytes = await downloadWhapiMedia(tenant_id, msg);
    const match = imageBytes ? await matchForwardedImage(tenant_id, imageBytes) : null;
    const matchReply =
      match && match.ok && (match.band === 'exact' || match.band === 'similar')
        ? formatMatchReply(match, profile.business_name)
        : null;

    if (matchReply && match?.band === 'exact' && !body) {
      // Strong match, no caption — answer directly and log as agent reply.
      const sent = await send({
        user_id: tenant_id,
        to: from,
        message: matchReply,
        type: 'text',
        idempotency_key: sha256(`img-match|${msg.id}`),
      });
      await Promise.allSettled([
        supabase.from('conversation_memory').insert({
          user_id: tenant_id,
          customer_phone: from,
          role: 'assistant',
          content: matchReply,
        }),
        supabase.from('agent_logs').insert({
          user_id: tenant_id,
          contact_phone: from,
          inbound_message: '[forwarded product image]',
          ai_response: matchReply,
          brand_voice: profile.brand_voice,
          was_overridden: false,
        }),
        supabase.rpc('increment_message_count', { p_user_id: tenant_id }),
        audit({
          user_id: tenant_id,
          workflow: 'W1-image-match-exact',
          input: { confidence: match.best_confidence, fingerprint: match.fingerprint },
          output: { reply: matchReply, send: sent },
        }),
      ]);
      return;
    }

    if (matchReply && body) {
      // Has caption — fold the match result into the body so brain replies
      // honestly with the catalogue evidence (no hallucinated matches).
      body = `${body}\n\n[image_analysis: ${matchReply}]`;
    }

    // No caption + no match (or non-product image) — keep the existing ack.
    if (!body) {
      await send({
        user_id: tenant_id,
        to: from,
        message: "Got your photo 📸 What can I help you with?",
        type: 'text',
        idempotency_key: sha256(`img-ack|${msg.id}`),
      });
      return;
    }
    // Fall through to normal text flow with body (possibly enriched).
  }

  // 11. Load settings, then process text body
  const settings = await loadSettings(tenant_id);
  if (!settings) return;

  const isGroup = !!msg.chat_id?.includes('@g.us');

  await processBody({
    profile,
    settings,
    customer,
    body,
    source_id: msg.id,
    is_group: isGroup,
  });
}

/**
 * Re-entry point for voice.ts after the owner verifies a transcript.
 * Loads profile/settings/customer fresh and runs the same body pipeline.
 */
export async function processVerifiedText(args: {
  user_id: string;
  customer_phone: string;
  customer_name: string | null;
  body: string;
  origin_message_id: string;
}): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, business_name, phone, brand_voice, human_in_loop, plan, message_count')
    .eq('id', args.user_id)
    .single<Profile & { message_count?: number }>();
  if (!profile) return;

  const settings = await loadSettings(args.user_id);
  if (!settings) return;

  const customer = await upsertCustomer(args.user_id, args.customer_phone, args.customer_name);
  if (!customer) return;

  await processBody({
    profile,
    settings,
    customer,
    body: args.body,
    source_id: args.origin_message_id,
    is_group: false,
  });
}

interface BodyArgs {
  profile: Profile & { message_count?: number };
  settings: BusinessSettings;
  customer: Customer;
  body: string;
  source_id: string;
  is_group: boolean;
}

/** Intents that warrant the agent actually replying. Everything else is filtered. */
const BUSINESS_INTENTS = new Set(['inquiry', 'order_intent', 'delivery_status', 'review']);


/**
 * The shared inbound pipeline: memory → classify → brain → approval/send → log.
 * Called from both the original Whapi message path and the voice continuation path.
 */
async function processBody(args: BodyArgs): Promise<void> {
  const { profile, settings, customer, body, source_id } = args;
  const tenant_id = profile.id;
  const from = customer.phone;

  // 1. Persist inbound to memory + log
  await Promise.allSettled([
    supabase
      .from('message_logs')
      .insert({ user_id: tenant_id, direction: 'inbound', contact_phone: from, content: body }),
    supabase
      .from('conversation_memory')
      .insert({ user_id: tenant_id, customer_phone: from, role: 'user', content: body }),
  ]);

  // 2. Classify
  const last3 = await loadRecentTurns(tenant_id, from);
  const classification = await classify({ current_message: body, last_3_turns: last3 });

  if (
    classification.intent === 'spam' ||
    classification.intent === 'forwarded_blast' ||
    classification.sentiment === 'abusive'
  ) {
    // Silent drop. Owner gets nothing — these are bulk junk forwards
    // (religious chains, political blasts, share-with-10-friends nonsense)
    // and the owner doesn't want a DM every time someone forwards one.
    await audit({
      user_id: tenant_id,
      workflow: 'W1-silent-drop',
      input: { body, classification },
    });
    return;
  }

  const intentIsBusiness = BUSINESS_INTENTS.has(classification.intent);
  const isApprovalIntent =
    classification.intent === 'refund_request' || classification.intent === 'complaint';

  // 2a. GROUP filter — only respond to clear business intent in groups.
  //     Saves tokens and prevents the agent from chatting up random group banter.
  if (args.is_group && !intentIsBusiness && !isApprovalIntent) {
    await audit({
      user_id: tenant_id,
      workflow: 'W1-group-skip',
      input: { intent: classification.intent, from },
    });
    return;
  }

  // 2b. DM non-business filter — silent every time. No greetings, no "how can I help" replies.
  //     Owner gets a rate-limited DM (max once per customer per hour) so they can step in personally.
  if (!args.is_group && !intentIsBusiness && !isApprovalIntent) {
    if (profile.phone) {
      await send({
        user_id: tenant_id,
        to: profile.phone,
        message: `📭 ${customer.display_name ?? from} sent a non-business message. Handle personally if you'd like.`,
        type: 'text',
        force: true,
        idempotency_key: `nonbiz-notify-${tenant_id}-${from}-${new Date().toISOString().slice(0, 13)}`,
      });
    }
    await audit({
      user_id: tenant_id,
      workflow: 'W1-nonbiz-skip',
      input: { intent: classification.intent, from },
    });
    return;
  }

  // 2c. Already-pending check — if there's a pending approval for this customer, just acknowledge briefly.
  //     Prevents stacking drafts when owner hasn't resolved the prior one yet.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existingPending } = await supabase
    .from('approval_queue')
    .select('id, customer_followup_sent_at')
    .eq('user_id', tenant_id)
    .eq('customer_phone', from)
    .eq('status', 'pending')
    .gt('created_at', dayAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPending) {
    const recentlyAcked =
      existingPending.customer_followup_sent_at &&
      new Date(existingPending.customer_followup_sent_at).getTime() > Date.now() - 60 * 60 * 1000;
    if (!recentlyAcked) {
      await send({
        user_id: tenant_id,
        to: from,
        message: 'On it — back to you very shortly 🙏',
        type: 'text',
        force: true,
        idempotency_key: `pending-ack-${existingPending.id}-${source_id}`,
      });
      await supabase
        .from('approval_queue')
        .update({ customer_followup_sent_at: new Date().toISOString() })
        .eq('id', existingPending.id);
    }
    await audit({
      user_id: tenant_id,
      workflow: 'W1-pending-ack',
      input: { body, approval_id: existingPending.id },
    });
    return;
  }

  // 2d. TRUE HITL — owner is in full manual mode. Agent stays silent;
  //      owner gets a notification so they can reply from their own WhatsApp.
  //      Customer is never told the agent paused — they just experience a
  //      slower (human) response from the owner, which is exactly the point.
  if (profile.human_in_loop) {
    if (profile.phone) {
      await send({
        user_id: tenant_id,
        to: profile.phone,
        message: `📨 [Manual mode] ${customer.display_name ?? from} (${from}):\n"${body.slice(0, 220)}${body.length > 220 ? '…' : ''}"`,
        type: 'text',
        force: true,
        idempotency_key: `hitl-${source_id}`,
      });
    }
    await audit({
      user_id: tenant_id,
      workflow: 'W1-hitl-silent',
      input: { body, classification },
    });
    return;
  }

  // 3. Approval routing — only for refund/complaint/explicit owner-required intents.
  const needsApproval = classification.requires_owner || isApprovalIntent;

  const startedAt = Date.now();

  let brainResult;
  try {
    brainResult = await runBrain({
      profile,
      settings,
      customer,
      current_message: body,
      draft_only: needsApproval,
      is_group: args.is_group,
    });
  } catch (err) {
    // Customer trust posture: never expose technical errors to customers.
    // Stay silent on the customer side; alert the owner so they can reply manually.
    logger.error({ err, tenant_id, from }, 'brain failure — silent customer-side; owner alerted');
    await deadLetter({
      user_id: tenant_id,
      source: 'inbound',
      payload: { body, classification, source_id },
      error: (err as Error).message,
    });
    if (profile.phone) {
      await send({
        user_id: tenant_id,
        to: profile.phone,
        message: `🚨 Vector couldn't reply to ${customer.display_name ?? from} (${from}). Their last message:\n"${body.slice(0, 220)}${body.length > 220 ? '…' : ''}"\n\nPlease reply manually — they don't know anything went wrong.`,
        type: 'text',
        force: true,
        idempotency_key: `brainfail-owner-${source_id}`,
      });
    }
    await bumpErrorCounter(tenant_id);
    return;
  }

  // 3b. SKIP_REPLY sentinel — brain decided this isn't worth replying to
  //     (e.g., non-business chatter the classifier let through, group message
  //     where the agent used dm_outreach instead of replying in the group).
  //     Stay silent on the customer side; the brain may have already done
  //     side effects (DM outreach, audit) via tools.
  if (brainResult.text.includes(SKIP_REPLY_SENTINEL)) {
    await audit({
      user_id: tenant_id,
      workflow: 'W1-skip-reply',
      input: { body, classification },
      output: { tools_used: brainResult.tools_used },
    });
    // Still log the inbound for analytics + future style-learning context
    await supabase.from('agent_logs').insert({
      user_id: tenant_id,
      contact_phone: from,
      inbound_message: body,
      ai_response: '[skipped — non-business or handled via tool]',
      brand_voice: profile.brand_voice,
      was_overridden: false,
    });
    return;
  }

  // 4. Approval branch
  if (needsApproval) {
    await supabase.from('approval_queue').insert({
      user_id: tenant_id,
      customer_phone: from,
      action_type:
        classification.intent === 'refund_request'
          ? 'refund'
          : classification.intent === 'complaint'
            ? 'complaint'
            : 'other',
      drafted_reply: brainResult.text,
      context_summary: `Intent: ${classification.intent}, lang: ${classification.language}`,
    });
    await send({
      user_id: tenant_id,
      to: from,
      message: HOLDING_REPLY,
      type: 'text',
      force: true,
      idempotency_key: `holding-${source_id}`,
    });
    if (profile.phone) {
      await send({
        user_id: tenant_id,
        to: profile.phone,
        message: `📋 ${customer.display_name ?? from} needs your review — open dashboard.`,
        type: 'text',
        force: true,
        idempotency_key: `notify-owner-${source_id}`,
      });
    }
    await audit({
      user_id: tenant_id,
      workflow: 'W1-approval-queued',
      model: brainResult.model,
      input: { body, classification },
      output: { drafted: brainResult.text },
      tools_called: brainResult.tools_used,
      tokens_in: brainResult.tokens_in,
      tokens_out: brainResult.tokens_out,
      latency_ms: Date.now() - startedAt,
    });
    return;
  }

  // 5. Send the reply
  const sendResult = await send({
    user_id: tenant_id,
    to: from,
    message: brainResult.text,
    type: 'text',
    idempotency_key: sha256(`reply|${source_id}`),
  });

  // 6. Log + update counters (parallel; failures isolated)
  await Promise.allSettled([
    supabase
      .from('conversation_memory')
      .insert({ user_id: tenant_id, customer_phone: from, role: 'assistant', content: brainResult.text }),
    supabase.from('agent_logs').insert({
      user_id: tenant_id,
      contact_phone: from,
      inbound_message: body,
      ai_response: brainResult.text,
      brand_voice: profile.brand_voice,
      was_overridden: false,
    }),
    supabase.rpc('increment_message_count', { p_user_id: tenant_id }).then(({ error }) => {
      if (error) {
        return supabase
          .from('profiles')
          .update({ message_count: (profile.message_count ?? 0) + 1 })
          .eq('id', tenant_id);
      }
      return undefined;
    }),
    supabase
      .from('followups')
      .update({ done: true })
      .eq('user_id', tenant_id)
      .eq('customer_phone', from)
      .eq('done', false),
    audit({
      user_id: tenant_id,
      workflow: 'W1-replied',
      model: brainResult.model,
      input: { body, classification },
      output: { reply: brainResult.text, send: sendResult },
      tools_called: brainResult.tools_used,
      tokens_in: brainResult.tokens_in,
      tokens_out: brainResult.tokens_out,
      latency_ms: Date.now() - startedAt,
    }),
  ]);
}

// ─── helpers ───────────────────────────────────────────────────────────────

async function resolveTenant(channel_id?: string): Promise<string | null> {
  // 1. Primary path: exact match on whapi_channels.whapi_channel_id
  if (channel_id) {
    const { data } = await supabase
      .from('whapi_channels')
      .select('user_id')
      .eq('whapi_channel_id', channel_id)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  // 2. Single-tenant fallback: if exactly one profile exists, use it.
  //    Useful in v1 dev when the channel registration row is missing or
  //    Whapi sends an unexpected channel_id format.
  const { data: profiles } = await supabase.from('profiles').select('id').limit(2);
  if (profiles && profiles.length === 1) {
    logger.warn(
      { channel_id },
      'no whapi_channels row matched; falling back to the single existing profile (dev convenience)',
    );
    return profiles[0]?.id ?? null;
  }

  return null;
}

async function upsertCustomer(
  tenant_id: string,
  phone: string,
  display_name: string | null,
): Promise<Customer | null> {
  const { data: existing } = await supabase
    .from('customers')
    .select('id, is_blocked, display_name, preferred_lang, hostel, lifetime_value, total_orders, soft_reply_sent_at')
    .eq('user_id', tenant_id)
    .eq('phone', phone)
    .maybeSingle();

  if (existing?.is_blocked) return null;

  if (existing) {
    await supabase
      .from('customers')
      .update({ last_contact_at: new Date().toISOString(), display_name: display_name ?? existing.display_name })
      .eq('id', existing.id);
    return {
      id: existing.id,
      user_id: tenant_id,
      phone,
      display_name: display_name ?? existing.display_name,
      preferred_lang: existing.preferred_lang,
      hostel: existing.hostel,
      lifetime_value: Number(existing.lifetime_value),
      total_orders: existing.total_orders,
      is_blocked: false,
      last_contact_at: new Date().toISOString(),
      soft_reply_sent_at: existing.soft_reply_sent_at,
    };
  }

  const { data: created } = await supabase
    .from('customers')
    .insert({
      user_id: tenant_id,
      phone,
      display_name: display_name ?? null,
      last_contact_at: new Date().toISOString(),
    })
    .select('id, display_name, preferred_lang, hostel, lifetime_value, total_orders, soft_reply_sent_at')
    .single();
  if (!created) return null;
  return {
    id: created.id,
    user_id: tenant_id,
    phone,
    display_name: created.display_name,
    preferred_lang: created.preferred_lang,
    hostel: created.hostel,
    lifetime_value: Number(created.lifetime_value),
    total_orders: created.total_orders,
    is_blocked: false,
    last_contact_at: new Date().toISOString(),
    soft_reply_sent_at: created.soft_reply_sent_at,
  };
}

async function loadSettings(tenant_id: string): Promise<BusinessSettings | null> {
  const { data } = await supabase
    .from('business_settings')
    .select('*')
    .eq('user_id', tenant_id)
    .single<BusinessSettings>();
  if (!data) {
    logger.error({ tenant_id }, 'no business_settings row — should be auto-seeded');
    return null;
  }
  return data;
}

async function loadRecentTurns(
  user_id: string,
  customer_phone: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { data } = await supabase
    .from('conversation_memory')
    .select('role, content')
    .eq('user_id', user_id)
    .eq('customer_phone', customer_phone)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(3);
  return (data ?? []).reverse().map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
}

async function bumpErrorCounter(user_id: string): Promise<void> {
  const { data } = await supabase
    .from('channel_health')
    .select('consecutive_errors')
    .eq('user_id', user_id)
    .maybeSingle();
  const next = (data?.consecutive_errors ?? 0) + 1;
  const update: Record<string, unknown> = { consecutive_errors: next };
  if (next >= 3) update.status = 'warning';
  await supabase.from('channel_health').update(update).eq('user_id', user_id);
}

function normalizePhone(p: string): string {
  return p.replace(/[^\d]/g, '');
}

/**
 * Download an inbound Whapi media attachment as raw bytes. Returns null on
 * any failure (missing channel token, missing media id, network error,
 * timeout). Used by the image-matcher branch — payment.ts has its own copy
 * because that pipeline pre-dates this helper.
 */
async function downloadWhapiMedia(user_id: string, msg: Msg): Promise<Uint8Array | null> {
  const image = msg.image as { id?: string } | undefined;
  const mediaId = image?.id;
  if (!mediaId) return null;

  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token')
    .eq('user_id', user_id)
    .maybeSingle();
  if (!channel?.token) return null;

  try {
    const res = await fetch(`${config.WHAPI_BASE_URL}/media/${mediaId}`, {
      headers: { Authorization: `Bearer ${channel.token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}
