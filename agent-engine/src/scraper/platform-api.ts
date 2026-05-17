/**
 * Platform-API extractor.
 *
 * Most modern e-commerce sites are SPAs (Vue, React, Next.js client-only)
 * whose product cards are rendered by JavaScript fetching a JSON API
 * client-side. cheerio can't see those products. But the underlying APIs
 * are usually public and predictable per platform.
 *
 * This module probes well-known endpoints and parses them directly,
 * bypassing the rendered HTML entirely. Runs BEFORE the HTML scraper —
 * if any API returns products, we skip cheerio.
 *
 * Supported today:
 *   - Bagisto   → /api/products?page=N
 *   - Shopify   → /products.json?page=N   (works for ALL Shopify stores)
 *   - WooCommerce Store API → /wp-json/wc/store/products?page=N
 *
 * Each adapter normalises to the shared ExtractedProduct shape used by the
 * rest of the scraper.
 */
import { logger } from '../lib/logger.js';

const TIMEOUT_MS = 10_000;
const USER_AGENT = 'EasternAI-Vector-Scraper/1.0 (+https://eastern.ai)';
const MAX_PAGES = 6;       // ~6 pages = 60-300 products depending on platform
const MAX_PRODUCTS = 200;

export interface ExtractedProduct {
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  source_url: string;
  category: string | null;
  raw: unknown;
}

export interface PlatformApiResult {
  platform: 'bagisto' | 'shopify' | 'woocommerce' | null;
  products: ExtractedProduct[];
  endpoint_tried: string[];
  endpoint_hit: string | null;
}

export async function tryPlatformApi(rootUrl: string): Promise<PlatformApiResult> {
  const tried: string[] = [];
  // Order matters — try most-likely first. Stop on first success.
  const adapters: Array<{ name: PlatformApiResult['platform']; probe: () => Promise<ExtractedProduct[] | null>; endpoint: string }> = [
    {
      name: 'shopify',
      endpoint: joinUrl(rootUrl, '/products.json'),
      probe: () => probeShopify(rootUrl),
    },
    {
      name: 'bagisto',
      endpoint: joinUrl(rootUrl, '/api/products'),
      probe: () => probeBagisto(rootUrl),
    },
    {
      name: 'woocommerce',
      endpoint: joinUrl(rootUrl, '/wp-json/wc/store/products'),
      probe: () => probeWoocommerce(rootUrl),
    },
  ];

  for (const a of adapters) {
    tried.push(a.endpoint);
    try {
      const products = await a.probe();
      if (products && products.length > 0) {
        return { platform: a.name, products, endpoint_tried: tried, endpoint_hit: a.endpoint };
      }
    } catch (err) {
      logger.warn({ err, platform: a.name }, 'platform-api probe threw');
    }
  }

  return { platform: null, products: [], endpoint_tried: tried, endpoint_hit: null };
}

/* ─── Shopify ─── */

async function probeShopify(rootUrl: string): Promise<ExtractedProduct[] | null> {
  const all: ExtractedProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = joinUrl(rootUrl, `/products.json?limit=50&page=${page}`);
    const json = await fetchJson(url);
    if (!json) return all.length > 0 ? all : null;
    const products = (json as { products?: unknown[] }).products;
    if (!Array.isArray(products) || products.length === 0) break;
    for (const p of products as Array<Record<string, unknown>>) {
      const variants = Array.isArray(p.variants) ? (p.variants as Array<Record<string, unknown>>) : [];
      const variant = variants[0] ?? {};
      const images = Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>) : [];
      const image = images[0];
      const handle = String(p.handle ?? '');
      all.push({
        name: String(p.title ?? '').trim(),
        description: stripHtml(String(p.body_html ?? '')) || null,
        price: numeric(variant.price ?? variant.compare_at_price),
        currency: null,
        image_url: typeof image?.src === 'string' ? image.src : null,
        source_url: handle ? joinUrl(rootUrl, `/products/${handle}`) : rootUrl,
        category: typeof p.product_type === 'string' ? p.product_type : null,
        raw: p,
      });
      if (all.length >= MAX_PRODUCTS) return all;
    }
    if (products.length < 50) break; // last page
  }
  return all.length > 0 ? all : null;
}

