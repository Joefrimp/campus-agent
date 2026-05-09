/**
 * Owner WhatsApp commands for finance.
 *
 *   EXPENSE <amount> <description>     log a business expense
 *   EARNINGS TODAY|WEEK|MONTH          revenue / profit summary for window
 *   EARNINGS                           same as EARNINGS TODAY
 */
import { supabase } from '../lib/supabase.js';

export async function cmdExpense(user_id: string, args: string): Promise<string> {
  const m = args.trim().match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (!m) return 'Use: EXPENSE <amount> <description>. Example: EXPENSE 50 supplier delivery';
  const amount = Number(m[1]);
  const description = m[2]!.trim();
  if (!Number.isFinite(amount) || amount < 0) return 'Amount must be a non-negative number.';

  const { error } = await supabase.from('expenses').insert({
    user_id,
    amount,
    description,
    category: classifyExpense(description),
  });
  if (error) return `Could not log: ${error.message}`;
  return `✅ Logged GHS ${amount} — ${description}.`;
}

export async function cmdEarnings(user_id: string, args: string): Promise<string> {
  const window = parseWindow(args);
  const since = windowStart(window);

  const [{ data: orders }, { data: expenses }] = await Promise.all([
    supabase
      .from('orders')
      .select('state, total_amount, items')
      .eq('user_id', user_id)
      .gte('created_at', since.toISOString()),
    supabase
      .from('expenses')
      .select('amount, description, category')
      .eq('user_id', user_id)
      .gte('recorded_at', since.toISOString()),
  ]);

  const closed = (orders ?? []).filter((o) => o.state === 'paid' || o.state === 'delivered');
  const revenue = closed.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const orderCount = closed.length;
  const totalExpenses = (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const net = revenue - totalExpenses;

  const lines = [
    `💰 Earnings (${window})`,
    `Revenue: GHS ${fmt(revenue)} (${orderCount} orders)`,
  ];
  if (totalExpenses > 0) {
    lines.push(`Expenses: GHS ${fmt(totalExpenses)}`);
    lines.push(`Net: GHS ${fmt(net)}`);
  } else {
    lines.push('Expenses: GHS 0 (log them with EXPENSE <amount> <desc>)');
  }
  return lines.join('\n');
}

function parseWindow(args: string): 'today' | 'week' | 'month' {
  const w = args.trim().toLowerCase();
  if (w.startsWith('week')) return 'week';
  if (w.startsWith('month')) return 'month';
  return 'today';
}

function windowStart(w: 'today' | 'week' | 'month'): Date {
  const now = new Date();
  if (w === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (w === 'week') return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function classifyExpense(desc: string): string {
  const d = desc.toLowerCase();
  if (/(supplier|stock|inventory|wholesale)/.test(d)) return 'inventory';
  if (/(delivery|transport|fuel|trotro|uber|bolt)/.test(d)) return 'delivery';
  if (/(packag|wrap|bag)/.test(d)) return 'packaging';
  if (/(advert|ad|boost|flier|flyer|promo)/.test(d)) return 'marketing';
  return 'other';
}

function fmt(n: number): string {
  return n.toFixed(2).replace(/\.00$/, '');
}
