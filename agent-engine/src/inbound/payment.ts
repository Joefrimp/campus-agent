/**
 * Payment screenshot pipeline.
 *
 * When a customer sends an image with their inbound, we treat it as a
 * possible payment confirmation (MoMo / bank screenshot). We:
 *   1. Download the image from Whapi
 *   2. Send to Gemini Flash multimodal with a strict JSON schema
 *   3. If the extraction looks like a payment, try to match it to an
 *      open order for that customer (by amount, time proximity)
 *   4. On strong match: update order to 'paid' + send receipt-style reply
 *   5. On weak/no match: escalate to owner via approval_queue
 *   6. Either way, log a payment_attempts row for forensic trail
 *
 * Falls back to plain image-handling (let agent describe) if extraction
 * shows it's not a payment screenshot.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';
import { tryActivateFromScreenshot } from '../billing/activation.js';
import type { WhapiInbound } from '../types.js';

type Msg = NonNullable<WhapiInbound['messages']>[number];

const ExtractionSchema = z.object({
  is_payment_screenshot: z.boolean(),
  amount: z.number().nullable(),
  reference: z.string().nullable(),
  txn_id: z.string().nullable(),
  sender_name: z.string().nullable(),
  network: z.enum(['MTN', 'Vodafone', 'AirtelTigo', 'Bank', 'Other', 'Unknown']).nullable(),
  recipient_visible: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const EXTRACT_PROMPT = `Analyze this image. If it is a Ghanaian Mobile Money (MoMo) confirmation screenshot, bank transfer receipt, or any payment proof, extract: amount in GHS (number only), transaction reference (free text — may contain codes like "VEC-XXXX-XXXX"), txn_id (the transaction ID assigned by the network), sender name, network (MTN/Vodafone/AirtelTigo/Bank), recipient_visible (phone number or name shown as recipient). If it is NOT a payment screenshot (just a product photo, selfie, meme, etc.), set is_payment_screenshot=false and leave other fields null. Be strict — only mark true if you clearly see "Sent", "Transfer", "Payment", "Successful", a transaction ID, or similar payment indicators.`;

const ACTIVATION_CODE_RE = /VEC-[A-Z2-9]{4}-[A-Z2-9]{4}/i;

interface IngestArgs {
  msg: Msg;
  user_id: string;
  customer_id: string;
  customer_phone: string;
  customer_name: string | null;
  owner_phone: string | null;
}

export async function ingestPaymentImage(args: IngestArgs): Promise<{ handled: boolean }> {
  const image = args.msg.image as { id?: string; mime_type?: string; link?: string } | undefined;
  const mediaId = image?.id;
  if (!mediaId) return { handled: false };

  // 1. Resolve token + download
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token')
    .eq('user_id', args.user_id)
    .maybeSingle();
  if (!channel?.token) return { handled: false };

  const bytes = await downloadMedia(channel.token, mediaId);
  if (!bytes) return { handled: false };

  // 2. Extract with Gemini multimodal
  let extraction: z.infer<typeof ExtractionSchema>;
  try {
    const { object } = await generateObject({
      model: models.agent,
      schema: ExtractionSchema,
      system: EXTRACT_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image.' },
            { type: 'image', image: bytes },
          ],
        },
      ],
      temperature: 0,
      maxRetries: 1,
    });
    extraction = object;
  } catch (err) {
    logger.warn({ err }, 'payment extraction threw');
    return { handled: false };
  }

  if (!extraction.is_payment_screenshot || extraction.confidence < 0.6) {
    // Not a payment image — let the normal text flow handle it (or skip).
    return { handled: false };
  }

  // ─── Pro activation short-circuit ─────────────────────────────────
  // If the OCR'd reference contains a VEC-XXXX-XXXX activation code, this
  // is a Pro upgrade payment (not an order payment). Route to the activation
  // matcher and reply directly to the sender — do NOT escalate to the
  // tenant owner (they aren't part of this transaction).
  //
  // This lets the same Whapi channel/number that's used for the tenant's
  // own customer messages ALSO receive Pro-upgrade screenshots, so users
  // don't have to provision a second WhatsApp line.
  const refText = `${extraction.reference ?? ''} ${args.msg.text?.body ?? args.msg.image?.caption ?? ''}`;
  if (ACTIVATION_CODE_RE.test(refText)) {
    const outcome = await tryActivateFromScreenshot({
      amount: extraction.amount,
      reference: refText,
      recipient_visible: extraction.recipient_visible,
      txn_id: extraction.txn_id,
      network: extraction.network,
      raw: extraction,
    });
    const reply = outcome.matched
      ? `✅ Pro activated! Welcome to Vector Pro.\n\nCode: ${outcome.code}\nThank you for upgrading 🚀`
      : explainActivationRejection(outcome.reason);
    await send({
      user_id: args.user_id,
      to: args.customer_phone,
      message: reply,
      type: 'text',
      force: true,
      idempotency_key: `pro-activation-reply-${args.msg.id}`,
    });
    await audit({
      user_id: args.user_id,
      workflow: outcome.matched ? 'pro-activation-matched' : 'pro-activation-rejected',
      input: { extraction, from: args.customer_phone },
      output: { outcome },
    });
    return { handled: true };
  }

  // 3. Find candidate open orders (best fuzzy match by amount, no auto-confirm).
  const { data: openOrders } = await supabase
    .from('orders')
    .select('id, state, total_amount, items, created_at')
    .eq('user_id', args.user_id)
    .eq('customer_id', args.customer_id)
    .in('state', ['quoted', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(5);

  let matchedOrderId: string | null = null;
  let matchConfidence: 'strong' | 'weak' | 'none' = 'none';
  if (extraction.amount != null && openOrders) {
    for (const o of openOrders) {
      const orderTotal = Number(o.total_amount ?? 0);
      if (orderTotal === 0) continue;
      const ratio = Math.abs(orderTotal - extraction.amount) / orderTotal;
      if (ratio < 0.01) { matchedOrderId = o.id; matchConfidence = 'strong'; break; }
      if (ratio < 0.10 && matchConfidence === 'none') { matchedOrderId = o.id; matchConfidence = 'weak'; }
    }
  }

  // 4. Persist a payment_attempts row for forensic trail.
  const { data: attempt } = await supabase
    .from('payment_attempts')
    .insert({
      user_id: args.user_id,
      customer_phone: args.customer_phone,
      message_id: args.msg.id,
      amount: extraction.amount,
      reference: extraction.reference,
      sender_name: extraction.sender_name,
      network: extraction.network,
      matched_order_id: matchedOrderId,
      status: 'pending',          // ALWAYS pending — owner verifies in MoMo first
      raw_extraction: extraction,
    })
    .select('id')
    .single();

  // 5. ALWAYS escalate to owner. No customer reply, no holding message.
  //    Reason: customers can send old/fake screenshots to trick the agent.
  //    The owner verifies in MoMo, then sends reply via APPROVE LAST or
  //    types a custom reply themselves. Customer just sees ✓✓ until then.
  const draftedReply = matchedOrderId
    ? `✅ Payment of GHS ${extraction.amount} confirmed (ref: ${extraction.reference ?? 'n/a'}). Your order is being prepared — I'll update you when it goes out for delivery 🚀`
    : `✅ Payment of GHS ${extraction.amount} received (ref: ${extraction.reference ?? 'n/a'}). What would you like to order?`;

  const summary = buildOwnerSummary(extraction, openOrders ?? [], matchConfidence);

  await supabase.from('approval_queue').insert({
    user_id: args.user_id,
    customer_phone: args.customer_phone,
    action_type: 'other',
    drafted_reply: draftedReply,
    context_summary: `[PAYMENT VERIFY]\n${summary}\n\nMatched order: ${matchedOrderId ?? '— none —'}\nMatch confidence: ${matchConfidence}\n\nVERIFY in your MoMo / bank app first, then APPROVE LAST or edit the reply.`,
  });

  if (args.owner_phone) {
    await send({
      user_id: args.user_id,
      to: args.owner_phone,
      message:
        `💵 Payment screenshot from ${args.customer_name ?? args.customer_phone}:\n${summary}\n\n` +
        `⚠️ VERIFY IN YOUR MOMO/BANK APP FIRST. ` +
        `Customer was NOT told anything yet — they only saw ✓✓.\n\n` +
        `When you've confirmed the money is in your account, reply APPROVE LAST to send the confirmation.`,
      type: 'text',
      force: true,
      idempotency_key: `payment-notify-${args.msg.id}`,
    });
  }

  await audit({
    user_id: args.user_id,
    workflow: 'W1-payment-pending-verify',
    input: { extraction, customer_phone: args.customer_phone },
    output: { matched_order_id: matchedOrderId, match: matchConfidence, attempt_id: attempt?.id },
  });

  return { handled: true };   // handled = true means "don't fall through to brain"
}

function buildOwnerSummary(
  e: z.infer<typeof ExtractionSchema>,
  orders: Array<{ total_amount: number | null; state: string }>,
  match: 'strong' | 'weak' | 'none',
): string {
  const lines = [
    `Amount: GHS ${e.amount ?? '?'}`,
    `Network: ${e.network ?? '?'}`,
    `From: ${e.sender_name ?? '?'}`,
    `Ref: ${e.reference ?? '?'}`,
  ];
  if (match === 'weak') {
    lines.push('Match: weak (amount close but not exact)');
  } else if (match === 'none') {
    if (orders.length > 0) {
      const opens = orders.map((o) => `GHS ${o.total_amount ?? '?'}`).join(', ');
      lines.push(`Open orders: ${opens}`);
    } else {
      lines.push('No open orders for this customer');
    }
  }
  return lines.join('\n');
}

async function downloadMedia(token: string, mediaId: string): Promise<Uint8Array | null> {
  const url = `${config.WHAPI_BASE_URL}/media/${mediaId}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function explainActivationRejection(reason?: string): string {
  switch (reason) {
    case 'no_amount':
      return "Couldn't read the amount on your screenshot. Re-send a clearer one.";
    case 'wrong_recipient':
      return "The recipient on this screenshot doesn't match our MoMo number. Did you send to the right number?";
    case 'no_code':
      return "We couldn't find a VEC-XXXX-XXXX activation code in the reference. Make sure you used the exact code shown on your dashboard as the MoMo reference.";
    case 'unknown_code':
      return "That activation code isn't recognised. Generate a new one in your dashboard and try again.";
    case 'expired':
      return 'That activation code expired. Click "Go Pro" in your dashboard to get a fresh one.';
    case 'underpaid':
      return 'The amount paid is less than the Pro price. Top up the difference and re-forward the new screenshot.';
    case 'replay':
    case 'paid':
      return 'This payment screenshot has already been used to activate Pro.';
    default:
      return "Couldn't activate from this screenshot. Contact support: hello@eastern.ai";
  }
}
