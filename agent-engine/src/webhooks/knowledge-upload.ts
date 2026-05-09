/**
 * W4 Knowledge Ingestion — owner uploads gallery photos / menu / price list.
 * v1 supports image extraction (Gemini multimodal) and plain-text chunks.
 * PDF/CSV deferred — owner can paste text or send images.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { generateObject, embedMany } from 'ai';
import { models } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { audit } from '../lib/audit.js';

const FileSchema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'text']),
  source_label: z.string().optional(),
});

const Schema = z.object({
  user_id: z.string().uuid(),
  files: z.array(FileSchema).min(1),
});

const ProductsSchema = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      price: z.number().nullable(),
      in_stock: z.boolean().default(true),
      category: z.string().nullable(),
    }),
  ),
});

const EXTRACT_PROMPT =
  'Extract a product catalog from images of menus, price lists, or product photos uploaded by a Ghanaian campus business owner. Return JSON only matching the schema. Price in GHS, no currency symbol, numeric only. If price unclear, set price=null and note in description. Multiple sizes → one product per size (e.g. "Waakye (small)"). Skip logos and contact info. If no products visible, return empty array.';

export async function handleKnowledgeUpload(c: Context): Promise<Response> {
  const parsed = Schema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid payload' }, 400);
  const { user_id, files } = parsed.data;

  let processed = 0;
  let failed = 0;
  const sample_products: Array<{ name: string; price: number | null }> = [];

  for (const file of files) {
    try {
      if (file.type === 'image') {
        // Fetch image bytes
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());

        const { object } = await generateObject({
          model: models.agent,
          schema: ProductsSchema,
          system: EXTRACT_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract products.' },
                { type: 'image', image: bytes },
              ],
            },
          ],
          temperature: 0,
        });

        for (const p of object.products) {
          if (!p.price) continue; // skip uncertain prices for now
          await supabase
            .from('price_list')
            .upsert(
              {
                user_id,
                name: p.name,
                description: p.description,
                price: p.price,
                category: p.category,
                in_stock: p.in_stock,
              },
              { onConflict: 'user_id,name', ignoreDuplicates: false },
            );
          if (sample_products.length < 5) sample_products.push({ name: p.name, price: p.price });
        }
      } else if (file.type === 'text') {
        const res = await fetch(file.url);
        const text = await res.text();
        const chunks = chunkText(text, 500);
        if (chunks.length > 0) {
          const { embeddings } = await embedMany({ model: models.embedding, values: chunks });
          for (let i = 0; i < chunks.length; i++) {
            await supabase.from('knowledge_chunks').insert({
              user_id,
              content: chunks[i],
              embedding: embeddings[i],
              source: file.source_label ?? null,
            });
          }
        }
      }
      processed++;
    } catch (err) {
      logger.error({ err, file: file.url }, 'knowledge file failed');
      failed++;
    }
  }

  await audit({
    user_id,
    workflow: 'W4-knowledge',
    input: { file_count: files.length },
    output: { processed, failed, sample_products },
  });

  return c.json({ processed, failed, sample_products });
}

function chunkText(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}
