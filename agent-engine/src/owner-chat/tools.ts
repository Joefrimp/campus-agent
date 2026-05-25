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
  renderContentPdf,
  renderContentXlsx,
} from '../lib/reports.js';
import { renderBusinessDocx, renderContentDocx } from './docx.js';
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
        "Pull the owner's recent business metrics (revenue, expenses, net, orders, inquiries, top products, top customers). Use whenever the owner asks about performance, trends, or sales numbers. Period defaults to 'this_week'. Returns ok:false with a hint when there's no data yet — DO NOT pretend numbers exist if so.",
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
          const hasAnyData =
            (data.totals.orders_paid + data.totals.orders_quoted +
              data.totals.inquiries + data.totals.customers_new) > 0;
          return {
            ok: true,
            period,
            has_data: hasAnyData,
            hint: hasAnyData
              ? null
              : 'This tenant has no orders / inquiries in the period yet. Tell the owner there is nothing to report and suggest sending a few test messages first.',
            totals: data.totals,
            daily: data.daily,
            top_products: data.top_products.slice(0, 5),
            top_customers: data.top_customers.slice(0, 5),
            expense_breakdown: data.expense_breakdown,
          };
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'read_business_metrics failed');
          return {
            ok: false,
            error: 'Could not load business metrics. Tell the owner the data layer returned an error and to check Render logs.',
          };
        }
      },
    }),

    generate_report: tool({
      description:
        "Generate a downloadable file (PDF / XLSX / DOCX) and attach a download link to your reply.\n\n" +
        "TWO modes — pick the right one:\n" +
        "• report_type='metrics' — the canned weekly business-performance report (revenue, expenses, orders, top products/customers). ONLY use this when the owner explicitly wants their sales/performance numbers. It pulls live data; you pass NO content.\n" +
        "• report_type='document' — ANY other document: a promo, marketing message, letter, plan, pricing sheet, strategy memo, meeting notes, etc. You MUST pass the full `content` (the exact text to put in the file) and a `title`. The file contains EXACTLY what you put in `content` — nothing is auto-filled. If the owner says 'put THIS in a PDF' referring to something you just wrote, copy that text verbatim into `content`.\n\n" +
        "Never claim a file contains something you did not pass in `content`.",
      parameters: z.object({
        format: z.enum(['pdf', 'xlsx', 'docx']).describe("'pdf' for a polished printable, 'docx' for an editable Word doc, 'xlsx' for a spreadsheet"),
        report_type: z.enum(['metrics', 'document']).default('document')
          .describe("'metrics' = the weekly sales/performance report (live data, no content needed). 'document' = a free-form doc whose body is whatever you pass in `content`."),
        title: z.string().optional().describe("Title shown at the top of the file, e.g. 'Friday Promo — Ako Laptops'"),
        content: z.string().optional()
          .describe("REQUIRED when report_type='document'. The full body text to render. Supports light Markdown: '# Heading', '## Subheading', '- bullet', '**bold**'. Put the COMPLETE message/document here."),
      }),
      execute: async ({ format, report_type, title, content }) => {
        try {
          // Resolve business name for the document header.
          const { data: prof } = await supabase
            .from('profiles').select('business_name').eq('id', ctx.user_id).maybeSingle();
          const businessName = prof?.business_name ?? 'Your business';

          let buf: Buffer;
          let mime: string;

          if (report_type === 'document') {
            if (!content || content.trim().length < 2) {
              return {
                ok: false,
                error: 'document mode needs content',
                instruction: "You chose report_type='document' but passed no `content`. Re-call generate_report with the full text to render in the `content` field. Do NOT tell the owner the file is ready.",
              };
            }
            const docTitle = title?.trim() || 'Document';
            if (format === 'pdf') {
              buf = await renderContentPdf({ title: docTitle, content, business_name: businessName });
              mime = 'application/pdf';
            } else if (format === 'xlsx') {
              buf = await renderContentXlsx({ title: docTitle, content });
              mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            } else {
              buf = await renderContentDocx({ title: docTitle, content, business_name: businessName });
              mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }
          } else {
            const data = await buildWeeklyReport(ctx.user_id, new Date());
            if (format === 'pdf') {
              buf = await renderWeeklyReportPdf(data);
              mime = 'application/pdf';
            } else if (format === 'xlsx') {
              buf = await renderWeeklyReportXlsx(data);
              mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            } else {
              buf = await renderBusinessDocx(data, title);
              mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            }
          }

          const filename = (title ?? (report_type === 'metrics'
            ? `weekly-${new Date().toISOString().slice(0, 10)}`
            : `document-${new Date().toISOString().slice(0, 10)}`))
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

    unanswered_messages: tool({
      description:
        "List recent customer messages Vector did NOT reply to — non-business chatter, smalltalk, or anything it flagged for the owner to handle personally. These never enter the approvals queue, so this is the only way to review them. Use when the owner asks about missed/unanswered messages, what came in, who texted, or what needs their personal attention.",
      parameters: z.object({
        since_hours: z.number().int().min(1).max(168).default(48).describe('Look-back window in hours (default 48)'),
      }),
      execute: async ({ since_hours }) => {
        const since = new Date(Date.now() - since_hours * 3_600_000).toISOString();
        const { data: logs } = await supabase
          .from('message_logs')
          .select('direction, contact_phone, content, created_at')
          .eq('user_id', ctx.user_id)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(400);
        ctx.tool_call_count++;
        const rows = logs ?? [];
        // Real customers only: a phone-like contact (≥8 digits), not broadcasts/@unknown.
        const isCustomer = (p: string | null) => !!p && /\d{8,}/.test(p);
        // Phones we sent an actual outbound reply TO (so they're handled).
        const repliedTo = new Set(
          rows.filter((r) => r.direction === 'outbound').map((r) => r.contact_phone),
        );
        // Latest inbound per customer phone (rows are newest-first).
        const latestByPhone = new Map<string, { content: string | null; created_at: string }>();
        for (const r of rows) {
          if (r.direction !== 'inbound' || !isCustomer(r.contact_phone)) continue;
          if (!latestByPhone.has(r.contact_phone)) {
            latestByPhone.set(r.contact_phone, { content: r.content, created_at: r.created_at });
          }
        }
        const items = [...latestByPhone.entries()]
          .filter(([phone]) => !repliedTo.has(phone))
          .map(([phone, r]) => ({
            from: phone,
            last_message: (r.content ?? '').slice(0, 200),
            when: r.created_at,
          }))
          .slice(0, 25);
        return {
          ok: true,
          count: items.length,
          window_hours: since_hours,
          items,
          instruction: items.length
            ? 'List these for the owner clearly (who + what they said + when). Offer to draft a reply they can send, but do NOT message the customer yourself.'
            : 'Tell the owner nothing came in unanswered in this window.',
        };
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
        // Pull the real catalogue so the message is grounded in actual
        // products + prices instead of invented ones.
        const { data: products } = await supabase
          .from('price_list')
          .select('name, price, in_stock, stock_qty, category')
          .eq('user_id', ctx.user_id)
          .order('updated_at', { ascending: false })
          .limit(20);
        const { data: prof } = await supabase
          .from('profiles').select('business_name').eq('id', ctx.user_id).maybeSingle();
        ctx.tool_call_count++;
        const hasProducts = (products?.length ?? 0) > 0;
        return {
          ok: true,
          business_name: prof?.business_name ?? null,
          catalogue: products ?? [],
          instruction:
            `Write a ${args.tone}, ready-to-send WhatsApp marketing message for: ${args.goal}` +
            `${args.audience ? ` (audience: ${args.audience})` : ''}.\n` +
            `RULES:\n` +
            `- Ground it in the REAL products/prices in \`catalogue\` above. ${hasProducts ? 'Name an actual product and its actual price.' : "The catalogue is EMPTY — do not invent a product. Instead tell the owner you need a product (or catalogue) before you can write a grounded promo, and offer to write a generic template they can fill in."}\n` +
            `- NEVER invent product names, prices, or stock counts. NEVER leave placeholders like [Your Brand], [short URL], [price], [X units]. Use the real business name${prof?.business_name ? ` (“${prof.business_name}”)` : ''} and omit any link/number you don't actually have.\n` +
            `- Sound like a sharp human operator, not a template: a hook, the offer, one concrete reason to act, a clear next step. 3-6 lines. Light emoji only if it fits the tone.\n` +
            `- Output ONLY the final message text — no preamble, no "here's your message".`,
        };
      },
    }),
  };
}
