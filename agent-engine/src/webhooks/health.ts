/**
 * W13 Health endpoint — public, no auth.
 * External monitors (UptimeRobot etc.) hit this to know if the agent is alive.
 */
import type { Context } from 'hono';
import { supabase } from '../lib/supabase.js';

export async function handleHealth(c: Context): Promise<Response> {
  try {
    const [{ count: tenants }, { data: lastInbound }, { count: paused }, { count: dlq }] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).in('plan', ['trial', 'pro']),
      supabase
        .from('message_logs')
        .select('created_at')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('channel_health').select('*', { count: 'exact', head: true }).eq('status', 'paused'),
      supabase.from('dead_letter_queue').select('*', { count: 'exact', head: true }).eq('resolved', false),
    ]);

    const dlq_pending = dlq ?? 0;
    const paused_channels = paused ?? 0;
    let status: 'ok' | 'degraded' = 'ok';
    if (dlq_pending > 50 || paused_channels > 0) status = 'degraded';

    return c.json({
      status,
      timestamp: new Date().toISOString(),
      tenants_active: tenants ?? 0,
      last_inbound_at: lastInbound?.created_at ?? null,
      paused_channels,
      dlq_pending,
    });
  } catch (err) {
    return c.json(
      { status: 'down', timestamp: new Date().toISOString(), error: (err as Error).message },
      200,
    );
  }
}
