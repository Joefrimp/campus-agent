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

interface PageDiagnostic {
  url: string;
  status_code: number | null;
  html_kb: number;
  method_tried: 'jsonld' | 'og' | 'css' | 'none';
  products_found: number;
  skip_reason: string | null;
}

export async function runScraperJob(run_id: string, user_id: string, source_url: string): Promise<void> {
  try {
    await supabase.from('scraper_runs').update({ status: 'crawling' }).eq('id', run_id);

    const pagesToVisit = await discoverProductPages(source_url);
    logger.info({ run_id, pages: pagesToVisit.length, source_url }, 'scraper: discovered pages');

    const seen = new Set<string>();
    const products: ExtractedProduct[] = [];
    const diagnostics: PageDiagnostic[] = [];
    let pagesWithProducts = 0;

    for (const url of pagesToVisit) {
      if (products.length >= 100) break;
      const result = await extractFromUrlWithDiag(url).catch((err) => {
        logger.warn({ err, url }, 'scraper: page failed');
        const fallback: { items: ExtractedProduct[]; diag: PageDiagnostic } = {
          items: [],
          diag: {
            url,
            status_code: null,
            html_kb: 0,
            method_tried: 'none',
            products_found: 0,
            skip_reason: `fetch threw: ${(err as Error).message?.slice(0, 100) ?? 'unknown'}`,
          },
        };
        return fallback;
      });
      diagnostics.push(result.diag);
      if (result.items.length > 0) pagesWithProducts++;
      for (const p of result.items) {
        const key = (p.name + '|' + (p.image_url ?? '')).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        products.push(p);
      }
    }

    const hint = products.length === 0 ? summariseFailureHint(diagnostics) : null;

    await supabase
      .from('scraper_runs')
      .update({
        status: 'enriching',
        total_found: products.length,
        pages_visited: pagesToVisit.length,
        pages_with_products: pagesWithProducts,
        diagnostics: diagnostics as unknown as Record<string, unknown>[],
        hint,
      })
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
      // Strong heuristic — explicit product/catalog vocabulary
      if (/\/(product|item|menu|collection|shop|store|catalog|catalogue|service|cart|order|book|category|categories)/i.test(abs)) {
        pages.add(abs);
      }
    });

    // Fallback: if we still only have the root, follow any same-origin link
    // (small business sites often use unconventional paths like /our-work,
    // /pricing, /food, /goods, etc.). Cap aggressively to avoid runaway.
    if (pages.size <= common.length + 1) {
      for (const link of sameOriginLinks.slice(0, 8)) pages.add(link);
    }
  }

  return [...pages].slice(0, MAX_PAGES);
}

/* ─── Per-page extraction (with diagnostics) ─── */

async function extractFromUrlWithDiag(
  url: string,
): Promise<{ items: ExtractedProduct[]; diag: PageDiagnostic }> {
  const { html, statusCode } = await fetchHtmlWithStatus(url);
  const diag: PageDiagnostic = {
    url,
    status_code: statusCode,
    html_kb: html ? Math.round(html.length / 1024) : 0,
    method_tried: 'none',
    products_found: 0,
    skip_reason: null,
  };

  if (!html) {
    diag.skip_reason =
      statusCode === null
        ? 'request failed (timeout / network / non-HTML response)'
        : `HTTP ${statusCode}` + (statusCode === 403 || statusCode === 429 ? ' — site is blocking our scraper' : '');
    return { items: [], diag };
  }

  const $ = cheerio.load(html);

  // 1. JSON-LD (schema.org Product)
  diag.method_tried = 'jsonld';
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
  if (jsonLd.length > 0) {
    diag.products_found = jsonLd.length;
    return { items: jsonLd, diag };
  }

  // 2. OpenGraph product (single-product pages)
  diag.method_tried = 'og';
  const ogProduct = ogToProduct($, url);
  if (ogProduct) {
    diag.products_found = 1;
    return { items: [ogProduct], diag };
  }

  // 3. CSS heuristic — repeated cards
  diag.method_tried = 'css';
  const cssProducts = cssHeuristic($, url);
  if (cssProducts.length > 0) {
    diag.products_found = cssProducts.length;
    return { items: cssProducts, diag };
  }

  // Nothing matched — diagnose why
  diag.skip_reason = diagnosePageEmpty($, html);
  return { items: [], diag };
}

/** Try to explain why a page yielded zero products. */
function diagnosePageEmpty($: cheerio.CheerioAPI, html: string): string {
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const scriptTags = $('script').length;
  const visibleTextChars = bodyText.length;

  // SPA shell heuristic: lots of script tags, very little visible text
  if (scriptTags >= 5 && visibleTextChars < 500) {
    return 'page looks like a JavaScript SPA shell — products are rendered client-side, scraper cannot see them';
  }
  if (visibleTextChars < 200) {
    return 'page is nearly empty (less than 200 chars of visible text)';
  }
  if (!/(\$|₵|GH|£|€|N|R|\d+\.\d{2})/.test(bodyText)) {
    return 'no currency-like prices found anywhere on the page';
  }
  if ($('img').length < 3) {
    return 'fewer than 3 images on the page — not catalogue-shaped';
  }
  // Has prices + images but markup didn't match our patterns
  void html;
  return 'page has images and prices but markup did not match any of our extractors (JSON-LD, OpenGraph, repeated cards). Try a deeper URL like /shop or /products.';
}

/** Aggregate per-page diagnostics into a single human hint for the dashboard. */
function summariseFailureHint(diags: PageDiagnostic[]): string {
  if (diags.length === 0) return 'No pages were crawled — check the URL is correct and publicly reachable.';

  const blocked = diags.filter((d) => d.status_code === 403 || d.status_code === 429).length;
  const fetchFailed = diags.filter((d) => d.status_code === null).length;
  const spaShells = diags.filter((d) => d.skip_reason?.includes('SPA shell')).length;
  const empty = diags.filter((d) => d.skip_reason?.includes('nearly empty')).length;
  const noMatch = diags.filter((d) => d.skip_reason?.includes('did not match')).length;

  if (blocked >= diags.length / 2) {
    return 'The site is blocking our scraper (403/429 responses). The owner may need to whitelist our user agent or use a different platform.';
  }
  if (spaShells >= diags.length / 2) {
    return 'The site is a JavaScript single-page app — products render in the browser after load, which a static HTML scraper cannot see. Works best with Shopify, WooCommerce, Wix Stores, Squarespace, or any server-rendered shop.';
  }
  if (fetchFailed >= diags.length / 2) {
    return 'Could not fetch most pages (timeout or non-HTML response). Confirm the URL is correct and the site is online.';
  }
  if (empty >= diags.length / 2) {
    return 'Pages came back nearly empty. The site might be password-protected or under construction.';
  }
  if (noMatch >= 1) {
    return `Found images and prices on ${noMatch} page(s) but the markup didn't match any of our extractors. Try pasting a deeper URL like the actual catalogue page (e.g. /shop, /products, /menu) instead of the homepage.`;
  }
  return 'No products extracted. Open the run diagnostics for per-page details.';
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
  // Look for cards: elements with at least one <img> and a heading. A currency
  // string is a nice-to-have, not required (small business sites often have
  // no visible price — listed as "from GH₵X" elsewhere or in a "contact for
  // pricing" model). Cards without prices still get imported with price=null
  // and the owner can fill it in before approving.
  $('article, li, div, section').each((_, el) => {
    const $el = $(el);
    if ($el.find('article, li, section').length > 0) return; // skip wrappers
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

async function fetchHtmlWithStatus(
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
