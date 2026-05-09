/**
 * Owner WhatsApp commands for draft-only marketing.
 * Zero ban risk — agent generates, owner posts manually.
 *
 *   DRAFT STATUS         caption + suggested product for today's status
 *   DRAFT GROUP          a friendly group post about a hot product
 *   WEEK PLAN            7 status captions for the week
 */
import { generateText } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';

const STATUS_PROMPT =
  'Write a WhatsApp Status caption (max 80 chars) in {{voice}} brand voice for {{product}} priced GHS {{price}}. Include the price. 1 emoji max. End with soft CTA ("DM to reserve" / "Tap to order"). No hashtags. Output the caption only.';

const GROUP_PROMPT =
  'Write a friendly WhatsApp group message for a Ghanaian hostel/student group about {{angle}} ({{product}} at GHS {{price}}). 30–60 words. Sound like a fellow student. Open with a time-of-day greeting (maakye/maaha/maadwo OK). Add concrete value (today\'s special / fresh batch / restock). One soft CTA ("DM if interested"). 1 emoji max. No hashtags. Output the message only.';

export async function cmdDraftStatus(user_id: string): Promise<string> {
  const product = await pickProduct(user_id);
  if (!product) return 'No products in stock yet. Use ADD <name> <price> first.';

  const voice = await getVoice(user_id);
  const { text } = await generateText({
    model: models.agent,
    system: STATUS_PROMPT.replace('{{voice}}', voice).replace('{{product}}', product.name).replace('{{price}}', String(product.price)),
    prompt: 'Generate.',
    temperature: 0.7,
    maxTokens: 60,
  });
  return [
    '📱 Status caption (copy + paste to your WhatsApp Status):',
    '',
    text.trim(),
    '',
    `Product: ${product.name} — GHS ${product.price}`,
  ].join('\n');
}

export async function cmdDraftGroup(user_id: string): Promise<string> {
  const product = await pickProduct(user_id);
  if (!product) return 'No products in stock yet. Use ADD <name> <price> first.';
  const angles = ['fresh batch', 'restock', "today's special", 'new arrival'];
  const angle = angles[Math.floor(Math.random() * angles.length)]!;
  const voice = await getVoice(user_id);

  const { text } = await generateText({
    model: models.agent,
    system: GROUP_PROMPT.replace('{{angle}}', angle).replace('{{product}}', product.name).replace('{{price}}', String(product.price)).replace('{{voice}}', voice),
    prompt: 'Generate.',
    temperature: 0.8,
    maxTokens: 140,
  });
  return [
    '👥 Group post (copy + paste into your hostel groups):',
    '',
    text.trim(),
    '',
    `Angle: ${angle} · Product: ${product.name}`,
  ].join('\n');
}

export async function cmdWeekPlan(user_id: string): Promise<string> {
  const products = await pickProducts(user_id, 7);
  if (products.length === 0) return 'No products in stock yet. Use ADD <name> <price> first.';
  const voice = await getVoice(user_id);

  const { text } = await generateText({
    model: models.agent,
    system: `Generate 7 short WhatsApp Status captions, one per day Mon–Sun, for the products listed. Brand voice: ${voice}. Max 70 chars each. Each line should mention price (GHS X) and have at most 1 emoji. Format as: "Mon: <caption>". No extra text.`,
    prompt: products.map((p, i) => `Day ${i + 1}: ${p.name} — GHS ${p.price}`).join('\n'),
    temperature: 0.7,
    maxTokens: 400,
  });
  return `🗓️ Week plan:\n\n${text.trim()}`;
}

async function pickProduct(user_id: string): Promise<{ name: string; price: number } | null> {
  const { data } = await supabase
    .from('price_list')
    .select('name, price')
    .eq('user_id', user_id)
    .eq('in_stock', true)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (!data || data.length === 0) return null;
  return data[Math.floor(Math.random() * data.length)] ?? null;
}

async function pickProducts(user_id: string, n: number): Promise<Array<{ name: string; price: number }>> {
  const { data } = await supabase
    .from('price_list')
    .select('name, price')
    .eq('user_id', user_id)
    .eq('in_stock', true)
    .order('updated_at', { ascending: false })
    .limit(n);
  return data ?? [];
}

async function getVoice(user_id: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('brand_voice').eq('id', user_id).single();
  return data?.brand_voice ?? 'professional_executive';
}
