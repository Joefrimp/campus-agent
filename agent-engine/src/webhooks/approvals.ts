/**
 * W9 Owner Approval Queue — write side.
 * Frontend reads via Supabase Realtime directly.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { audit } from '../lib/audit.js';

const Schema = z.object({
  approval_id: z.string().uuid(),
  action: z.enum(['approve', 'edit', 'reject']),
  final_reply: z.string().optional(),
});

export async function handleApprovalResolve(c: Context): Promise<Response> {
  const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid payload' }, 400);
  const { approval_id, action, final_reply } = parsed.data;

  const { data: approval } = await supabase
    .from('approval_queue')
    .select('*')
    .eq('id', approval_id)
    .maybeSingle();
  if (!approval) return c.json({ error: 'not found' }, 404);
  if (approval.status !== 'pending') {
    return c.json({ error: 'already_resolved', status: approval.status }, 409);
  }

  const reply = action === 'edit' ? final_reply ?? approval.drafted_reply : approval.drafted_reply;

  if (action !== 'reject') {
    await send({
      user_id: approval.user_id,
      to: approval.customer_phone,
      message: reply,
      type: 'text',
      force: true,
      idempotency_key: `approve-${approval_id}`,
    });
  }

  await supabase
    .from('approval_queue')
    .update({
      status: action === 'approve' ? 'approved' : action === 'edit' ? 'edited' : 'rejected',
      final_reply: action === 'reject' ? null : reply,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', approval_id);

  // Cascade: refund approval cancels matching open order
  if (approval.action_type === 'refund' && action === 'approve') {
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', approval.user_id)
      .eq('phone', approval.customer_phone)
      .maybeSingle();
    if (customer) {
      await supabase
        .from('orders')
        .update({ state: 'cancelled' })
        .eq('user_id', approval.user_id)
        .eq('customer_id', customer.id)
        .in('state', ['quoted', 'confirmed', 'paid']);
    }
  }

  await audit({
    user_id: approval.user_id,
    workflow: 'W9-resolve',
    input: { approval_id, action },
    output: { reply },
    was_overridden: action === 'edit',
  });

  return c.json({ success: true });
}
