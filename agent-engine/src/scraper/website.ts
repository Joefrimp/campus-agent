/**
 * HTML extraction helpers + the public runScraperJob entrypoint.
 *
 * The agentic loop in agentic.ts orchestrates planning, validation, and
 * the reasoning trail. This module owns the low-level primitives:
 *   - fetchHtmlWithStatus(url): bytes + HTTP status
 *   - discoverProductPages(rootUrl): heuristic URL discovery
 *   - extractFromHtml(url): try JSON-LD → OpenGraph → CSS heuristic
 *
 * Gemini Vision enrichment for thin descriptions still lives here.
 */
import * as cheerio from 'cheerio';
import { generateObject } from 'ai';
import { z } from 'zod';
import { models } from '../lib/gemini.js';
import { runAgenticScrape } from './agentic.js';
import type { ExtractedProduct } from './platform-api.js';

const CURRENCY_RE = /(?:GH[¢₵]|GHS|₵|\$|€|£|₦|R)?\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i;
const MAX_PAGES = 8;
const REQUEST_TIMEOUT_MS = 12_000;
const USER_AGENT = 'EasternAI-Vector-Scraper/1.0 (+https://eastern.ai)';

/* ═══════════════════════════════════════════════════════════════
   PUBLIC ENTRYPOINT — delegates to the agentic loop
   ═══════════════════════════════════════════════════════════════ */

export async function runScraperJob(run_id: string, user_id: string, source_url: string): Promise<void> {
  await runAgenticScrape(run_id, user_id, source_url);
}

/* ═══════════════════════════════════════════════════════════════
   PAGE DISCOVERY
   ═══════════════════════════════════════════════════════════════ */

export async function discoverProductPages(rootUrl: string): Promise<string[]> {
  const root = normalizeUrl(rootUrl);
  if (!root) return [];
  const pages = new Set<string>([root]);

  const common = [
    '/products', '/shop', '/store', '/catalog', '/catalogue',
    '/menu', '/collections', '/services', '/items', '/all-products',
  ];
  for (const path of common) pages.add(joinUrl(root, path));

  const html = await fetchHtml(root).catch(() => null);
  if (html) {
    const $ = cheerio.load(html);
    const sameOriginLinks: string[] = [];
    $('a[href]').each((_: number, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      const abs = joinUrl(root, href);
      if (!abs) return;
      try {
        if (new URL(abs).origin !== new URL(root).origin) return;
      } catch {
        return;
      }
      sameOriginLinks.push(abs);
      if (/\/(product|item|menu|collection|shop|store|catalog|catalogue|service|cart|order|book|category|categories)/i.test(abs)) {
        pages.add(abs);
      }
    });
    if (pages.size <= common.length + 1) {
      for (const link of sameOriginLinks.slice(0, 8)) pages.add(link);
    }
  }
  return [...pages].slice(0, MAX_PAGES);
}

/* ═══════════════════════════════════════════════════════════════
   PER-PAGE EXTRACTION
   ═══════════════════════════════════════════════════════════════ */

export interface HtmlExtractResult {
  items: ExtractedProduct[];
  method: 'jsonld' | 'og' | 'css' | 'none';
  /** Set when items is empty — human-readable reason. */
  reason: string | null;
}

export async function extractFromHtml(url: string): Promise<HtmlExtractResult> {
  const { html, statusCode } = await fetchHtmlWithStatus(url);
  if (!html) {
    return {
      items: [],
      method: 'none',
      reason:
        statusCode === null
          ? 'request failed (timeout / network / non-HTML response)'
          : `HTTP ${statusCode}` + (statusCode === 403 || statusCode === 429 ? ' — site is blocking our scraper' : ''),
    };
  }
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
  if (jsonLd.length > 0) return { items: jsonLd, method: 'jsonld', reason: null };

  // 2. OpenGraph (single product pages)
  const og = ogToProduct($, url);
  if (og) return { items: [og], method: 'og', reason: null };

  // 3. CSS heuristic — repeated cards
  const css = cssHeuristic($, url);
  if (css.length > 0) return { items: css, method: 'css', reason: null };

  return { items: [], method: 'none', reason: diagnosePageEmpty($) };
}

