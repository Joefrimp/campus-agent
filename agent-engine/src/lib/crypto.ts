/**
 * Crypto helpers — hashing for idempotency keys, HMAC for admin endpoints.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Constant-time comparison to prevent timing attacks on signature checks. */
export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/** Idempotency key for outbound messages: hash of (user, recipient, message, hour). */
export function idempotencyKey(parts: { user_id: string; to: string; message: string }): string {
  const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return sha256(`${parts.user_id}|${parts.to}|${parts.message}|${hourBucket}`);
}
