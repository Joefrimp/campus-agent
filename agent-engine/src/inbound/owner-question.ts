/**
 * Owner Q&A over WhatsApp — "@vector <question>".
 *
 * The owner can ask Vector business questions straight from WhatsApp by
 * prefixing a message with "@vector" (or "vector,"). Works two ways:
 *   - One-number setup: owner uses WhatsApp "Message Yourself" → the
 *     message arrives as from_me=true and we catch it here.
 *   - Two-number setup: owner texts their business agent number from
 *     their personal number → caught in the owner branch.
 *
 * Stateless, read-only. No credits, no threads — just answers. Uses the
 * resilient Gemini→Groq text path so a quota wall doesn't block the owner.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { models, resilientGenerateText } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { buildWeeklyReport } from '../lib/reports.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { sha256 } from '../lib/crypto.js';

// "@vector ...", "vector, ...", "vector: ...", "@vector\n..."
const MENTION_RE = /^\s*@?vector\b[,:\s]+/i;

export function isOwnerQuestion(body: string): boolean {
  return MENTION_RE.test(body ?? '');
}

function stripMention(body: string): string {
  return (body ?? '').trim().replace(MENTION_RE, '').trim();
}

export async function handleOwnerQuestion(args: {
  user_id: string;
  owner_phone: string;
  body: string;
  source_id: string;
}): Promise<void> {
  const question = stripMention(args.body);
  if (!question) {
    await send({
      user_id: args.user_id,
      to: args.owner_phone,
      message:
        'Ask me anything about your business 👇\n' +
        '• "@vector how were sales today?"\n' +
        '• "@vector top 5 customers this week"\n' +
        '• "@vector what\'s in my approvals queue?"\n' +
        '• "@vector draft a Friday promo for my best seller"\n\n' +
        '(Full PDF/Excel reports: dashboard → Finances → Download.)',
      type: 'text',
      force: true,
      idempotency_key: sha256(`owner-q-help|${args.source_id}`),
    });
    return;
  }

  const tools = buildOwnerQuestionTools(args.user_id);
  const fb = models.groqFallback;

  let answer = '';
  try {
    const result = await resilientGenerateText({
      model: models.agent,
      fallbackModel: fb,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
      tools,
      maxSteps: 5,
      temperature: 0.4,
      maxTokens: 600,
    });
    answer = result.text.trim();
  } catch (err) {
    logger.error({ err, user_id: args.user_id }, 'owner-question: generation failed');
    answer = "Couldn't pull that together right now — try again in a moment, or check the dashboard.";
  }

  if (!answer) answer = "I didn't catch that — try rephrasing your question.";

  await send({
    user_id: args.user_id,
    to: args.owner_phone,
    message: answer,
    type: 'text',
    force: true,
    idempotency_key: sha256(`owner-q|${args.source_id}`),
  });

  await audit({
    user_id: args.user_id,
    workflow: 'owner-question',
    input: { question: question.slice(0, 200) },
    output: { answer: answer.slice(0, 400) },
  });
}

const SYSTEM_PROMPT = `You are Vector, talking privately to the business OWNER over WhatsApp (not a customer). They asked you a question prefixed with "@vector".

- You are their operator: candid, concise, founder-to-founder. No corporate fluff.
- Use tools to ground every number in real data. NEVER invent figures.
- If a tool shows there's no data yet, say so plainly — don't fabricate.
- Keep replies WhatsApp-short: 1-4 sentences, or a tight bullet list for rankings. No markdown headers.
- For "report"/"PDF"/"Excel" requests: give the key numbers in the message, then add one line: "Full PDF/Excel: dashboard → Finances → Download."
- For marketing/strategy asks, give a concrete draft or 2-3 specific moves, not generic advice.
- Never mention what model or AI you run on. You are simply Vector.`;

/* ─── Read-only tools ─── */

function buildOwnerQuestionTools(user_id: string) {
  return {
    get_metrics: tool({
      description:
        "Pull the owner's business metrics for a period: revenue, expenses, net, paid/quoted orders, inquiries, new/returning customers, top products, top customers, expense breakdown. Use for any performance/sales/finance question.",
      parameters: z.object({
        period: z.enum(['this_week', 'last_week']).default('this_week'),
      }),
      execute: async ({ period }) => {
        try {
          const weekEnd = period === 'last_week' ? new Date(Date.now() - 7 * 86_400_000) : new Date();
          const d = await buildWeeklyReport(user_id, weekEnd);
          const has = (d.totals.orders_paid + d.totals.orders_quoted + d.totals.inquiries) > 0;
          return {
            ok: true,
            has_data: has,
            totals: d.totals,
            daily: d.daily,
            top_products: d.top_products.slice(0, 5),
            top_customers: d.top_customers.slice(0, 5),
            expense_breakdown: d.expense_breakdown,
          };
        } catch (err) {
          logger.warn({ err }, 'owner-question get_metrics failed');
          return { ok: false, error: 'metrics unavailable' };
        }
      },
    }),

    list_catalogue: tool({
      description: 'List the catalogue with prices + stock. Use for "what am I selling", "what\'s low on stock", "what\'s my catalogue".',
      parameters: z.object({ in_stock_only: z.boolean().default(false) }),
      execute: async ({ in_stock_only }) => {
        let q = supabase
          .from('price_list')
          .select('name, price, in_stock, stock_qty, category, kind')
          .eq('user_id', user_id)
          .order('updated_at', { ascending: false })
          .limit(60);
        if (in_stock_only) q = q.eq('in_stock', true);
        const { data } = await q;
        return { ok: true, count: data?.length ?? 0, items: data ?? [] };
      },
    }),

    search_orders: tool({
      description: 'Search recent orders. Filter by state and/or how many days back. Use for "recent orders", "unpaid orders", "orders this week".',
      parameters: z.object({
        state: z.enum(['quoted', 'confirmed', 'paid', 'cancelled', 'delivered']).optional(),
        since_days: z.number().int().min(1).max(90).optional(),
      }),
      execute: async ({ state, since_days }) => {
        let q = supabase
          .from('orders')
          .select('id, state, total_amount, items, created_at')
          .eq('user_id', user_id)
          .order('created_at', { ascending: false })
          .limit(25);
        if (state) q = q.eq('state', state);
        if (since_days) q = q.gte('created_at', new Date(Date.now() - since_days * 86_400_000).toISOString());
        const { data } = await q;
        return { ok: true, count: data?.length ?? 0, orders: data ?? [] };
      },
    }),

    pending_approvals: tool({
      description: 'List items awaiting the owner\'s approval (payment screenshots, refunds, voice transcripts). Use for "what needs my approval", "anything pending".',
      parameters: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from('approval_queue')
          .select('action_type, drafted_reply, context_summary, customer_phone, created_at')
          .eq('user_id', user_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(20);
        return { ok: true, count: data?.length ?? 0, items: data ?? [] };
      },
    }),
  };
}
