/**
 * Tools the owner-chat agent can call. Read-only on production data
 * plus file generators. Every successful tool call increments
 * ctx.tool_call_count which the handler uses for credit math.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import {
  buildWeeklyReport,
  renderWeeklyReportPdf,
  renderWeeklyReportXlsx,
} from '../lib/reports.js';
import { renderBusinessDocx } from './docx.js';
import { logger } from '../lib/logger.js';

export interface OwnerToolContext {
  user_id: string;
  thread_id: string;
  tool_call_count: number;
  file_count: number;
  attachments: Array<{ type: string; filename: string; url: string; size_bytes: number }>;
}

export function buildOwnerTools(ctx: OwnerToolContext) {
  return {
    read_business_metrics: tool({
      description:
        "Pull the owner's recent business metrics (revenue, expenses, net, orders, inquiries, top products, top customers). Use whenever the owner asks about performance, trends, or sales numbers. Period defaults to 'this_week'.",
      parameters: z.object({
        period: z.enum(['today', 'this_week', 'last_week', 'this_month']).default('this_week'),
      }),
      execute: async ({ period }) => {
        const weekEnd = period === 'last_week'
          ? new Date(Date.now() - 7 * 86_400_000)
          : new Date();
        try {
          const data = await buildWeeklyReport(ctx.user_id, weekEnd);
          ctx.tool_call_count++;
          return {
            ok: true,
            period,
            totals: data.totals,
            daily: data.daily,
            top_products: data.top_products.slice(0, 5),
            top_customers: data.top_customers.slice(0, 5),
            expense_breakdown: data.expense_breakdown,
          };
        } catch (err) {
          logger.warn({ err }, 'read_business_metrics failed');
          return { ok: false, error: 'could not load metrics' };
        }
      },
    }),

    generate_report: tool({
      description:
        "Generate a downloadable weekly business report file. Use when the owner asks for a 'report', 'PDF', 'spreadsheet', 'doc', or anything they could download or print. The file is uploaded to storage and a download link is attached to your reply.",
      parameters: z.object({
        format: z.enum(['pdf', 'xlsx', 'docx']).describe("'pdf' for visual summary, 'xlsx' for raw spreadsheet, 'docx' for editable Word doc"),
        title_hint: z.string().optional().describe("Optional title for the doc (e.g. 'Sales report — Week 19')"),
      }),
      execute: async ({ format, title_hint }) => {
        try {
          const data = await buildWeeklyReport(ctx.user_id, new Date());
          let buf: Buffer;
          let mime: string;
          if (format === 'pdf') {
            buf = await renderWeeklyReportPdf(data);
            mime = 'application/pdf';
          } else if (format === 'xlsx') {
            buf = await renderWeeklyReportXlsx(data);
            mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          } else {
            buf = await renderBusinessDocx(data, title_hint);
            mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          }
          const filename = (title_hint ?? `weekly-${new Date().toISOString().slice(0, 10)}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 50) + '.' + format;
          const path = `${ctx.user_id}/owner-chat/${ctx.thread_id}/${Date.now()}-${filename}`;
          const { error: upErr } = await supabase.storage
            .from('product-images')
            .upload(path, buf, { contentType: mime, cacheControl: '3600', upsert: false });
          if (upErr) {
            logger.warn({ err: upErr }, 'generate_report upload failed');
            return { ok: false, error: upErr.message };
          }
          const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);
          ctx.tool_call_count++;
          ctx.file_count++;
          ctx.attachments.push({
            type: format,
            filename,
            url: pub.publicUrl,
            size_bytes: buf.length,
          });
          return {
            ok: true,
            format,
            filename,
            url: pub.publicUrl,
            instruction: 'Tell the owner the file is ready and link to it briefly. Do NOT paste the full URL into the reply text — the system already attached it.',
          };
        } catch (err) {
          logger.warn({ err }, 'generate_report failed');
          return { ok: false, error: 'could not build report' };
        }
      },
    }),

    search_orders: tool({
      description:
        "Search the owner's order history. Use when they ask about a specific customer, date range, or order state.",
      parameters: z.object({
        customer_phone: z.string().optional(),
        state: z.enum(['quoted', 'confirmed', 'paid', 'cancelled', 'delivered']).optional(),
        since_days: z.number().int().min(1).max(365).optional().describe('Only orders from the last N days'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async (args) => {
        let q = supabase
          .from('orders')
          .select('id, state, total_amount, items, created_at, customer_id, customers(display_name, phone)')
          .eq('user_id', ctx.user_id)
          .order('created_at', { ascending: false })
          .limit(args.limit);
        if (args.state) q = q.eq('state', args.state);
        if (args.since_days) q = q.gte('created_at', new Date(Date.now() - args.since_days * 86_400_000).toISOString());
        const { data } = await q;
        ctx.tool_call_count++;
        // Supabase typed the embedded `customers` as an array even though
        // the FK relation is one-to-one — accept either shape.
        type OrderRow = { customers?: { phone?: string } | Array<{ phone?: string }> };
        const phoneOf = (o: OrderRow): string => {
          const c = o.customers;
          if (!c) return '';
          if (Array.isArray(c)) return c[0]?.phone ?? '';
          return c.phone ?? '';
        };
        const filtered = args.customer_phone
          ? (data ?? []).filter((o) => phoneOf(o as OrderRow).includes(args.customer_phone!))
          : (data ?? []);
        return { ok: true, count: filtered.length, orders: filtered };
      },
    }),

    list_catalogue: tool({
      description: "List the owner's current product catalogue with prices and stock.",
      parameters: z.object({
        in_stock_only: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      execute: async ({ in_stock_only, limit }) => {
        let q = supabase
          .from('price_list')
          .select('name, price, min_price, in_stock, stock_qty, category, kind')
          .eq('user_id', ctx.user_id)
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (in_stock_only) q = q.eq('in_stock', true);
        const { data } = await q;
        ctx.tool_call_count++;
        return { ok: true, count: data?.length ?? 0, items: data ?? [] };
      },
    }),

    pending_approvals: tool({
      description: "List items awaiting the owner's approval (payment screenshots, refund requests, voice transcripts).",
      parameters: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from('approval_queue')
          .select('id, action_type, drafted_reply, context_summary, customer_phone, created_at')
          .eq('user_id', ctx.user_id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(20);
        ctx.tool_call_count++;
        return { ok: true, count: data?.length ?? 0, items: data ?? [] };
      },
    }),

    draft_marketing_message: tool({
      description:
        "Write a short marketing message the owner can send to customers or a WhatsApp group. Use when they ask for promo copy, a launch announcement, or a re-engagement message.",
      parameters: z.object({
        goal: z.string().describe("What the message is for (e.g. 'announce a 10% Friday discount on hair products')"),
        tone: z.enum(['casual', 'professional', 'urgent', 'celebratory']).default('casual'),
        audience: z.string().optional().describe("Who it's for (e.g. 'returning customers', 'WhatsApp group')"),
      }),
      execute: async (args) => {
        // The agent itself composes the message in its reply — this tool
        // exists so the call shows in the trail as a deliberate action.
        ctx.tool_call_count++;
        return {
          ok: true,
          instruction: `Compose a 2-4 line marketing message in ${args.tone} tone for: ${args.goal}${args.audience ? `. Audience: ${args.audience}` : ''}. Output the message in your reply.`,
        };
      },
    }),
  };
}
