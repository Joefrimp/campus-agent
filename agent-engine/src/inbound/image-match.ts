/**
 * Forwarded-image catalogue matcher.
 *
 * When a customer forwards a product photo (typically lifted from a
 * competitor's WhatsApp group), Vector tries to find the same item in
 * the owner's catalogue. Honesty rules baked into the pipeline:
 *
 *   confidence ≥ 0.85 → "Yes, that's our [name] — GH₵X"
 *   0.60 ≤ c < 0.85   → "Not the exact one, but here are close cousins"
 *   c < 0.60          → "We don't carry that, but for [purpose] we have ..."
 *
 * Two-stage match:
 *   1. Vision-describe the image into a structured fingerprint
 *      ({category, brand, color, material, key_features, purpose})
 *   2. Score each candidate from the catalogue:
 *      - lexical: fuzzy text match on name + description against fingerprint
 *      - semantic: cosine similarity between fingerprint embedding and
 *        catalogue item description embedding (when available)
 *      - visual: image-vs-image Gemini call on the top-3 candidates
 *        (only when catalogue items have image_url, to keep cost down)
 *
 *  Final confidence = max(visual, 0.5 * lexical + 0.5 * semantic).
 *
 *  Result is structured so brain.ts can use it as additional context, OR
 *  webhook.ts can short-circuit and reply directly on a strong match.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { models, embed } from '../lib/gemini.js';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const FingerprintSchema = z.object({
  is_product_photo: z.boolean(),
  category: z.string().nullable(),       // "sneakers", "rice meal", "phone case"
  brand: z.string().nullable(),
  colors: z.array(z.string()).default([]),
  material: z.string().nullable(),
  key_features: z.array(z.string()).default([]),
  purpose: z.string().nullable().describe('What is this product FOR? (e.g. running, formal wear, gaming)'),
  description_short: z.string(),
  confidence: z.number().min(0).max(1),
});

const FINGERPRINT_PROMPT = `Look at this image and produce a structured product fingerprint. Be specific and factual — only describe what is clearly visible. Do NOT guess. If the image is not a product (selfie, screenshot, meme, payment receipt), set is_product_photo=false.

For products, extract:
- category: the most specific product type ("running shoes", not "footwear")
- brand: only if the brand name is clearly visible/legible
- colors: 1-3 dominant colors
- material: leather/fabric/plastic/metal/etc, only if obvious
- key_features: 2-5 distinctive details (e.g., "white sole", "Velcro strap", "wireless")
- purpose: what this product is FOR
- description_short: one-sentence factual description (max 18 words)
- confidence: how clearly you can identify this (0.0 - 1.0)`;

const VisualMatchSchema = z.object({
  same_product: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const VISUAL_MATCH_PROMPT = `Two images of products. Are they the SAME product (same model, same brand, same variant)? Differences in lighting, angle, or zoom don't matter. Color must match. Brand and model must match. If you cannot tell, prefer same_product=false. Return confidence 0.0-1.0 reflecting how sure you are.`;

export interface CandidateMatch {
  id: string;
  name: string;
  price: number | null;
  min_price: number | null;
  in_stock: boolean;
  description: string | null;
  image_url: string | null;
  category: string | null;
  /** 0..1 final confidence */
  confidence: number;
  /** internal scores, useful for debugging */
  lexical_score: number;
  semantic_score: number;
  visual_score: number | null;
}

export interface ImageMatchResult {
  ok: boolean;
  fingerprint: z.infer<typeof FingerprintSchema> | null;
  matches: CandidateMatch[];      // ordered by confidence desc
  best_confidence: number;
  /** convenience getter — what the agent should do */
  band: 'exact' | 'similar' | 'none';
  reason?: string;
}

const EXACT_THRESHOLD = 0.85;
const SIMILAR_THRESHOLD = 0.60;

