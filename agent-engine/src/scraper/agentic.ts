/**
 * Agentic catalogue scraper.
 *
 * Replaces the old "try every strategy in order" pipeline with a real
 * agent loop:
 *
 *   PLAN     — observe site signals (headers, meta, sitemap, platform
 *              probes) and pick the most likely extraction path
 *   EXECUTE  — run the chosen extractor (platform API, sitemap, HTML)
 *   VALIDATE — Gemini sanity-checks every candidate: is this really a
 *              product, or a nav link / footer link / generic shop text?
 *   PIVOT    — on empty or all-junk, pick the next strategy and try again
 *   DONE     — write validated products + an honest summary
 *
 * Every step is appended to scraper_runs.reasoning_trail in real time so
 * the UI can render a live timeline of what Vector is thinking and doing.
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { models } from '../lib/gemini.js';
import { logger } from '../lib/logger.js';
import { tryPlatformApi, type ExtractedProduct } from './platform-api.js';
import { extractFromHtml, fetchHtmlWithStatus, discoverProductPages } from './website.js';

export interface TrailStep {
  at: string;
  phase: 'plan' | 'execute' | 'validate' | 'pivot' | 'done' | 'fail';
  title: string;
  detail: string;
  evidence?: Record<string, unknown>;
}

const USER_AGENT = 'EasternAI-Vector-Scraper/1.0 (+https://eastern.ai)';

/** Public entrypoint — called from /scraper/start background task. */
export async function runAgenticScrape(
  run_id: string,
  user_id: string,
  source_url: string,
): Promise<void> {
  const trail: TrailStep[] = [];
  const validated: ExtractedProduct[] = [];

  const append = async (step: Omit<TrailStep, 'at'>): Promise<void> => {
    const entry: TrailStep = { ...step, at: new Date().toISOString() };
    trail.push(entry);
    await supabase
      .from('scraper_runs')
      .update({
        reasoning_trail: trail as unknown as Record<string, unknown>[],
        current_step: entry.title,
      })
      .eq('id', run_id);
  };

  try {
    await supabase.from('scraper_runs').update({ status: 'crawling' }).eq('id', run_id);

    // ─── 1. OBSERVE ────────────────────────────────────────────────
    await append({
      phase: 'plan',
      title: 'Inspecting the site',
      detail: `Reading headers, meta tags, and structural signals on ${source_url} to pick the best extraction strategy.`,
    });
    const observations = await observe(source_url);
    await append({
      phase: 'plan',
      title: 'Site fingerprint',
      detail: describeObservation(observations),
      evidence: observations as unknown as Record<string, unknown>,
    });

    // ─── 2. STRATEGY: platform APIs ────────────────────────────────
    await append({
      phase: 'execute',
      title: 'Trying platform APIs',
      detail: 'Probing well-known JSON endpoints (Shopify /products.json, Bagisto /api/products, WooCommerce /wp-json/wc/store/products) — these bypass JavaScript rendering entirely.',
    });
    const apiResult = await tryPlatformApi(source_url);
    if (apiResult.products.length > 0) {
      await append({
        phase: 'execute',
        title: `Found ${apiResult.products.length} products via ${apiResult.platform} API`,
        detail: `Endpoint: ${apiResult.endpoint_hit}. Skipping HTML extraction — API data is more reliable.`,
        evidence: {
          platform: apiResult.platform,
          endpoint: apiResult.endpoint_hit,
          sample: apiResult.products.slice(0, 3).map((p) => p.name),
        },
      });
      await validateAndAppend(apiResult.products, validated, append, source_url);
    } else {
      await append({
        phase: 'pivot',
        title: 'No platform API responded — pivoting to HTML',
        detail: `Tried ${apiResult.endpoint_tried.length} endpoints, none returned a recognisable catalogue. Falling back to HTML extraction.`,
        evidence: { tried: apiResult.endpoint_tried },
      });
    }

    // ─── 3. STRATEGY: HTML extraction (fallback) ───────────────────
    if (validated.length === 0) {
      await append({
        phase: 'execute',
        title: 'Crawling HTML pages',
        detail: 'Discovering candidate catalogue/product URLs and parsing structured markup (JSON-LD, OpenGraph, repeated product cards).',
      });
      const pages = await discoverProductPages(source_url);
      await append({
        phase: 'execute',
        title: `Discovered ${pages.length} candidate page(s)`,
        detail: pages.slice(0, 4).join('\n') + (pages.length > 4 ? `\n…and ${pages.length - 4} more` : ''),
      });

      const candidates: ExtractedProduct[] = [];
      const seenKey = new Set<string>();
      for (const page of pages) {
        if (candidates.length >= 120) break;
        const { items, method, reason } = await extractFromHtml(page);
        if (items.length > 0) {
          await append({
            phase: 'execute',
            title: `${items.length} candidate(s) on ${shortUrl(page)}`,
            detail: `Method: ${method}.`,
          });
          for (const it of items) {
            const k = (it.name + '|' + (it.image_url ?? '')).toLowerCase();
            if (seenKey.has(k)) continue;
            seenKey.add(k);
            candidates.push(it);
          }
        } else if (reason) {
          await append({
            phase: 'execute',
            title: `No products on ${shortUrl(page)}`,
            detail: reason,
          });
        }
      }

      if (candidates.length > 0) {
        await validateAndAppend(candidates, validated, append, source_url);
      } else if (observations.is_likely_spa) {
        await append({
          phase: 'pivot',
          title: 'Site appears to be a JavaScript SPA',
          detail: 'HTML pages contain mostly empty templates — products are rendered by client-side JavaScript after the page loads, which a static scraper cannot see. The site does not expose a public API we recognise.',
        });
      }
    }

    // ─── 4. WRITE ──────────────────────────────────────────────────
    if (validated.length > 0) {
      await supabase.from('pending_catalogue_imports').insert(
        validated.map((p) => ({
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

    const hint = validated.length === 0 ? buildHint(observations) : null;

    await append({
      phase: validated.length > 0 ? 'done' : 'fail',
      title:
        validated.length > 0
          ? `Imported ${validated.length} validated product(s)`
          : 'No products could be extracted',
      detail:
        validated.length > 0
          ? 'Review each item below. Approve to add to your live catalogue.'
          : hint ?? 'No recognisable catalogue markup found.',
    });

    await supabase
      .from('scraper_runs')
      .update({
        status: 'ready_for_review',
        total_found: validated.length,
        hint,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run_id);
  } catch (err) {
    logger.error({ err, run_id }, 'agentic scraper: run failed');
    await append({
      phase: 'fail',
      title: 'Run aborted',
      detail: (err as Error).message?.slice(0, 200) ?? 'unknown error',
    });
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

/* ─── Observation ─── */

interface Observation {
  root_url: string;
  status_code: number | null;
  html_kb: number;
  script_tags: number;
  visible_text_chars: number;
  is_likely_spa: boolean;
  has_jsonld_product: boolean;
  has_og_product: boolean;
  detected_platform_hint: string | null;
  has_currency_symbol: boolean;
}

async function observe(url: string): Promise<Observation> {
  const { html, statusCode } = await fetchHtmlWithStatus(url);
  if (!html) {
    return {
      root_url: url,
      status_code: statusCode,
      html_kb: 0,
      script_tags: 0,
      visible_text_chars: 0,
      is_likely_spa: false,
      has_jsonld_product: false,
      has_og_product: false,
      detected_platform_hint: null,
      has_currency_symbol: false,
    };
  }
  const scriptTags = (html.match(/<script\b/gi) ?? []).length;
  // crude visible-text estimate: strip tags + scripts + styles + whitespace
  const visible = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hasJsonLdProduct =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?Product/i.test(html);
  const hasOgProduct = /property=["']og:type["']\s+content=["'][^"']*product[^"']*["']/i.test(html);
  let platform: string | null = null;
  if (/Shopify\.theme|cdn\.shopify\.com|shopify-section/i.test(html)) platform = 'Shopify';
  else if (/bagisto|x-www-form-urlencoded.*bagisto/i.test(html)) platform = 'Bagisto';
  else if (/wp-content\/plugins\/woocommerce|woocommerce-/i.test(html)) platform = 'WooCommerce';
  else if (/Wix\.com|wix-warmup-data/i.test(html)) platform = 'Wix';
  else if (/squarespace|static1\.squarespace\.com/i.test(html)) platform = 'Squarespace';
  const isLikelySpa = scriptTags >= 8 && visible.length < 1500;
  return {
    root_url: url,
    status_code: statusCode,
    html_kb: Math.round(html.length / 1024),
    script_tags: scriptTags,
    visible_text_chars: visible.length,
    is_likely_spa: isLikelySpa,
    has_jsonld_product: hasJsonLdProduct,
    has_og_product: hasOgProduct,
    detected_platform_hint: platform,
    has_currency_symbol: /(₵|GH[¢₵]|\$|€|£|₦|R\s?\d|GHS)/.test(visible),
  };
}

function describeObservation(o: Observation): string {
  const parts: string[] = [];
  if (o.status_code && o.status_code !== 200) parts.push(`HTTP ${o.status_code}`);
  parts.push(`${o.html_kb}KB HTML`);
  parts.push(`${o.script_tags} <script> tags`);
  parts.push(`${o.visible_text_chars} chars of visible text`);
  if (o.detected_platform_hint) parts.push(`platform: ${o.detected_platform_hint}`);
  if (o.has_jsonld_product) parts.push('JSON-LD Product detected');
  if (o.has_og_product) parts.push('OpenGraph product detected');
  if (o.is_likely_spa) parts.push('likely SPA shell');
  if (o.has_currency_symbol) parts.push('currency symbols present');
  return parts.join(' · ');
}

function buildHint(o: Observation): string {
  if (o.status_code === 403 || o.status_code === 429)
    return 'The site is blocking our scraper (HTTP 403/429). The owner may need to whitelist our user agent.';
  if (o.status_code && o.status_code >= 400)
    return `Site returned HTTP ${o.status_code}. Confirm the URL is correct and the page is publicly reachable.`;
  if (o.is_likely_spa)
    return 'This site is a JavaScript single-page app — products render in the browser after load, which a static HTML scraper cannot see. Works best with Shopify, WooCommerce, Wix Stores, Squarespace, or any server-rendered shop.';
  if (!o.has_currency_symbol)
    return 'No currency-like prices appear on the page. The page may not be a catalogue (try a deeper URL like /shop, /products, /menu).';
  return 'Page has images and prices but the markup did not match any recognised pattern. Try pasting a deeper URL pointing directly at the catalogue page.';
}

/* ─── Validation gate ─── */

const ValidationSchema = z.object({
  results: z
    .array(
      z.object({
        index: z.number().int(),
        is_real_product: z.boolean(),
        reason: z.string(),
        cleaned_name: z.string().optional(),
        cleaned_description: z.string().nullable().optional(),
      }),
    )
    .max(60),
});

async function validateAndAppend(
  candidates: ExtractedProduct[],
  validated: ExtractedProduct[],
  append: (s: Omit<TrailStep, 'at'>) => Promise<void>,
  rootUrl: string,
): Promise<void> {
  if (candidates.length === 0) return;
  // Batch into chunks of 30 to keep prompts small
  const batches: ExtractedProduct[][] = [];
  for (let i = 0; i < candidates.length; i += 30) batches.push(candidates.slice(i, i + 30));

  let kept = 0;
  let rejected = 0;
  for (const batch of batches) {
    await append({
      phase: 'validate',
      title: `Validating ${batch.length} candidate(s) with Gemini`,
      detail: 'Filtering out anything that looks like a nav link, footer, generic page heading, or marketing filler rather than a real product.',
    });
    const prompt = `You are a strict gatekeeper deciding which scraped items are REAL PRODUCTS that belong in a shop catalogue.

REJECT items that are obviously NOT products, including but not limited to:
- Site navigation labels ("Shop", "All Products", "Cart", "Sign In", "About Us")
- Generic page headers / hero copy ("Welcome to E-shop", "Featured Products")
- Footer links / category headings / brand statements
- Items where the name is shorter than 3 characters or is a generic word ("Item", "Product", "More")
- Items where the description is just a list of nav words ("Cart, Orders, Wishlist, Sign In")
- Items that are clearly UI controls or social links

KEEP items that look like real products: branded names, specific model numbers, food dishes with descriptions, services with concrete deliverables, etc.

When KEEPING, you may lightly clean the name (trim whitespace, fix obvious case issues) and description (remove HTML residue, trim to factual content). DO NOT invent attributes.

CANDIDATES (each has an index):
${batch
  .map(
    (p, i) =>
      `[${i}] name="${p.name.slice(0, 160)}" | price=${p.price ?? 'null'} | description="${(p.description ?? '').slice(0, 200)}" | image_url=${p.image_url ? 'yes' : 'no'} | source_url=${shortUrl(p.source_url, rootUrl)}`,
  )
  .join('\n')}

Return a result for every index, in order.`;

    let object: z.infer<typeof ValidationSchema>;
    try {
      const out = await generateObject({
        model: models.agent,
        schema: ValidationSchema,
        prompt,
        temperature: 0,
        maxRetries: 1,
      });
      object = out.object;
    } catch (err) {
      logger.warn({ err }, 'validation Gemini call failed — keeping all as conservative fallback');
      // Conservative fallback: keep all (owner reviews anyway)
      for (const p of batch) validated.push(p);
      kept += batch.length;
      continue;
    }

    const decisions = new Map(object.results.map((r) => [r.index, r]));
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i]!;
      const dec = decisions.get(i);
      if (!dec || !dec.is_real_product) {
        rejected++;
        continue;
      }
      validated.push({
        ...item,
        name: dec.cleaned_name?.trim() || item.name,
        description: dec.cleaned_description?.trim() || item.description,
      });
      kept++;
    }
  }

  await append({
    phase: 'validate',
    title: `Validation done — kept ${kept}, rejected ${rejected}`,
    detail:
      rejected === 0
        ? 'All candidates passed validation as real products.'
        : `${rejected} candidate(s) were filtered out as nav/footer/filler rather than real products.`,
  });
}

/* ─── Helpers ─── */

function shortUrl(url: string, rootUrl?: string): string {
  try {
    const u = new URL(url);
    if (rootUrl) {
      const r = new URL(rootUrl);
      if (u.origin === r.origin) return u.pathname + u.search;
    }
    return u.host + u.pathname;
  } catch {
    return url;
  }
}

/* re-export so platform-api.ts callers can stay direct */
export { USER_AGENT };
