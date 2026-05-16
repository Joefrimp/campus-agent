/**
 * Website catalogue scraper.
 *
 * Heuristic-first pipeline (cheerio static HTML only — no headless browser,
 * so SPAs that render entirely via JS won't yield results yet, but most
 * Shopify / Wix / WooCommerce / generic catalog sites do server-render
 * enough to extract a useful first pass).
 *
 * Detection strategy in order:
 *   1. JSON-LD <script type="application/ld+json"> blocks of type Product
 *      or ProductGroup. Schema.org is the gold standard — when present we
 *      use the data verbatim.
 *   2. OpenGraph product meta tags (og:title, og:image, product:price:amount).
 *   3. Generic CSS heuristics — look for repeated card-like elements whose
 *      child structure contains an image + text node with a currency-shaped
 *      string. (Last resort; may over-collect.)
 *
 * Gemini Vision enrichment runs ONLY for items whose extracted description
 * is shorter than 40 chars — keeps cost predictable.
 */
import * as cheerio from 'cheerio';
import { generateObject } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';

const CURRENCY_RE = /(?:GH[¢₵]|GHS|₵|\$|€|£|₦|R)?\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;
const MAX_PAGES = 6;
const REQUEST_TIMEOUT_MS = 12_000;
const USER_AGENT = 'EasternAI-Vector-Scraper/1.0 (+https://eastern.ai)';

interface ExtractedProduct {
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  source_url: string;
  category: string | null;
  raw: unknown;
}

export async function runScraperJob(run_id: string, user_id: string, source_url: string): Promise<void> {
  try {
    await supabase.from('scraper_runs').update({ status: 'crawling' }).eq('id', run_id);

    const pagesToVisit = await discoverProductPages(source_url);
    logger.info({ run_id, pages: pagesToVisit.length, source_url }, 'scraper: discovered pages');

    const seen = new Set<string>();
    const products: ExtractedProduct[] = [];
    for (const url of pagesToVisit) {
      if (products.length >= 100) break;
      const items = await extractFromUrl(url).catch((err) => {
        logger.warn({ err, url }, 'scraper: page failed');
        return [];
      });
      for (const p of items) {
        const key = (p.name + '|' + (p.image_url ?? '')).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        products.push(p);
      }
    }

    await supabase
      .from('scraper_runs')
      .update({ status: 'enriching', total_found: products.length })
      .eq('id', run_id);

    // Optional Vision enrichment for thin descriptions
    for (const p of products) {
      if ((p.description ?? '').trim().length >= 40) continue;
      if (!p.image_url) continue;
      try {
        const enriched = await enrichWithVision(p);
        if (enriched) p.description = enriched;
      } catch (err) {
        logger.warn({ err, name: p.name }, 'scraper: vision enrichment failed');
      }
    }

    // Bulk insert
    if (products.length > 0) {
      await supabase.from('pending_catalogue_imports').insert(
        products.map((p) => ({
          run_id,
          user_id,
          source_url: p.source_url,
          name: p.name.slice(0, 200),
          description: p.description?.slice(0, 1200) ?? null,
          price: p.price,
          currency: p.currency ?? 'GHS',
          image_url: p.image_url,
          category: p.category,
          raw_data: p.raw as Record<string, unknown>,
        })),
      );
    }

    await supabase
      .from('scraper_runs')
      .update({ status: 'ready_for_review', finished_at: new Date().toISOString() })
      .eq('id', run_id);
  } catch (err) {
    logger.error({ err, run_id }, 'scraper: run failed');
    await supabase
      .from('scraper_runs')
      .update({
        status: 'failed',
        error_message: (err as Error).message?.slice(0, 500) ?? 'unknown',
        finished_at: new Date().toISOString(),
      })
      .eq('id', run_id);
  }
}

/* ─── Page discovery ─── */

async function discoverProductPages(rootUrl: string): Promise<string[]> {
  const root = normalizeUrl(rootUrl);
  if (!root) return [];
  const pages = new Set<string>([root]);

  // Common catalog/shop paths
  const common = ['/products', '/shop', '/store', '/catalog', '/menu', '/collections'];
  for (const path of common) pages.add(joinUrl(root, path));

  // Crawl root once and harvest internal links that look product-ish
  const html = await fetchHtml(root).catch(() => null);
  if (html) {
    const $ = cheerio.load(html);
    $('a[href]').each((_: number, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const abs = joinUrl(root, href);
      if (!abs) return;
      // Same origin only
      if (new URL(abs).origin !== new URL(root).origin) return;
      // Heuristic — looks like a product or catalog listing
      if (/\/(product|item|menu|collection|shop|store|catalog)/i.test(abs)) {
        pages.add(abs);
      }
    });
  }

  return [...pages].slice(0, MAX_PAGES);
}

/* ─── Per-page extraction ─── */

