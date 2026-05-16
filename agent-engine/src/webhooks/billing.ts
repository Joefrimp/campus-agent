/**
 * Pro plan billing endpoints.
 *
 * Public (no shared-secret):
 *   GET  /config/pro-payment              — MoMo number, name, price, activation phone
 *
 * Frontend (X-Eastern-AI-Secret):
 *   POST /billing/start-upgrade           { user_id, duration_months? }
 *   GET  /billing/activation-status       ?user_id=...&code=...
 *   POST /billing/cancel-upgrade          { user_id, code }
 *
 * Whapi (Eastern AI activation channel posts inbound here):
 *   POST /billing/activation-webhook
 *
 * Admin (HMAC-signed body):
 *   POST /admin/grant-pro                 { user_id, duration_months, reason }
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import {
  getOperatorConfig,
  startUpgrade,
  getActivationStatus,
  cancelActivation,
  tryActivateFromScreenshot,
  manualGrantPro,
  type ScreenshotExtraction,
} from '../billing/activation.js';
import { models } from '../lib/gemini.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { hmacSha256, safeEqual } from '../lib/crypto.js';

/* ─── Public config ─── */

export async function handleProPaymentConfig(c: Context): Promise<Response> {
  const op = await getOperatorConfig();
  // Don't leak the activation Whapi token or anything sensitive.
  return c.json({
    momo_number: op.momo_number,
    momo_account_name: op.momo_account_name,
    pro_price_ghs: op.pro_price_ghs,
    activation_whatsapp: op.activation_whatsapp,
    activation_minutes: op.activation_minutes,
    configured: !!(op.momo_number && op.activation_whatsapp),
  });
}

/* ─── Frontend: start / status / cancel ─── */

const StartSchema = z.object({
  user_id: z.string().uuid(),
  duration_months: z.number().int().min(1).max(24).optional().default(1),
});

export async function handleStartUpgrade(c: Context): Promise<Response> {
  const parsed = StartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ success: false, error: 'invalid payload' }, 400);

  const op = await getOperatorConfig();
  if (!op.momo_number || !op.activation_whatsapp) {
    return c.json(
      {
        success: false,
        error: 'Pro upgrades not configured yet. Owner must set MoMo details first.',
      },
      200,
    );
  }

  try {
    const result = await startUpgrade(parsed.data.user_id, parsed.data.duration_months);
    return c.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err }, 'start-upgrade failed');
    return c.json({ success: false, error: 'Could not start upgrade' }, 200);
  }
}

const StatusSchema = z.object({
  user_id: z.string().uuid(),
  code: z.string().min(8).max(20),
});

export async function handleActivationStatus(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  const code = c.req.query('code') ?? '';
  const parsed = StatusSchema.safeParse({ user_id, code });
  if (!parsed.success)
    return c.json({ success: false, error: 'invalid query' }, 400);

  const row = await getActivationStatus(parsed.data.user_id, parsed.data.code);
  if (!row) return c.json({ success: false, error: 'not found' }, 200);
  return c.json({
    success: true,
    code: row.code,
    status: row.status,
    expires_at: row.expires_at,
    matched_at: row.matched_at,
  });
}

const CancelSchema = z.object({
  user_id: z.string().uuid(),
  code: z.string().min(8).max(20),
});

export async function handleCancelUpgrade(c: Context): Promise<Response> {
  const parsed = CancelSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ success: false, error: 'invalid payload' }, 400);
  await cancelActivation(parsed.data.user_id, parsed.data.code);
  return c.json({ success: true });
}

/* ─── Whapi: activation channel inbound ─── */

