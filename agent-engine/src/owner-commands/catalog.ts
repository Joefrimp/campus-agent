/**
 * Owner WhatsApp commands for the price list / catalog.
 *
 *   ADD <name> <price>          add or update a product (last token = price)
 *   ADD <name> <price> | <desc> add or update with a description
 *   STOCK <name> <qty>          set stock_qty + in_stock flag
 *   PRICE <name> <new_price>    update price for an existing product
 *   PRODUCTS                    list all products (max 30)
 *
 * Owner can ALSO send an IMAGE message with caption "ADD <name> <price>" or
 * "ADD <name> <price> | <description>" to attach a product photo. The
 * image bytes are downloaded from Whapi and re-hosted in our
 * Supabase Storage bucket. Handled by cmdAddWithImage below.
 */
import { supabase } from '../lib/supabase.js';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

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

/**
 * Caption shape (after stripping the leading "ADD"):
 *   "<name> <price>"
 *   "<name> <price> | <description>"
 *   "<name> <price> - <description>"
 */
const ADD_CAPTION_RE = /^ADD\s+(.+?)\s+(\d+(?:\.\d+)?)(?:\s*[|\-–—]\s*([\s\S]+))?$/i;

export function isAddCaption(caption: string | null | undefined): boolean {
  if (!caption) return false;
  return ADD_CAPTION_RE.test(caption.trim());
}

/**
 * Owner sent an IMAGE with caption "ADD <name> <price> [| description]".
 * Downloads the image from Whapi, re-hosts in our Supabase Storage bucket
 * scoped to {user_id}/owner-add/, then upserts the catalogue row.
 *
 * Returns the WhatsApp reply text the owner should see.
 */
export async function cmdAddWithImage(args: {
  user_id: string;
  whapi_token: string;
  media_id: string;
  caption: string;
}): Promise<string> {
  const m = args.caption.trim().match(ADD_CAPTION_RE);
  if (!m) {
    return 'Use: ADD <name> <price> as the image caption. Example: ADD Nivea Soft 30 — or with a description: ADD Nivea Soft 30 | gentle moisturiser, 200ml.';
  }
  const name = m[1]!.trim();
  const price = Number(m[2]);
  const description = (m[3] ?? '').trim() || null;
  if (!Number.isFinite(price) || price < 0) {
    return `Price "${m[2]}" doesn't look right. Try: ADD ${name} 30`;
  }

  // 1. Download bytes from Whapi
  let bytes: Uint8Array | null = null;
  let contentType = 'image/jpeg';
  try {
    const res = await fetch(`${config.WHAPI_BASE_URL}/media/${args.media_id}`, {
      headers: { Authorization: `Bearer ${args.whapi_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, media_id: args.media_id }, 'cmdAddWithImage: media fetch non-ok');
      return `Could not fetch the image (status ${res.status}). Try resending.`;
    }
    contentType = res.headers.get('content-type') ?? 'image/jpeg';
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ err, media_id: args.media_id }, 'cmdAddWithImage: media fetch threw');
    return 'Could not fetch the image. Try resending.';
  }
  if (!bytes || bytes.byteLength < 200) {
    return 'The image came through empty. Try resending it.';
  }

  // 2. Upload to Supabase Storage
  const ext =
    contentType.includes('png') ? 'png' :
    contentType.includes('webp') ? 'webp' :
    contentType.includes('gif') ? 'gif' :
    'jpg';
  const path = `${args.user_id}/owner-add/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(path, bytes, { contentType, cacheControl: '604800', upsert: false });
  if (upErr) {
    logger.warn({ err: upErr }, 'cmdAddWithImage: storage upload failed');
    return `Image upload failed: ${upErr.message}`;
  }
  const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path);

  // 3. Upsert price_list. `onConflict: 'user_id,name'` matches the existing
  //    cmdAdd behaviour so re-sending an image for the same product replaces it.
  const { error: insertErr } = await supabase
    .from('price_list')
    .upsert(
      {
        user_id: args.user_id,
        name,
        price,
        description,
        image_url: pub.publicUrl,
        in_stock: true,
        kind: 'product',
      },
      { onConflict: 'user_id,name', ignoreDuplicates: false },
    );
  if (insertErr) {
    return `Saved the image but the catalogue row failed: ${insertErr.message}`;
  }
  const descNote = description ? ' with the description you wrote' : '';
  return `✅ Added "${name}" at GHS ${price}${descNote}, photo included. Visible on your dashboard catalogue now.`;
}