export async function matchForwardedImage(
  user_id: string,
  imageBytes: Uint8Array,
): Promise<ImageMatchResult> {
  // 1. Vision fingerprint
  let fingerprint: z.infer<typeof FingerprintSchema>;
  try {
    const { object } = await generateObject({
      model: models.vision,
      schema: FingerprintSchema,
      system: FINGERPRINT_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image.' },
            { type: 'image', image: imageBytes },
          ],
        },
      ],
      temperature: 0,
      maxRetries: 1,
    });
    fingerprint = object;
  } catch (err) {
    logger.warn({ err }, 'image-match fingerprint failed');
    return { ok: false, fingerprint: null, matches: [], best_confidence: 0, band: 'none', reason: 'fingerprint_error' };
  }

  if (!fingerprint.is_product_photo) {
    return { ok: false, fingerprint, matches: [], best_confidence: 0, band: 'none', reason: 'not_a_product' };
  }

  // 2. Pull catalogue items — start broad, filter by category if we have one
  let query = supabase
    .from('price_list')
    .select('id, name, price, min_price, in_stock, description, image_url, category')
    .eq('user_id', user_id)
    .in('kind', ['product', 'both'])
    .limit(40);
  if (fingerprint.category) {
    query = query.or(`category.ilike.%${fingerprint.category}%,name.ilike.%${fingerprint.category}%`);
  }
  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) {
    return { ok: true, fingerprint, matches: [], best_confidence: 0, band: 'none', reason: 'empty_catalogue' };
  }

  // 3. Lexical scoring — count fingerprint tokens that appear in candidate text
  const fpTokens = tokenize(
    [
      fingerprint.category,
      fingerprint.brand,
      ...fingerprint.colors,
      fingerprint.material,
      ...fingerprint.key_features,
      fingerprint.description_short,
    ]
      .filter(Boolean)
      .join(' '),
  );

  // 4. Semantic embeddings (one for the fingerprint, then per candidate description)
  let fpEmbedding: number[] | null = null;
  try {
    fpEmbedding = await embed(fingerprint.description_short);
  } catch (err) {
    logger.warn({ err }, 'image-match: fingerprint embed failed (fallback to lexical only)');
  }

  const scored: CandidateMatch[] = [];
  for (const c of candidates) {
    const text = `${c.name} ${c.description ?? ''} ${c.category ?? ''}`.toLowerCase();
    const cTokens = tokenize(text);
    const lexical = scoreLexical(fpTokens, cTokens);

    let semantic = 0;
    if (fpEmbedding && (c.description || c.name)) {
      try {
        const cEmbed = await embed(`${c.name} ${c.description ?? ''}`);
        semantic = cosine(fpEmbedding, cEmbed);
      } catch {/* ignore */}
    }

    scored.push({
      id: c.id,
      name: c.name,
      price: c.price,
      min_price: c.min_price,
      in_stock: c.in_stock,
      description: c.description,
      image_url: c.image_url,
      category: c.category,
      lexical_score: lexical,
      semantic_score: semantic,
      visual_score: null,
      confidence: Math.max(0, Math.min(1, 0.5 * lexical + 0.5 * semantic)),
    });
  }

  scored.sort((a, b) => b.confidence - a.confidence);

  // 5. Visual confirmation on top-3 candidates with images
  const topWithImages = scored.slice(0, 3).filter(c => c.image_url);
  for (const c of topWithImages) {
    try {
      const candidateBytes = await fetchImageBytes(c.image_url!);
      if (!candidateBytes) continue;
      const { object: match } = await generateObject({
        model: models.vision,
        schema: VisualMatchSchema,
        system: VISUAL_MATCH_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Image A (customer forwarded):' },
              { type: 'image', image: imageBytes },
              { type: 'text', text: 'Image B (catalogue item):' },
              { type: 'image', image: candidateBytes },
            ],
          },
        ],
        temperature: 0,
        maxRetries: 1,
      });
      c.visual_score = match.same_product ? match.confidence : 1 - match.confidence;
      // Final confidence: visual is primary signal when present.
      c.confidence = Math.max(c.confidence, c.visual_score);
    } catch (err) {
      logger.warn({ err, candidate_id: c.id }, 'visual-match failed for candidate');
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0]?.confidence ?? 0;
  const band: ImageMatchResult['band'] =
    best >= EXACT_THRESHOLD ? 'exact' : best >= SIMILAR_THRESHOLD ? 'similar' : 'none';

  return {
    ok: true,
    fingerprint,
    matches: scored.slice(0, 5),
    best_confidence: best,
    band,
  };
}

/* ─── Helpers ─── */

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3),
  );
}

function scoreLexical(a: Set<string>, b: Set<string>): number {
  if (a.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  // Jaccard-ish, biased toward fingerprint coverage
  return Math.min(1, hits / Math.max(3, a.size * 0.7));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/* ─── Reply formatting (so the agent has copy-ready snippets) ─── */

export function formatMatchReply(result: ImageMatchResult, businessName?: string): string | null {
  if (!result.ok || !result.fingerprint) return null;
  const top = result.matches[0];
  if (!top) {
    return `We don't carry that exact one in our catalogue right now. If it's for ${
      result.fingerprint.purpose ?? 'general use'
    }, I'd love to know — I can suggest what we do have that fits.`;
  }
  if (result.band === 'exact') {
    const inStock = top.in_stock ? '' : ' (currently out of stock)';
    return `Yes — that's our ${top.name}${top.price != null ? `, GH₵${top.price}` : ''}${inStock}. Want me to set one aside?`;
  }
  if (result.band === 'similar') {
    const second = result.matches[1];
    const lines = [
      `We don't carry that exact one, but here's a close match:`,
      `• ${top.name}${top.price != null ? ` — GH₵${top.price}` : ''}${top.in_stock ? '' : ' (out of stock)'}`,
    ];
    if (second && second.confidence >= 0.5) {
      lines.push(`• ${second.name}${second.price != null ? ` — GH₵${second.price}` : ''}`);
    }
    lines.push(`Want me to send photos?`);
    return lines.join('\n');
  }
  // band === 'none' but we have *some* candidate; surface honestly
  return `We don't carry that specific item${businessName ? ` at ${businessName}` : ''}. ${
    result.fingerprint.purpose
      ? `For ${result.fingerprint.purpose}, you might like ${top.name}${top.price != null ? ` (GH₵${top.price})` : ''}.`
      : `Tell me more about what you're using it for and I'll suggest something honest.`
  }`;
}