const OcrSchema = z.object({
  is_payment_screenshot: z.boolean(),
  amount: z.number().nullable(),
  reference: z.string().nullable(),
  txn_id: z.string().nullable(),
  recipient_visible: z.string().nullable(),
  network: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const OCR_PROMPT = `Look at this image. If it's a Ghanaian Mobile Money (MoMo) confirmation screenshot, bank transfer receipt, or any payment confirmation, extract STRICTLY:
- amount: the GHS amount sent (number only, no currency symbol)
- reference: the reference / reason / message field (free text — may include codes like "VEC-XXXX-XXXX")
- txn_id: the transaction ID / reference number assigned by the network
- recipient_visible: the recipient phone number or name visible on screen
- network: MTN | Vodafone | AirtelTigo | Bank | Other
- confidence: 0..1

If it is NOT a payment screenshot, set is_payment_screenshot=false. Be strict — only true if you see "Sent", "Successful", "Transfer", or a transaction ID.`;

export async function handleActivationWebhook(c: Context): Promise<Response> {
  // Whapi sends the same event shape as the tenant inbound webhook.
  const body = (await c.req.json().catch(() => null)) as {
    messages?: Array<{
      id?: string;
      from?: string;
      type?: string;
      image?: { id?: string; link?: string; mime_type?: string };
      text?: { body?: string };
    }>;
  } | null;

  const msgs = body?.messages ?? [];
  if (!msgs.length) return c.json({ ok: true, ignored: 'no messages' });

  for (const m of msgs) {
    if (m.type !== 'image' || !m.image?.id) {
      // Plain text fallback: maybe they typed the code. We could parse later.
      continue;
    }

    // Fetch image bytes from Whapi (uses the activation channel token)
    const bytes = await downloadActivationMedia(m.image.id);
    if (!bytes) {
      logger.warn({ id: m.image.id }, 'activation: media download failed');
      continue;
    }

    // OCR
    let ocr: z.infer<typeof OcrSchema>;
    try {
      const { object } = await generateObject({
        model: models.agent,
        schema: OcrSchema,
        system: OCR_PROMPT,
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
      ocr = object;
    } catch (err) {
      logger.warn({ err }, 'activation OCR threw');
      await replyToActivator(m.from, 'Sorry — could not read your screenshot. Please re-send a clearer one.');
      continue;
    }

    if (!ocr.is_payment_screenshot || ocr.confidence < 0.5) {
      await replyToActivator(m.from, "That doesn't look like a MoMo confirmation. Please forward the actual success screenshot.");
      continue;
    }

    const extraction: ScreenshotExtraction = {
      amount: ocr.amount,
      reference: ocr.reference,
      recipient_visible: ocr.recipient_visible,
      txn_id: ocr.txn_id,
      network: ocr.network,
      raw: ocr,
    };
    const outcome = await tryActivateFromScreenshot(extraction);

    if (outcome.matched) {
      await replyToActivator(
        m.from,
        `✅ Pro activated! Welcome to Vector Pro.\n\nCode: ${outcome.code}\nThank you for upgrading 🚀`,
      );
    } else {
      const friendly = explainRejection(outcome.reason);
      await replyToActivator(m.from, friendly);
    }
  }

  return c.json({ ok: true });
}

function explainRejection(reason?: string): string {
  switch (reason) {
    case 'no_amount':
      return "Couldn't read the amount on your screenshot. Re-send a clearer one.";
    case 'wrong_recipient':
      return "The recipient on this screenshot doesn't match our MoMo number. Did you send to the right number?";
    case 'no_code':
      return "We couldn't find a VEC-XXXX-XXXX activation code in the reference. Make sure you used the code shown on your dashboard as the MoMo reference.";
    case 'unknown_code':
      return "That activation code isn't recognised. Generate a new one in your dashboard and try again.";
    case 'expired':
      return 'That activation code expired. Click "Go Pro" in your dashboard to get a fresh one.';
    case 'underpaid':
      return "The amount paid is less than the Pro price. Top up the difference and re-forward the new screenshot.";
    case 'replay':
    case 'paid':
      return 'This payment screenshot has already been used to activate Pro.';
    default:
      return "Couldn't activate from this screenshot. Contact support: hello@eastern.ai";
  }
}

async function downloadActivationMedia(mediaId: string): Promise<Uint8Array | null> {
  const token = config.EASTERN_AI_ACTIVATION_WHAPI_TOKEN;
  if (!token) return null;
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

async function replyToActivator(to: string | undefined, message: string): Promise<void> {
  if (!to) return;
  const token = config.EASTERN_AI_ACTIVATION_WHAPI_TOKEN;
  if (!token) return;
  try {
    await fetch(`${config.WHAPI_BASE_URL}/messages/text`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: to.replace(/\D/g, ''), body: message }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.warn({ err }, 'activation reply failed');
  }
}

/* ─── Admin manual grant (HMAC) ─── */

const GrantSchema = z.object({
  user_id: z.string().uuid(),
  duration_months: z.number().int().min(1).max(24).default(1),
  reason: z.string().optional().default('admin_grant'),
});

export async function handleManualGrantPro(c: Context): Promise<Response> {
  const raw = await c.req.text();
  const sig = c.req.header('x-admin-sig') ?? '';
  const expected = hmacSha256(config.ADMIN_HMAC_SECRET, raw);
  if (!safeEqual(sig, expected)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const parsed = GrantSchema.safeParse(JSON.parse(raw || '{}'));
  if (!parsed.success)
    return c.json({ success: false, error: 'invalid payload' }, 400);
  await manualGrantPro(
    parsed.data.user_id,
    parsed.data.duration_months,
    parsed.data.reason,
  );
  return c.json({ success: true });
}