function diagnosePageEmpty($: cheerio.CheerioAPI): string {
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const scriptTags = $('script').length;
  const visibleTextChars = bodyText.length;
  if (scriptTags >= 5 && visibleTextChars < 500) {
    return 'page looks like a JavaScript SPA shell — products are rendered client-side';
  }
  if (visibleTextChars < 200) return 'page nearly empty';
  if (!/(\$|₵|GH|£|€|N|R|\d+\.\d{2})/.test(bodyText)) {
    return 'no currency-like prices found anywhere';
  }
  if ($('img').length < 3) return 'fewer than 3 images — not catalogue-shaped';
  return 'page has images and prices but markup did not match any extractor';
}

/* ═══════════════════════════════════════════════════════════════
   EXTRACTORS (per-method)
   ═══════════════════════════════════════════════════════════════ */

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
  $('article, li, div, section').each((_, el) => {
    const $el = $(el);
    if ($el.find('article, li, section').length > 0) return;
    const img = $el.find('img').first();
    const imgSrc = img.attr('src') ?? img.attr('data-src') ?? img.attr('data-original') ?? img.attr('srcset')?.split(' ')[0];
    if (!imgSrc) return;
    const text = $el.text().replace(/\s+/g, ' ').trim();
    if (text.length < 4 || text.length > 800) return;
    const name = (
      $el.find('h1, h2, h3, h4, h5, .title, [class*="name"], [class*="product-title"], [class*="title"], a[class*="title"]').first().text() ||
      img.attr('alt') ||
      ''
    ).trim();
    if (!name || name.length > 200) return;
    const currencyMatch = text.match(CURRENCY_RE);
    out.push({
      name: name.slice(0, 200),
      description: text.slice(0, 320),
      price: currencyMatch ? Number(currencyMatch[1]?.replace(/,/g, '') ?? 'NaN') || null : null,
      currency: null,
      image_url: absoluteUrl(url, imgSrc),
      source_url: url,
      category: null,
      raw: { source: 'css' },
    });
    if (out.length >= 30) return false;
    return;
  });
  return out;
}

/* ═══════════════════════════════════════════════════════════════
   HTTP + URL UTILS
   ═══════════════════════════════════════════════════════════════ */

export async function fetchHtmlWithStatus(
  url: string,
): Promise<{ html: string | null; statusCode: number | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    const statusCode = res.status;
    if (!res.ok) return { html: null, statusCode };
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('text/html')) return { html: null, statusCode };
    return { html: await res.text(), statusCode };
  } catch {
    return { html: null, statusCode: null };
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  const { html } = await fetchHtmlWithStatus(url);
  return html;
}

export async function fetchImage(url: string): Promise<Uint8Array | null> {
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

function flattenGraph(node: unknown): unknown[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (Array.isArray(obj['@graph'])) return obj['@graph'];
  return [obj];
}

/* ═══════════════════════════════════════════════════════════════
   VISION ENRICHMENT (called by agentic.ts when descriptions are thin)
   ═══════════════════════════════════════════════════════════════ */

const VisionDescSchema = z.object({
  description: z.string().describe('One to two factual sentences, max 240 chars.'),
});

export async function enrichWithVision(p: ExtractedProduct): Promise<string | null> {
  if (!p.image_url) return null;
  const bytes = await fetchImage(p.image_url);
  if (!bytes) return null;
  const { object } = await generateObject({
    model: models.classifier,
    schema: VisionDescSchema,
    system:
      'Write a factual product description for the image (1-2 short sentences, ≤240 chars). Mention what it is, distinctive features, and any visible specs. Do NOT invent attributes you cannot see. Do NOT mention price or availability.',
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