async function extractFromUrl(url: string): Promise<ExtractedProduct[]> {
  const html = await fetchHtml(url);
  if (!html) return [];
  const $ = cheerio.load(html);

  // 1. JSON-LD
  const jsonLd: ExtractedProduct[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).contents().text();
      if (!text) return;
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      for (const node of arr) {
        const flat = flattenGraph(node);
        for (const item of flat) {
          if (!item || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const t = (rec['@type'] ?? '') as string | string[];
          const types = Array.isArray(t) ? t : [t];
          if (!types.some((x) => /Product/i.test(x ?? ''))) continue;
          const p = jsonLdToProduct(rec, url);
          if (p) jsonLd.push(p);
        }
      }
    } catch {/* malformed JSON-LD, skip */}
  });
  if (jsonLd.length > 0) return jsonLd;

  // 2. OpenGraph (single-product pages)
  const ogProduct = ogToProduct($, url);
  if (ogProduct) return [ogProduct];

  // 3. CSS heuristics — repeated cards with image + currency string
  return cssHeuristic($, url);
}

function jsonLdToProduct(node: Record<string, unknown>, url: string): ExtractedProduct | null {
  const name = String(node.name ?? '').trim();
  if (!name) return null;
  const desc = typeof node.description === 'string' ? node.description.trim() : null;
  const image = (() => {
    const i = node.image;
    if (typeof i === 'string') return i;
    if (Array.isArray(i) && typeof i[0] === 'string') return i[0];
    if (i && typeof i === 'object' && 'url' in (i as object))
      return String((i as { url: unknown }).url ?? '');
    return null;
  })();
  const offers = node.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const priceStr = offer?.price ?? offer?.lowPrice ?? null;
  const price = priceStr != null ? Number(String(priceStr).replace(/[^\d.]/g, '')) : null;
  const currency = (offer?.priceCurrency as string | undefined) ?? null;
  const category = (node.category as string | undefined) ?? null;
  return {
    name,
    description: desc,
    price: Number.isFinite(price) ? (price as number) : null,
    currency,
    image_url: image,
    source_url: url,
    category,
    raw: node,
  };
}

function ogToProduct($: cheerio.CheerioAPI, url: string): ExtractedProduct | null {
  const ogType = $('meta[property="og:type"]').attr('content') ?? '';
  if (!/product/i.test(ogType)) return null;
  const name = $('meta[property="og:title"]').attr('content')?.trim();
  if (!name) return null;
  const desc = $('meta[property="og:description"]').attr('content')?.trim() ?? null;
  const image = $('meta[property="og:image"]').attr('content')?.trim() ?? null;
  const priceRaw = $('meta[property="product:price:amount"]').attr('content') ?? '';
  const currency = $('meta[property="product:price:currency"]').attr('content') ?? null;
  const price = priceRaw ? Number(priceRaw) : null;
  return {
    name,
    description: desc,
    price: Number.isFinite(price) ? (price as number) : null,
    currency,
    image_url: image,
    source_url: url,
    category: null,
    raw: { source: 'og' },
  };
}

function cssHeuristic($: cheerio.CheerioAPI, url: string): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  // Look for cards: elements that contain at least one <img> and at least one
  // text node matching a currency pattern.
  $('article, li, div').each((_, el) => {
    const $el = $(el);
    if ($el.find('article, li').length > 0) return; // skip wrappers
    const img = $el.find('img').first();
    const imgSrc = img.attr('src') ?? img.attr('data-src');
    if (!imgSrc) return;
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 8 || text.length > 600) return;
    const currencyMatch = text.match(CURRENCY_RE);
    if (!currencyMatch) return;
    const name = ($el.find('h1, h2, h3, h4, .title, [class*="name"]').first().text() || '').trim();
    if (!name || name.length > 160) return;
    out.push({
      name: name.slice(0, 160),
      description: text.slice(0, 320),
      price: Number(currencyMatch[1]?.replace(/,/g, '') ?? 'NaN') || null,
      currency: null,
      image_url: absoluteUrl(url, imgSrc),
      source_url: url,
      category: null,
      raw: { source: 'css' },
    });
    if (out.length >= 30) return false; // stop after a reasonable batch
    return;
  });
  return out;
}

/* ─── Vision enrichment ─── */

const VisionDescSchema = z.object({
  description: z.string().describe('One to two factual sentences, max 240 chars.'),
});

async function enrichWithVision(p: ExtractedProduct): Promise<string | null> {
  if (!p.image_url) return null;
  const bytes = await fetchImage(p.image_url);
  if (!bytes) return null;
  const { object } = await generateObject({
    model: models.classifier,
    schema: VisionDescSchema,
    system:
      `Write a factual product description for the image (1-2 short sentences, ≤240 chars). Mention what it is, distinctive features, and any visible specs. Do NOT invent attributes you cannot see. Do NOT mention price or availability.`,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `Product name (for context): ${p.name}` },
          { type: 'image', image: bytes },
        ],
      },
    ],
    temperature: 0,
    maxRetries: 1,
  });
  return object.description.trim() || null;
}

/* ─── HTTP + URL helpers ─── */

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function normalizeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim().startsWith('http') ? input.trim() : `https://${input.trim()}`);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function joinUrl(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return '';
  }
}

function absoluteUrl(base: string, rel: string): string | null {
  try {
    return new URL(rel, base).toString();
  } catch {
    return null;
  }
}

/** JSON-LD often nests products inside an @graph array. Flatten one level. */
function flattenGraph(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj['@graph'])) return obj['@graph'];
  return [obj];
}
