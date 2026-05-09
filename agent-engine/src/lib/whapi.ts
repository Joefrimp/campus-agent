/**
 * Low-level Whapi HTTP client.
 * High-level send logic with circuit breaker + idempotency lives in outbound/send.ts.
 * NEVER call this directly from agent paths — always go through outbound/send.ts.
 */
import { config } from '../config.js';
import { logger } from './logger.js';

export interface WhapiResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

interface SendArgs {
  /** Per-tenant token (resolved from whapi_channels at call time). */
  token: string;
  path: string;
  body: unknown;
}

export async function whapiPost({ token, path, body }: SendArgs): Promise<WhapiResponse> {
  const url = `${config.WHAPI_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON response, keep as text
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    logger.error({ err, path }, 'whapi request failed');
    return { ok: false, status: 0, body: { error: (err as Error).message } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mark a message as read so the customer sees ✓✓.
 * Whapi: PUT /messages/{MessageID} with {"status": "read"}.
 * Fire-and-forget: failures are logged but never thrown.
 */
export async function whapiMarkRead(token: string, message_id: string): Promise<void> {
  const url = `${config.WHAPI_BASE_URL}/messages/${encodeURIComponent(message_id)}`;
  try {
    await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'read' }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    logger.debug({ err, message_id }, 'whapi mark-read failed (non-fatal)');
  }
}

export async function whapiGet({ token, path }: { token: string; path: string }): Promise<WhapiResponse> {
  const url = `${config.WHAPI_BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep as text */
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    return { ok: false, status: 0, body: { error: (err as Error).message } };
  } finally {
    clearTimeout(timer);
  }
}
