/**
 * Delivery batching.
 *
 * Owner command:
 *   DELIVERIES                  list today's deliveries grouped by hostel/zone
 *
 * Cron worker (called by scheduler/index.ts at 11:00 local):
 *   runDeliveryBatch()          DMs each owner an optimized run for the day
 */
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { localTime } from '../lib/time.js';

interface DeliveryRow {
  id: string;
  state: string;
  delivery_addr: string | null;
  total_amount: number | null;
  customer_phone: string | null;
  customer_name: string | null;
}

export async function cmdDeliveries(user_id: string): Promise<string> {
  const text = await buildDeliveryReport(user_id);
  return text ?? 'No deliveries scheduled for today.';
}

export async function runDeliveryBatch(): Promise<void> {
  const { data: tenants } = await supabase
    .from('business_settings')
    .select('user_id, timezone')
    .order('user_id');
  if (!tenants) return;

  for (const t of tenants) {
    const { hour } = localTime(t.timezone);
    if (hour !== 11) continue;

    const report = await buildDeliveryReport(t.user_id);
    if (!report) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', t.user_id)
      .single();
    if (!profile?.phone) continue;

    await send({
      user_id: t.user_id,
      to: profile.phone,
      message: report,
      type: 'text',
      force: true,
      idempotency_key: `delivery-batch-${t.user_id}-${todayISO()}`,
    });
  }
}

async function buildDeliveryReport(user_id: string): Promise<string | null> {
  const today = todayISO();
  const { data: orders } = await supabase
    .from('orders')
    .select('id, state, delivery_addr, total_amount, customer_id')
    .eq('user_id', user_id)
    .eq('delivery_date', today)
    .in('state', ['confirmed', 'paid', 'preparing']);

  if (!orders || orders.length === 0) return null;

  // Hydrate customer names
  const customerIds = orders.map((o) => o.customer_id).filter((x): x is string => !!x);
  const { data: customers } = await supabase
    .from('customers')
    .select('id, display_name, phone')
    .in('id', customerIds.length > 0 ? customerIds : ['00000000-0000-0000-0000-000000000000']);
  const byId = new Map((customers ?? []).map((c) => [c.id, c]));

  const enriched: DeliveryRow[] = orders.map((o) => {
    const c = o.customer_id ? byId.get(o.customer_id) : undefined;
    return {
      id: o.id,
      state: o.state,
      delivery_addr: o.delivery_addr,
      total_amount: o.total_amount ? Number(o.total_amount) : null,
      customer_phone: c?.phone ?? null,
      customer_name: c?.display_name ?? null,
    };
  });

  // Group by hostel/zone
  const byHostel = new Map<string, DeliveryRow[]>();
  for (const o of enriched) {
    const key = (o.delivery_addr ?? 'No address').trim() || 'No address';
    const list = byHostel.get(key) ?? [];
    list.push(o);
    byHostel.set(key, list);
  }

  // Sort hostels alphabetically (cheap proxy for "consistent route")
  const sortedHostels = [...byHostel.keys()].sort();

  const lines: string[] = [
    `🚚 Today's deliveries — ${enriched.length} order${enriched.length === 1 ? '' : 's'}`,
    '',
  ];
  let total = 0;
  for (const hostel of sortedHostels) {
    const list = byHostel.get(hostel)!;
    lines.push(`📍 ${hostel} (${list.length})`);
    for (const o of list) {
      const who = o.customer_name ?? o.customer_phone ?? 'Customer';
      const amt = o.total_amount != null ? `GHS ${o.total_amount}` : '';
      lines.push(`   • ${who} ${amt}`.trimEnd());
      if (o.total_amount) total += o.total_amount;
    }
    lines.push('');
  }
  lines.push(`Total to collect/confirm: GHS ${total}`);
  lines.push('Tip: deliver clockwise from the closest hostel to save time.');
  return lines.join('\n');
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
