/**
 * Owner WhatsApp commands for the price list / catalog.
 *
 *   ADD <name> <price>          add or update a product (last token = price)
 *   STOCK <name> <qty>          set stock_qty + in_stock flag
 *   PRICE <name> <new_price>    update price for an existing product
 *   PRODUCTS                    list all products (max 30)
 */
import { supabase } from '../lib/supabase.js';

export async function cmdAdd(user_id: string, args: string): Promise<string> {
  const parsed = parseTrailingNumber(args);
  if (!parsed) return 'Use: ADD <product name> <price in GHS>. Example: ADD Nivea Soft 30';
  const { name, value } = parsed;
  if (!name) return 'Product name missing. Example: ADD Nivea Soft 30';

  const { error } = await supabase
    .from('price_list')
    .upsert(
      { user_id, name, price: value, in_stock: true },
      { onConflict: 'user_id,name', ignoreDuplicates: false },
    );
  if (error) return `Could not save: ${error.message}`;
  return `✅ Added "${name}" at GHS ${value}.`;
}

export async function cmdStock(user_id: string, args: string): Promise<string> {
  const parsed = parseTrailingNumber(args);
  if (!parsed) return 'Use: STOCK <product> <qty>. Example: STOCK Nivea 50';
  const { name, value: qty } = parsed;
  if (!name) return 'Product name missing.';

  const { data: existing, error: lookupErr } = await supabase
    .from('price_list')
    .select('id')
    .eq('user_id', user_id)
    .ilike('name', name)
    .maybeSingle();
  if (lookupErr) return `Could not check: ${lookupErr.message}`;
  if (!existing) return `No product named "${name}". Add it first with ADD.`;

  const { error: updErr } = await supabase
    .from('price_list')
    .update({ stock_qty: qty, in_stock: qty > 0 })
    .eq('id', existing.id);
  if (updErr) return `Could not update: ${updErr.message}`;
  return qty === 0 ? `🛑 "${name}" marked sold-out.` : `✅ "${name}" stock set to ${qty}.`;
}

export async function cmdPrice(user_id: string, args: string): Promise<string> {
  const parsed = parseTrailingNumber(args);
  if (!parsed) return 'Use: PRICE <product> <new price>. Example: PRICE Nivea 35';
  const { name, value: price } = parsed;
  if (!name) return 'Product name missing.';

  const { data: existing } = await supabase
    .from('price_list')
    .select('id, price')
    .eq('user_id', user_id)
    .ilike('name', name)
    .maybeSingle();
  if (!existing) return `No product named "${name}". Add it first with ADD.`;

  await supabase.from('price_list').update({ price }).eq('id', existing.id);
  return `✅ "${name}" price changed: GHS ${existing.price} → GHS ${price}.`;
}

export async function cmdProducts(user_id: string): Promise<string> {
  const { data } = await supabase
    .from('price_list')
    .select('name, price, in_stock, stock_qty')
    .eq('user_id', user_id)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (!data || data.length === 0) return 'No products yet. Add one with ADD <name> <price>.';
  const lines = data.map((p) => {
    const stockTag = p.in_stock ? (p.stock_qty != null ? `(${p.stock_qty})` : '') : '🛑 OUT';
    return `• ${p.name} — GHS ${p.price} ${stockTag}`.trim();
  });
  return `Your ${data.length} most recent products:\n${lines.join('\n')}`;
}

/** Splits "Nivea Soft 30" → { name: "Nivea Soft", value: 30 }. */
function parseTrailingNumber(args: string): { name: string; value: number } | null {
  const trimmed = args.trim();
  const m = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const name = m[1]!.trim();
  const value = Number(m[2]);
  if (!Number.isFinite(value) || value < 0) return null;
  return { name, value };
}
