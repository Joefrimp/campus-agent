/**
 * W8 Daily Digest — fires hourly; sends only to tenants whose local time is 19:00.
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { localTime } from '../lib/time.js';

export async function runDigest(): Promise<void> {
  const { data: tenants } = await supabase
    .from('business_settings')
    .select('user_id, timezone, digest_enabled')
    .eq('digest_enabled', true);
  if (!tenants) return;

  for (const t of tenants) {
    const { hour } = localTime(t.timezone);
    if (hour !== 19) continue;

    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const isFriday = localTime(t.timezone).dow === 5;

      const [
        { count: inquiries },
        { data: orders },
        { count: pending },
        { data: lostRows },
        weekData,
      ] = await Promise.all([
        supabase
          .from('agent_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', t.user_id)
          .gt('created_at', yesterday),
        supabase
          .from('orders')
          .select('state, total_amount')
          .eq('user_id', t.user_id)
          .gt('created_at', yesterday),
        supabase
          .from('approval_queue')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', t.user_id)
          .eq('status', 'pending'),
        supabase
          .from('ai_audit')
          .select('id')
          .eq('user_id', t.user_id)
          .eq('workflow', 'W7-lost-lead')
          .gt('created_at', yesterday),
        isFriday ? loadWeekly(t.user_id, lastWeek) : Promise.resolve(null),
      ]);

      const ord = orders ?? [];
      const quotes = ord.filter((o) => o.state === 'quoted').length;
      const paid = ord.filter((o) => o.state === 'paid').length;
      const delivered = ord.filter((o) => o.state === 'delivered').length;
      const revenue = ord
        .filter((o) => o.state === 'paid' || o.state === 'delivered')
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, phone')
        .eq('id', t.user_id)
        .single();
      if (!profile?.phone) continue;

      const promptPayload: Record<string, unknown> = {
        owner_first_name: profile.first_name,
        inquiries: inquiries ?? 0,
        quotes,
        paid,
        delivered,
        revenue,
        pending_approval: pending ?? 0,
        lost: lostRows?.length ?? 0,
      };
      if (weekData) {
        promptPayload.weekly_pnl = {
          revenue: weekData.revenue,
          orders: weekData.orderCount,
          expenses: weekData.expenses,
          net: weekData.revenue - weekData.expenses,
        };
      }

      const systemPrompt =
        'Write a daily evening WhatsApp digest for a Ghanaian campus business owner (≤180 words). Structure: 1) one-line headline ("Strong day" / "Quiet day" / "X need you"); 2) numbers list (inquiries, quotes, paid, delivered, revenue in GHS); 3) if pending_approval > 0, list FIRST under "Needs you 👇"; 4) if lost > 0, mention with a Martell-style nudge; 5) one forward-looking line for tomorrow.' +
        (weekData
          ? ' If a weekly_pnl block is present, append a separate "📊 This week" section with revenue, orders, expenses, net (in GHS).'
          : '') +
        ' Plain text, no markdown.';

      const { text } = await generateText({
        model: models.agent,
        system: systemPrompt,
        prompt: JSON.stringify(promptPayload),
        temperature: 0.5,
        maxTokens: weekData ? 320 : 240,
      });

      await send({
        user_id: t.user_id,
        to: profile.phone,
        message: text.trim(),
        type: 'text',
        force: true,
        idempotency_key: `digest-${t.user_id}-${new Date().toISOString().slice(0, 10)}`,
      });
    } catch {
      // Per-tenant isolation
    }
  }
}

async function loadWeekly(
  user_id: string,
  since: string,
): Promise<{ revenue: number; orderCount: number; expenses: number } | null> {
  const [{ data: orders }, { data: expenses }] = await Promise.all([
    supabase
      .from('orders')
      .select('state, total_amount')
      .eq('user_id', user_id)
      .gte('created_at', since),
    supabase
      .from('expenses')
      .select('amount')
      .eq('user_id', user_id)
      .gte('recorded_at', since),
  ]);
  const closed = (orders ?? []).filter((o) => o.state === 'paid' || o.state === 'delivered');
  return {
    revenue: closed.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
    orderCount: closed.length,
    expenses: (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0),
  };
}