/* ─── Bagisto (v2) ─── */

async function probeBagisto(rootUrl: string): Promise<ExtractedProduct[] | null> {
  const all: ExtractedProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = joinUrl(rootUrl, `/api/products?page=${page}`);
    const json = await fetchJson(url);
    if (!json) return all.length > 0 ? all : null;
    const data = (json as { data?: unknown[]; meta?: { last_page?: number } }).data;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const p of data as Array<Record<string, unknown>>) {
      const baseImage = p.base_image as Record<string, unknown> | undefined;
      const image_url =
        (typeof baseImage?.large_image_url === 'string' ? baseImage.large_image_url : null) ||
        (typeof baseImage?.medium_image_url === 'string' ? baseImage.medium_image_url : null);
      const urlKey = typeof p.url_key === 'string' ? p.url_key : '';
      const price =
        numeric(p.min_price) ||
        numeric((p.prices as Record<string, unknown> | undefined)?.regular_price) ||
        numericFromHtml(p.price_html);
      all.push({
        name: String(p.name ?? '').trim(),
        description: stripHtml(String(p.description ?? '')) || null,
        price,
        currency: null,
        image_url,
        source_url: urlKey ? joinUrl(rootUrl, '/' + urlKey) : rootUrl,
        category: null,
        raw: p,
      });
      if (all.length >= MAX_PRODUCTS) return all;
    }
    const meta = (json as { meta?: { last_page?: number; current_page?: number } }).meta;
    if (meta?.last_page && meta.current_page && meta.current_page >= meta.last_page) break;
  }
  return all.length > 0 ? all : null;
}

/* ─── WooCommerce Store API ─── */

async function probeWoocommerce(rootUrl: string): Promise<ExtractedProduct[] | null> {
  const all: ExtractedProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = joinUrl(rootUrl, `/wp-json/wc/store/products?page=${page}&per_page=50`);
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (!res || !res.ok) return all.length > 0 ? all : null;
    const arr = await res.json().catch(() => null);
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr as Array<Record<string, unknown>>) {
      const prices = p.prices as Record<string, unknown> | undefined;
      const images = Array.isArray(p.images) ? (p.images as Array<Record<string, unknown>>) : [];
      // WooCommerce Store API returns prices in minor units divided by `currency_minor_unit`
      const rawPrice = typeof prices?.price === 'string' ? Number(prices.price) : null;
      const minorUnit = typeof prices?.currency_minor_unit === 'number' ? prices.currency_minor_unit : 2;
      const price = rawPrice != null && Number.isFinite(rawPrice)
        ? rawPrice / Math.pow(10, minorUnit)
        : null;
      const categories = Array.isArray(p.categories) ? (p.categories as Array<Record<string, unknown>>) : [];
      all.push({
        name: stripHtml(String(p.name ?? '')).trim(),
        description: stripHtml(String(p.description ?? '')) || null,
        price,
        currency: typeof prices?.currency_code === 'string' ? prices.currency_code : null,
        image_url: typeof images[0]?.src === 'string' ? images[0]!.src : null,
        source_url: typeof p.permalink === 'string' ? p.permalink : rootUrl,
        category: typeof categories[0]?.name === 'string' ? categories[0]!.name : null,
        raw: p,
      });
      if (all.length >= MAX_PRODUCTS) return all;
    }
    if (arr.length < 50) break;
  }
  return all.length > 0 ? all : null;
}

/* ─── Helpers ─── */

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function numeric(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numericFromHtml(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gis, '')
    .replace(/<script[^>]*>.*?<\/script>/gis, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function joinUrl(base: string, rel: string): string {
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}
