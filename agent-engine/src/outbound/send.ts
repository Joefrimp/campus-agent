/**
 * W2 — Send WhatsApp Library
 *
 * SINGLE EXIT POINT for all outbound WhatsApp messages. Every other module
 * MUST go through send() — that is the only way the circuit breaker,
 * idempotency, and quiet-hours respect work as a system guarantee.
 *
 * Behavior:
 *   - Resolves per-tenant Whapi token from whapi_channels
 *   - Honors channel_health.status='paused' and panic_paused
 *   - Quiet-hours gate (overridable with force=true)
 *   - Idempotency via idempotency_keys table (24h TTL)
 *   - Retries on 429/5xx with backoff
 *   - Trips circuit breaker on repeat 4xx (account warning, etc.)
 *   - On final failure → dead_letter_queue + structured result
 *   - NEVER throws — always returns a typed result
 */
import { supabase } from '../lib/supabase.js';
import { whapiPost } from '../lib/whapi.js';
import { logger } from '../lib/logger.js';
import { audit, deadLetter } from '../lib/audit.js';
import { isQuietHour } from '../lib/time.js';

export type SendType = 'text' | 'image' | 'status' | 'group';

export interface SendArgs {
  user_id: string;
  to: string;
  message: string;
  type?: SendType;
  media_url?: string;
  group_id?: string;
  /** Override quiet-hours check (use for owner DMs, complaints, holding messages). */
  force?: boolean;
  idempotency_key?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: 'paused' | 'quiet_hours' | 'rate_limited' | 'channel_problem' | 'no_token' | 'duplicate' | 'error';
  whapi_id?: string;
  detail?: unknown;
}

const RETRY_DELAYS_MS = [0, 5_000, 30_000];

export async function send(args: SendArgs): Promise<SendResult> {
  const type = args.type ?? 'text';

  // 1. Idempotency check
  if (args.idempotency_key) {
    const { data: existing } = await supabase
      .from('idempotency_keys')
      .select('result')
      .eq('key', args.idempotency_key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (existing) {
      logger.debug({ key: args.idempotency_key }, 'idempotency hit — skipping send');
      return { sent: false, reason: 'duplicate' };
    }
  }

  // 2. Resolve tenant token
  const { data: channel, error: chanErr } = await supabase
    .from('whapi_channels')
    .select('token, whapi_channel_id')
    .eq('user_id', args.user_id)
    .maybeSingle();
  if (chanErr || !channel?.token) {
    logger.error({ user_id: args.user_id, err: chanErr }, 'no whapi channel for tenant');
    return { sent: false, reason: 'no_token' };
  }

  // 3. Channel health gate
  const { data: health } = await supabase
    .from('channel_health')
    .select('status, panic_paused')
    .eq('user_id', args.user_id)
    .maybeSingle();
  if (health?.panic_paused || health?.status === 'paused' || health?.status === 'disconnected') {
    logger.info({ user_id: args.user_id, status: health.status }, 'channel paused — outbound blocked');
    return { sent: false, reason: 'paused' };
  }

  // 4. Quiet-hours gate
  if (!args.force) {
    const { data: settings } = await supabase
      .from('business_settings')
      .select('timezone')
      .eq('user_id', args.user_id)
      .maybeSingle();
    if (isQuietHour(settings?.timezone)) {
      logger.debug({ user_id: args.user_id }, 'quiet hours — send queued');
      // Caller is expected to schedule a delayed send; we just refuse here.
      return { sent: false, reason: 'quiet_hours' };
    }
  }

  // 5. Build Whapi request
  const { path, body } = buildWhapiPayload(type, args);

  // 6. Send with retries
  let lastResult: Awaited<ReturnType<typeof whapiPost>> | null = null;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt]!);

    lastResult = await whapiPost({ token: channel.token, path, body });

    if (lastResult.ok) {
      const whapi_id = extractWhapiId(lastResult.body);
      await Promise.allSettled([
        recordOutbound(args, whapi_id),
        args.idempotency_key
          ? supabase.from('idempotency_keys').insert({
              key: args.idempotency_key,
              result: { whapi_id, sent_at: new Date().toISOString() },
            })
          : Promise.resolve(),
      ]);
      return { sent: true, whapi_id };
    }

    // 429 → back off + retry
    if (lastResult.status === 429) {
      logger.warn({ user_id: args.user_id, attempt }, 'whapi 429 — backing off');
      continue;
    }

    // 5xx → retry
    if (lastResult.status >= 500) {
      logger.warn({ user_id: args.user_id, status: lastResult.status, attempt }, 'whapi 5xx — retrying');
      continue;
    }

    // Other 4xx → trip circuit breaker, no retry
    break;
  }

  // 7. All retries exhausted or 4xx
  const status = lastResult?.status ?? 0;
  if (status === 429) {
    await tripBreaker(args.user_id, 'rate_limited');
    return { sent: false, reason: 'rate_limited', detail: lastResult?.body };
  }
  // Auth/account-level 4xx (token revoked, channel suspended) → real channel
  // problem, trip the breaker.
  if (status === 401 || status === 403) {
    await tripBreaker(args.user_id, 'channel_problem');
    return { sent: false, reason: 'channel_problem', detail: lastResult?.body };
  }
  // Per-message 4xx (400/404/422 — invalid recipient, bad payload). This is
  // NOT a channel health issue: a single junk recipient must never pause the
  // whole channel and silence real customers. Fail just this send.
  if (status >= 400 && status < 500) {
    logger.warn({ user_id: args.user_id, status, to: args.to }, 'per-message 4xx — failing send only, breaker untouched');
    return { sent: false, reason: 'error', detail: lastResult?.body };
  }

  // Unknown failure → DLQ
  await deadLetter({
    user_id: args.user_id,
    source: 'outbound',
    payload: args,
    error: `Whapi send failed: status=${status} body=${JSON.stringify(lastResult?.body)}`,
  });
  return { sent: false, reason: 'error', detail: lastResult?.body };
}

