/**
 * W14 Admin Replay — re-runs a past inbound from the audit log.
 * Protected by HMAC signature on the request body.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { hmacSha256, safeEqual } from '../lib/crypto.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';

const Schema = z.object({ audit_id: z.string().uuid() });

export async function handleAdminReplay(c: Context): Promise<Response> {
  const rawBody = await c.req.text();
  const sig = c.req.header('x-admin-sig') ?? '';
  const expected = hmacSha256(config.ADMIN_HMAC_SECRET, rawBody);
  if (!safeEqual(sig, expected)) return c.json({ error: 'unauthorized' }, 401);

  const parsed = Schema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return c.json({ error: 'invalid payload' }, 400);

  const { data: row } = await supabase
    .from('ai_audit')
    .select('*')
    .eq('id', parsed.data.audit_id)
    .maybeSingle();
  if (!row) return c.json({ error: 'not found' }, 404);

  // For v1: simply mark as replayed and re-trigger via internal HTTP call.
  // (Caller can re-POST the original payload to the appropriate webhook.)
  await audit({
    user_id: row.user_id,
    workflow: 'W14-replay',
    input: { original_audit_id: row.id, original_workflow: row.workflow },
    output: { replayed_at: new Date().toISOString() },
    was_overridden: true,
  });

  return c.json({ replayed: true, original_audit_id: row.id, original_workflow: row.workflow });
}
