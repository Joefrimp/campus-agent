/**
 * Website catalogue scraper — HTTP endpoints.
 *
 *   POST /scraper/start             { user_id, source_url } -> { run_id }
 *   GET  /scraper/runs              ?user_id=...           -> recent runs
 *   GET  /scraper/imports           ?user_id=...&run_id=.. -> pending rows
 *   POST /scraper/imports/decision  { user_id, ids[], action } -> applies
 *
 * The scraper job runs in the background; the start endpoint returns
 * immediately with the run_id and the frontend polls /scraper/runs and
 * /scraper/imports to render progress.
 */
import type { Context } from 'hono';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { runScraperJob } from '../scraper/website.js';

/* ── start ── */

const StartSchema = z.object({
  user_id: z.string().uuid(),
  source_url: z.string().url(),
});

export async function handleScraperStart(c: Context): Promise<Response> {
  const parsed = StartSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  const { user_id, source_url } = parsed.data;

  // Reject if a run is already in-flight for this user
  const { data: inflight } = await supabase
    .from('scraper_runs')
    .select('id, status')
    .eq('user_id', user_id)
    .in('status', ['queued', 'crawling', 'enriching'])
    .limit(1);
  if (inflight && inflight.length > 0) {
    return c.json(
      { success: false, error: 'An import is already running. Wait for it to finish.' },
      200,
    );
  }

  const { data: row, error } = await supabase
    .from('scraper_runs')
    .insert({ user_id, source_url, status: 'queued' })
    .select('id')
    .single();
  if (error || !row) {
    logger.error({ err: error }, 'scraper_runs insert failed');
    return c.json({ success: false, error: 'Could not start import' }, 200);
  }

  // Fire and forget — return run_id immediately
  setImmediate(() => {
    runScraperJob(row.id, user_id, source_url).catch((err) =>
      logger.error({ err, run_id: row.id }, 'background scraper job threw'),
    );
  });

  return c.json({ success: true, run_id: row.id });
}

/* ── runs ── */

export async function handleScraperRuns(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(user_id))
    return c.json({ success: false, error: 'invalid user_id' }, 400);
  const { data } = await supabase
    .from('scraper_runs')
    .select('id, source_url, status, total_found, approved_count, rejected_count, error_message, started_at, finished_at, pages_visited, pages_with_products, diagnostics, hint, reasoning_trail, current_step')
    .eq('user_id', user_id)
    .order('started_at', { ascending: false })
    .limit(20);
  return c.json({ success: true, runs: data ?? [] });
}

/* ── imports list ── */

export async function handleScraperImports(c: Context): Promise<Response> {
  const user_id = c.req.query('user_id') ?? '';
  const run_id = c.req.query('run_id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(user_id))
    return c.json({ success: false, error: 'invalid user_id' }, 400);

  let q = supabase
    .from('pending_catalogue_imports')
    .select('id, name, description, price, currency, image_url, category, source_url, state, created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (run_id) q = q.eq('run_id', run_id);

  const { data } = await q;
  return c.json({ success: true, imports: data ?? [] });
}

/* ── decision (approve / reject / approve-all-pending) ── */

const DecisionSchema = z.object({
  user_id: z.string().uuid(),
  ids: z.array(z.string().uuid()).optional(),  // omit + scope='all_pending' for bulk
  run_id: z.string().uuid().optional(),
  action: z.enum(['approve', 'reject']),
  scope: z.enum(['ids', 'all_pending']).default('ids'),
});

export async function handleScraperDecision(c: Context): Promise<Response> {
  const parsed = DecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ success: false, error: 'invalid payload' }, 400);
  const { user_id, ids, run_id, action, scope } = parsed.data;

  // Resolve which rows we're acting on
  let rowsQuery = supabase
    .from('pending_catalogue_imports')
    .select('id, name, description, price, currency, image_url, category')
    .eq('user_id', user_id)
    .eq('state', 'pending');

  if (scope === 'ids') {
    if (!ids || ids.length === 0)
      return c.json({ success: false, error: 'ids required for scope=ids' }, 400);
    rowsQuery = rowsQuery.in('id', ids);
  } else if (run_id) {
    rowsQuery = rowsQuery.eq('run_id', run_id);
  }
  const { data: rows } = await rowsQuery;
  if (!rows || rows.length === 0) return c.json({ success: true, processed: 0 });

  if (action === 'reject') {
    await supabase
      .from('pending_catalogue_imports')
      .update({ state: 'rejected', reviewed_at: new Date().toISOString() })
      .in(
        'id',
        rows.map((r: { id: string }) => r.id),
      );
    if (run_id) await bumpRunCounters(run_id, { rejected: rows.length });
    return c.json({ success: true, processed: rows.length });
  }

  // approve: insert into price_list, mark imported with FK back.
  let approved = 0;
  for (const r of rows as Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string | null;
    image_url: string | null;
    category: string | null;
  }>) {
    const { data: inserted, error } = await supabase
      .from('price_list')
      .insert({
        user_id,
        name: r.name,
        description: r.description,
        price: r.price,
        image_url: r.image_url,
        category: r.category,
        in_stock: true,
        kind: 'product',
      })
      .select('id')
      .single();
    if (error || !inserted) {
      logger.warn({ err: error, name: r.name }, 'approve import: price_list insert failed');
      continue;
    }
    await supabase
      .from('pending_catalogue_imports')
      .update({
        state: 'imported',
        reviewed_at: new Date().toISOString(),
        imported_to_id: inserted.id,
      })
      .eq('id', r.id);
    approved++;
  }
  if (run_id && approved > 0) await bumpRunCounters(run_id, { approved });
  return c.json({ success: true, processed: approved });
}

async function bumpRunCounters(
  run_id: string,
  inc: { approved?: number; rejected?: number },
): Promise<void> {
  const { data } = await supabase
    .from('scraper_runs')
    .select('approved_count, rejected_count')
    .eq('id', run_id)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from('scraper_runs')
    .update({
      approved_count: (data.approved_count ?? 0) + (inc.approved ?? 0),
      rejected_count: (data.rejected_count ?? 0) + (inc.rejected ?? 0),
    })
    .eq('id', run_id);
}