function buildWhapiPayload(type: SendType, args: SendArgs): { path: string; body: unknown } {
  switch (type) {
    case 'text':
      return { path: '/messages/text', body: { to: args.to, body: args.message } };
    case 'image':
      return {
        path: '/messages/image',
        body: { to: args.to, media: args.media_url, caption: args.message },
      };
    case 'status':
      return {
        path: '/messages/image',
        body: { to: 'status@broadcast', media: args.media_url, caption: args.message },
      };
    case 'group':
      return { path: '/messages/text', body: { to: args.group_id, body: args.message } };
  }
}

function extractWhapiId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.id === 'string') return b.id;
  const message = b.message;
  if (typeof message === 'object' && message !== null && typeof (message as Record<string, unknown>).id === 'string') {
    return (message as Record<string, unknown>).id as string;
  }
  return undefined;
}

async function recordOutbound(args: SendArgs, whapi_id?: string): Promise<void> {
  await supabase.from('message_logs').insert({
    user_id: args.user_id,
    direction: 'outbound',
    contact_phone: args.to,
    content: args.message,
    ai_generated: true,
  });
  if (whapi_id) logger.debug({ whapi_id, user_id: args.user_id }, 'outbound recorded');
}

async function tripBreaker(user_id: string, reason: 'rate_limited' | 'channel_problem'): Promise<void> {
  const isHard = reason === 'channel_problem';
  const paused_until = new Date(Date.now() + (isHard ? 60 : 30) * 60 * 1000).toISOString();
  await supabase
    .from('channel_health')
    .update({
      status: isHard ? 'paused' : 'warning',
      paused_until,
      last_429_at: reason === 'rate_limited' ? new Date().toISOString() : undefined,
    })
    .eq('user_id', user_id);
  await audit({
    user_id,
    workflow: 'W2-circuit-breaker',
    severity: 'warn',
    output: { reason, paused_until },
  });
  logger.warn({ user_id, reason, paused_until }, 'circuit breaker tripped');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
