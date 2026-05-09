/**
 * Agent tool registry.
 *
 * Each tool is a Vercel AI SDK tool definition (Zod schema + execute fn).
 * Tools are bound at request time with the current tenant's user_id and
 * the customer phone, so the agent never has to pass them explicitly.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { embed } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';

export interface ToolContext {
  user_id: string;
  customer_phone: string;
  customer_id: string | null;
}

export function buildTools(ctx: ToolContext) {
  return {
    lookup_price: tool({
      description:
        "Look up an item (product or service) from the owner's catalogue. ALWAYS call before quoting any price. Returns up to 5 fuzzy matches with `price`, `min_price` (negotiation floor — NEVER go below; null = no discount allowed), `in_stock`, `description`, `kind` (product|service|both), `unit` (e.g. '30 min session'), and `duration_minutes` (for services).",
      parameters: z.object({
        name: z.string().describe('The product or service name or partial name'),
      }),
      execute: async ({ name }) => {
        const { data, error } = await supabase
          .from('price_list')
          .select('id, name, price, min_price, in_stock, description, category, image_url, kind, unit, duration_minutes')
          .eq('user_id', ctx.user_id)
          .ilike('name', `%${name}%`)
          .limit(5);
        if (error) {
          logger.error({ err: error, name }, 'lookup_price failed');
          return { error: 'lookup failed' };
        }
        if (!data || data.length === 0) {
          return { matches: [], hint: 'No items matched. Use escalate_to_owner with action_type="custom_quote".' };
        }
        return { matches: data };
      },
    }),

    check_availability: tool({
      description:
        "Check whether the owner is available to deliver a service at a given time. Considers existing appointments + business hours + schedule_blocks. Returns { available: bool, conflicts: [...], next_available_at: string|null, business_open: bool }.",
      parameters: z.object({
        service_name: z.string().describe("Service name to look up duration"),
        scheduled_at: z
          .string()
          .describe("ISO 8601 timestamp the customer is requesting (e.g. '2026-05-08T14:30:00+00:00'). If unsure of timezone, use the owner's local time."),
      }),
      execute: async ({ service_name, scheduled_at }) => {
        const { data: service } = await supabase
          .from('price_list')
          .select('id, name, duration_minutes')
          .eq('user_id', ctx.user_id)
          .ilike('name', `%${service_name}%`)
          .in('kind', ['service', 'both'])
          .limit(1)
          .maybeSingle();
        if (!service) return { available: false, error: 'Service not found.' };

        const start = new Date(scheduled_at);
        if (Number.isNaN(start.getTime())) return { available: false, error: 'Invalid timestamp.' };
        const dur = service.duration_minutes ?? 60;
        const end = new Date(start.getTime() + dur * 60_000);

        const { data: conflicts } = await supabase
          .from('appointments')
          .select('id, scheduled_at, duration_minutes, state')
          .eq('user_id', ctx.user_id)
          .in('state', ['requested', 'confirmed', 'rescheduled'])
          .gte('scheduled_at', new Date(start.getTime() - 4 * 3600_000).toISOString())
          .lte('scheduled_at', new Date(end.getTime() + 4 * 3600_000).toISOString());

        const overlapping = (conflicts ?? []).filter((a) => {
          const aStart = new Date(a.scheduled_at);
          const aEnd = new Date(aStart.getTime() + (a.duration_minutes ?? 60) * 60_000);
          return aStart < end && aEnd > start;
        });

        return {
          available: overlapping.length === 0,
          conflicts: overlapping.map((c) => ({ at: c.scheduled_at, duration_minutes: c.duration_minutes })),
          service: { id: service.id, name: service.name, duration_minutes: dur },
        };
      },
    }),

    book_appointment: tool({
      description:
        "Tentatively book a service appointment. Creates an appointment in 'requested' state — owner can confirm or cancel via the dashboard. Use AFTER check_availability returns available=true. agreed_price may be null if pricing happens at the appointment.",
      parameters: z.object({
        service_id: z.string().uuid().describe('From lookup_price match.id'),
        scheduled_at: z.string().describe('ISO 8601 timestamp'),
        duration_minutes: z.number().int().positive().optional(),
        agreed_price: z.number().nullable().optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ service_id, scheduled_at, duration_minutes, agreed_price, notes }) => {
        const { data, error } = await supabase
          .from('appointments')
          .insert({
            user_id: ctx.user_id,
            customer_id: ctx.customer_id,
            service_id,
            scheduled_at,
            duration_minutes: duration_minutes ?? 60,
            agreed_price: agreed_price ?? null,
            notes: notes ?? null,
            state: 'requested',
          })
          .select('id')
          .single();
        if (error || !data) return { booked: false, error: error?.message ?? 'insert failed' };
        return {
          booked: true,
          appointment_id: data.id,
          state: 'requested',
          note: 'Owner will confirm. Tell the customer their appointment is tentatively booked and you will confirm shortly.',
        };
      },
    }),

    check_stock: tool({
      description: 'Check whether an item is in stock and how many units are available. ALWAYS call before promising availability.',
      parameters: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const { data, error } = await supabase
          .from('price_list')
          .select('name, in_stock, stock_qty')
          .eq('user_id', ctx.user_id)
          .ilike('name', `%${name}%`)
          .limit(3);
        if (error) return { error: 'stock check failed' };
        return { items: data ?? [] };
      },
    }),

    search_knowledge_base: tool({
      description:
        "Search the owner's uploaded knowledge base (FAQs, policies, business info) for a query. Returns top-5 most relevant chunks.",
      parameters: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        try {
          const queryEmbedding = await embed(query);
          // RPC must exist in DB — see migration. Fallback to simple ILIKE if not.
          const { data, error } = await supabase.rpc('match_knowledge', {
            query_embedding: queryEmbedding,
            p_user_id: ctx.user_id,
          });
          if (error) {
            logger.warn({ err: error }, 'match_knowledge RPC missing — falling back to text search');
            const { data: fallback } = await supabase
              .from('knowledge_chunks')
              .select('content')
              .eq('user_id', ctx.user_id)
              .ilike('content', `%${query}%`)
              .limit(5);
            return { matches: fallback ?? [] };
          }
          return { matches: data ?? [] };
        } catch (err) {
          logger.error({ err, query }, 'search_knowledge_base failed');
          return { matches: [] };
        }
      },
    }),

    create_or_update_order: tool({
      description:
        "Create a new order or update an existing one. State must be one of: inquiry, quoted, confirmed, paid, preparing, out_for_delivery, delivered, reviewed, cancelled. After creating a 'quoted' order, ALSO call schedule_followup with the returned order_id.",
      parameters: z.object({
        state: z.enum([
          'inquiry',
          'quoted',
          'confirmed',
          'paid',
          'preparing',
          'out_for_delivery',
          'delivered',
          'reviewed',
          'cancelled',
        ]),
        items: z.array(
          z.object({
            name: z.string(),
            qty: z.number().int().positive(),
            price: z.number().nonnegative(),
          }),
        ),
        total_amount: z.number().nonnegative(),
        delivery_date: z.string().optional().describe('ISO date YYYY-MM-DD'),
        delivery_addr: z.string().optional().describe('Hostel / hall name'),
        order_id: z.string().uuid().optional().describe('Pass to update an existing order'),
      }),
      execute: async (input) => {
        const row = {
          user_id: ctx.user_id,
          customer_id: ctx.customer_id,
          state: input.state,
          items: input.items,
          total_amount: input.total_amount,
          delivery_date: input.delivery_date ?? null,
          delivery_addr: input.delivery_addr ?? null,
        };
        const query = input.order_id
          ? supabase.from('orders').update(row).eq('id', input.order_id).select('id, state').single()
          : supabase.from('orders').insert(row).select('id, state').single();
        const { data, error } = await query;
        if (error) {
          logger.error({ err: error, input }, 'order upsert failed');
          return { error: 'could not save order' };
        }
        // Side effect: schedule a 24h follow-up automatically when entering 'quoted'
        if (data && data.state === 'quoted') {
          await supabase
            .from('followups')
            .insert({
              user_id: ctx.user_id,
              customer_phone: ctx.customer_phone,
              order_id: data.id,
              stage: 1,
              next_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })
            .then(({ error: fErr }) => {
              if (fErr) logger.warn({ err: fErr }, 'auto-followup insert failed (non-fatal)');
            });
        }
        return { order_id: data?.id, state: data?.state };
      },
    }),

    get_customer_history: tool({
      description: "Get this customer's last 5 orders and lifetime value.",
      parameters: z.object({}),
      execute: async () => {
        if (!ctx.customer_id) return { history: [], lifetime_value: 0 };
        const [{ data: orders }, { data: customer }] = await Promise.all([
          supabase
            .from('orders')
            .select('id, state, items, total_amount, created_at')
            .eq('user_id', ctx.user_id)
            .eq('customer_id', ctx.customer_id)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('customers')
            .select('lifetime_value, total_orders, hostel, display_name')
            .eq('id', ctx.customer_id)
            .single(),
        ]);
        return {
          history: orders ?? [],
          lifetime_value: customer?.lifetime_value ?? 0,
          total_orders: customer?.total_orders ?? 0,
          hostel: customer?.hostel ?? null,
          display_name: customer?.display_name ?? null,
        };
      },
    }),

    get_owner_info: tool({
      description: "Get the owner's business info: hours, delivery zones, MoMo number, payment methods. Call this whenever you need to share business details with a customer.",
      parameters: z.object({}),
      execute: async () => {
        const [{ data: profile }, { data: settings }] = await Promise.all([
          supabase.from('profiles').select('business_name, first_name').eq('id', ctx.user_id).single(),
          supabase
            .from('business_settings')
            .select('business_hours, delivery_zones, momo_number, momo_name, payment_methods')
            .eq('user_id', ctx.user_id)
            .single(),
        ]);
        return {
          business_name: profile?.business_name ?? null,
          owner_first_name: profile?.first_name ?? null,
          business_hours: settings?.business_hours ?? null,
          delivery_zones: settings?.delivery_zones ?? [],
          momo_number: settings?.momo_number ?? null,
          momo_name: settings?.momo_name ?? null,
          payment_methods: settings?.payment_methods ?? [],
        };
      },
    }),

    escalate_to_owner: tool({
      description:
        "Escalate to the owner when you cannot answer (refund, complaint, custom large order, missing price, ambiguous request). Provide the reply you would send if you were authorized. The owner will review and either approve, edit, or reject. After calling this, send the customer a brief holding message.",
      parameters: z.object({
        reason: z.string().describe('Why you are escalating (one short sentence)'),
        drafted_reply: z.string().describe('The exact message you would send the customer if approved'),
        action_type: z.enum(['refund', 'large_discount', 'custom_quote', 'complaint', 'other']),
      }),
      execute: async ({ reason, drafted_reply, action_type }) => {
        const { data, error } = await supabase
          .from('approval_queue')
          .insert({
            user_id: ctx.user_id,
            customer_phone: ctx.customer_phone,
            action_type,
            drafted_reply,
            context_summary: reason,
          })
          .select('id')
          .single();
        if (error) {
          logger.error({ err: error }, 'escalate_to_owner failed');
          return { error: 'could not queue escalation' };
        }
        return { queued: true, approval_id: data?.id, instruction: 'Send a brief holding reply to the customer.' };
      },
    }),

    schedule_followup: tool({
      description: 'Schedule a 24h follow-up for an order that is quoted but not yet confirmed. Call this immediately after creating a quoted order.',
      parameters: z.object({ order_id: z.string().uuid() }),
      execute: async ({ order_id }) => {
        const { error } = await supabase.from('followups').insert({
          user_id: ctx.user_id,
          customer_phone: ctx.customer_phone,
          order_id,
          stage: 1,
          next_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        if (error) return { error: 'could not schedule followup' };
        return { scheduled: true, fires_in_hours: 24 };
      },
    }),
  };
}

export type AgentTools = ReturnType<typeof buildTools>;
