-- Scraper run diagnostics — explain WHY a run found 0 products.
-- Run AFTER 014_catalogue_imports.sql.

alter table public.scraper_runs
  add column if not exists pages_visited int default 0;

alter table public.scraper_runs
  add column if not exists pages_with_products int default 0;

-- Per-page outcome breakdown. Shape (array of):
--   { url, status_code, html_kb, method_tried, products_found, skip_reason }
alter table public.scraper_runs
  add column if not exists diagnostics jsonb;

-- One-paragraph human-readable hint surfaced in the dashboard, set when
-- total_found = 0. Examples:
--   "site is a JavaScript SPA — products render client-side, scraper can't see them"
--   "site returned 403 / blocked scraper user-agent"
--   "no recognizable product markup (no JSON-LD, OpenGraph, or product cards)"
alter table public.scraper_runs
  add column if not exists hint text;
