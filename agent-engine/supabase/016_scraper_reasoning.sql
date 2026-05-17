-- Agentic scraper reasoning trail — append-only log of agent steps so the UI
-- can render a live timeline of what Vector is thinking + doing.
-- Run AFTER 015_scraper_diagnostics.sql.

-- Append-only timeline. Each entry shape:
--   {
--     at: "2026-05-17T10:32:01Z",
--     phase: "plan" | "execute" | "validate" | "pivot" | "done" | "fail",
--     title: "Probing platform APIs",
--     detail: "Tried /products.json (Shopify) — 404",
--     evidence: { ... }
--   }
alter table public.scraper_runs
  add column if not exists reasoning_trail jsonb not null default '[]'::jsonb;

-- Convenient view: current step (last entry).
alter table public.scraper_runs
  add column if not exists current_step text;
