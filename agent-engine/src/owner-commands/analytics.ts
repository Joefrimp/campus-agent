/**
 * Owner WhatsApp commands for business intelligence.
 *
 *   BEST SELLER WEEK|MONTH      top products by units / revenue
 *   TOP CUSTOMER WEEK|MONTH     top customers by lifetime spend in window
 *   CONVERSION RATE             inquiries → quotes → paid funnel
 *   TODAY                       quick summary of last 24h
 */
import { supabase } from '../lib/supabase.js';

type Window = 'week' | 'month';

export async function cmdBestSeller(user_id: string, args: string): Promise<string> {
  const window = parseWindow(args);
  const since = windowStart(window).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('items, total_amount, state, created_at')
    .eq('user_id', user_id)
    .in('state', ['paid', 'delivered'])
    .gte('created_at', since);

  if (!orders || orders.length === 0) return `No paid orders in the last ${window}.`;

  const tally = new Map<string, { qty: number; revenue: number }>();
  for (const o of orders) {
    const items = (o.items ?? []) as Array<{ name?: string; qty?: number; price?: number }>;
    for (const it of items) {
      if (!it.name) continue;
      const t = tally.get(it.name) ?? { qty: 0, revenue: 0 };
      t.qty += it.qty ?? 1;
      t.revenue += (it.qty ?? 1) * (it.price ?? 0);
      tally.set(it.name, t);
    }
  }

  if (tally.size === 0) return `No itemized sales in the last ${window}.`;

  const sorted = [...tally.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const lines = sorted.map(([name, t], i) => `${i + 1}. ${name} — ${t.qty} sold, GHS ${t.revenue.toFixed(0)}`);
  return `🏆 Best sellers (${window}):\n${lines.join('\n')}`;
}

export async function cmdTopCustomer(user_id: string, args: string): Promise<string> {
  const window = parseWindow(args);
  const since = windowStart(window).toISOString();

  const { data: orders } = await supabase
    .from('orders')
    .select('customer_id, total_amount, state, created_at')
    .eq('user_id', user_id)
    .in('state', ['paid', 'delivered'])
    .gte('created_at', since);

  if (!orders || orders.length === 0) return `No paid orders in the last ${window}.`;

  const tally = new Map<string, number>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    tally.set(o.customer_id, (tally.get(o.customer_id) ?? 0) + Number(o.total_amount ?? 0));
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length === 0) return `No identified customers in the last ${window}.`;

  const ids = top.map(([id]) => id);
  const { data: customers } = await supabase
    .from('customers')
    .select('id, display_name, phone, hostel')
    .in('id', ids);
  const byId = new Map((customers ?? []).map((c) => [c.id, c]));
  const lines = top.map(([id, spend], i) => {
    const c = byId.get(id);
    const label = c?.display_name ?? c?.phone ?? id.slice(0, 6);
    const hostel = c?.hostel ? ` (${c.hostel})` : '';
    return `${i + 1}. ${label}${hostel} — GHS ${spend.toFixed(0)}`;
  });
  return `⭐ Top customers (${window}):\n${lines.join('\n')}`;
}

export async function cmdConversion(user_id: string): Promise<string> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: inquiries }, { data: orders }] = await Promise.all([
    supabase
      .from('agent_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gte('created_at', since),
    supabase
      .from('orders')
      .select('state, created_at')
      .eq('user_id', user_id)
      .gte('created_at', since),
  ]);

  const ord = orders ?? [];
  const quoted = ord.filter((o) => ['quoted', 'confirmed', 'paid', 'delivered'].includes(o.state)).length;
  const paid = ord.filter((o) => ['paid', 'delivered'].includes(o.state)).length;

  const inq = inquiries ?? 0;
  const inqToQuote = inq > 0 ? ((quoted / inq) * 100).toFixed(1) : '–';
  const quoteToPaid = quoted > 0 ? ((paid / quoted) * 100).toFixed(1) : '–';
  const inqToPaid = inq > 0 ? ((paid / inq) * 100).toFixed(1) : '–';

  return [
    `📊 Conversion (last 30 days)`,
    `Inquiries: ${inq}`,
    `Quoted: ${quoted}  (${inqToQuote}% of inquiries)`,
    `Paid: ${paid}  (${quoteToPaid}% of quotes)`,
    `Overall: ${inqToPaid}% inquiry → paid`,
  ].join('\n');
}

export async function cmdToday(user_id: string): Promise<string> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count: inq }, { data: orders }, { count: pending }] = await Promise.all([
    supabase
      .from('agent_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gt('created_at', yesterday),
    supabase.from('orders').select('state, total_amount').eq('user_id', user_id).gt('created_at', yesterday),
    supabase
      .from('approval_queue')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('status', 'pending'),
  ]);
  const closed = (orders ?? []).filter((o) => ['paid', 'delivered'].includes(o.state));
  const revenue = closed.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  return `Today so far: ${inq ?? 0} inquiries · ${closed.length} paid · GHS ${revenue} · ${pending ?? 0} need you.`;
}

function parseWindow(args: string): Window {
  return args.trim().toLowerCase().startsWith('month') ? 'month' : 'week';
}
function windowStart(w: Window): Date {
  return new Date(Date.now() - (w === 'month' ? 30 : 7) * 24 * 60 * 60 * 1000);
}
