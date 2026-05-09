/**
 * W15 Whapi Channel Status Hook — Whapi posts channel events here.
 */
import type { Context } from 'hono';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

export async function handleChannelStatus(c: Context): Promise<Response> {
  const body = (await c.req.json().catch(() => ({}))) as { channel_id?: string; status?: string; qr_code_url?: string };
  if (!body.channel_id) return c.json({ ok: true });

  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('user_id, status')
    .eq('whapi_channel_id', body.channel_id)
    .maybeSingle();
  if (!channel) return c.json({ ok: true });

  const newWhapiStatus = body.status ?? 'unknown';
  await supabase
    .from('whapi_channels')
    .update({ status: mapWhapiStatus(newWhapiStatus), qr_code_url: body.qr_code_url ?? null })
    .eq('whapi_channel_id', body.channel_id);

  // Update channel_health
  let healthStatus: 'healthy' | 'warning' | 'disconnected' = 'healthy';
  if (newWhapiStatus === 'qr' || newWhapiStatus === 'initializing') healthStatus = 'warning';
  if (newWhapiStatus === 'disconnected' || newWhapiStatus === 'failed') healthStatus = 'disconnected';

  await supabase.from('channel_health').update({ status: healthStatus }).eq('user_id', channel.user_id);

  logger.info({ user_id: channel.user_id, newStatus: newWhapiStatus }, 'channel status updated');
  return c.json({ ok: true });
}

function mapWhapiStatus(s: string): 'pending' | 'initializing' | 'authorized' | 'disconnected' {
  if (s === 'authorized' || s === 'connected') return 'authorized';
  if (s === 'qr' || s === 'initializing') return 'initializing';
  if (s === 'disconnected' || s === 'failed') return 'disconnected';
  return 'pending';
}
