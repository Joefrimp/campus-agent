/**
 * W7 Followup scheduler — Dan Martell's "fortune in the follow-up".
 * Stage 1 fires 24h after a quoted-but-not-confirmed order.
 * Stage 2 at +72h (now+48h from stage 1). Stage 3 at +7d (now+5d from stage 2).
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { send } from '../outbound/send.js';
import { isQuietHour } from '../lib/time.js';
import { audit } from '../lib/audit.js';

const FOLLOWUP_PROMPT =
  'Write a one-message gentle WhatsApp follow-up. Tone: {{voice}}. Don\'t be pushy. No discounts unless allowed. Reference the specific item. Single soft question to re-open ("still good for {{date}}?"). Max 35 words. Plain text only, no markdown.';

export async function runFollowups(): Promise<void> {
  const { data: due } = await supabase
    .from('followups')
    .select('id, user_id, customer_phone, order_id, stage, next_at')
    .eq('done', false)
    .lte('next_at', new Date().toISOString())
    .limit(50);
  if (!due || due.length === 0) return;

  for (const f of due) {
    try {
      // Skip if order moved to a non-followup state
      const { data: order } = await supabase
        .from('orders')
        .select('state, items, total_amount, delivery_date, updated_at')
        .eq('id', f.order_id!)
        .maybeSingle();
      if (!order) {
        await markDone(f.id);
        continue;
      }
      if (['paid', 'confirmed', 'cancelled'].includes(order.state)) {
        await markDone(f.id);
        continue;
      }

      const { data: settings } = await supabase
        .from('business_settings')
        .select('timezone, followups_enabled')
        .eq('user_id', f.user_id)
        .maybeSingle();
      if (settings && !settings.followups_enabled) {
        await markDone(f.id);
        continue;
      }
      if (isQuietHour(settings?.timezone)) {
        // Reschedule to next 07:00 local — simplest: +6h
        await supabase
          .from('followups')
          .update({ next_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() })
          .eq('id', f.id);
        continue;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('brand_voice, first_name')
        .eq('id', f.user_id)
        .single();
      const { data: customer } = await supabase
        .from('customers')
        .select('display_name')
        .eq('user_id', f.user_id)
        .eq('phone', f.customer_phone)
        .maybeSingle();

      const itemsSummary = formatItems(order.items as unknown[]);
      const hoursAgo = Math.round((Date.now() - new Date(order.updated_at).getTime()) / (60 * 60 * 1000));

      const { text } = await generateText({
        model: models.agent,
        system: FOLLOWUP_PROMPT.replace('{{voice}}', profile?.brand_voice ?? 'professional_executive').replace(
          '{{date}}',
          order.delivery_date ?? 'soon',
        ),
        prompt: `Customer: ${customer?.display_name ?? 'there'}. Items: ${itemsSummary}. Total: GHS ${order.total_amount}. Hours since quote: ${hoursAgo}. Delivery date: ${order.delivery_date ?? 'TBD'}.`,
        temperature: 0.6,
        maxTokens: 80,
      });

      await send({
        user_id: f.user_id,
        to: f.customer_phone,
        message: text.trim(),
        type: 'text',
        idempotency_key: `followup-${f.id}-${f.stage}`,
      });

      // Schedule next stage
      const nextAt =
        f.stage === 1
          ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() // +48h → 72h from quote
          : f.stage === 2
            ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() // +5d → 7d from quote
            : null;

      if (nextAt && f.stage < 3) {
        await supabase.from('followups').update({ stage: f.stage + 1, next_at: nextAt }).eq('id', f.id);
      } else {
        await markDone(f.id);
        await audit({
          user_id: f.user_id,
          workflow: 'W7-lost-lead',
          input: { followup_id: f.id, order_id: f.order_id },
        });
      }
    } catch (err) {
      // Per-followup isolation
      await audit({
        user_id: f.user_id,
        workflow: 'W7-error',
        severity: 'error',
        output: { error: (err as Error).message, followup_id: f.id },
      });
    }
  }
}

async function markDone(id: string): Promise<void> {
  await supabase.from('followups').update({ done: true }).eq('id', id);
}

function formatItems(items: unknown[]): string {
  if (!Array.isArray(items)) return 'your order';
  return items
    .map((i) => {
      const it = i as { name?: string; qty?: number };
      return `${it.qty ?? 1}× ${it.name ?? '?'}`;
    })
    .join(' + ');
}
