/**
 * W10 Circuit Breaker Watcher — every 5 min.
 * Auto-recovers paused/warning channels once the cooldown window passes.
 */
import { supabase } from '../lib/supabase.js';

export async function runCircuitWatcher(): Promise<void> {
  const now = new Date().toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1. Auto-unpause expired holds (but never override panic_paused)
  await supabase
    .from('channel_health')
    .update({ status: 'healthy', consecutive_errors: 0 })
    .eq('status', 'paused')
    .eq('panic_paused', false)
    .lte('paused_until', now);

  // 2. Clear warning state once last 429 is >1h old
  await supabase
    .from('channel_health')
    .update({ status: 'healthy' })
    .eq('status', 'warning')
    .lt('last_429_at', oneHourAgo);
}
