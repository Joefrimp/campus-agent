-- Website catalogue importer.
-- Run AFTER 013_tool_planner.sql.
--
-- Flow:
--   1. Owner pastes website URL in Settings → "Import catalogue".
--   2. Backend crawler (cheerio + Gemini Vision) extracts products into
--      pending_catalogue_imports rows scoped to (user_id, run_id).
--   3. Owner reviews in dashboard, approves/rejects per-row or in bulk.
--   4. Approved rows are inserted into price_list and marked imported.

-- ============================================================
-- scraper_runs — one row per "Import" button click
-- ============================================================
create table if not exists public.scraper_runs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  source_url      text not null,
  status          text not null default 'queued'
                  check (status in ('queued','crawling','enriching','ready_for_review','completed','failed')),
  total_found     int default 0,
  approved_count  int default 0,
  rejected_count  int default 0,
  error_message   text,
  started_at      timestamptz default now(),
  finished_at     timestamptz
);
create index if not exists scraper_runs_user_idx
  on public.scraper_runs (user_id, started_at desc);
alter table public.scraper_runs enable row level security;
drop policy if exists "owner reads own scraper runs" on public.scraper_runs;
create policy "owner reads own scraper runs"
  on public.scraper_runs for select using (auth.uid() = user_id);

-- ============================================================
-- pending_catalogue_imports — one row per discovered product
-- ============================================================
create table if not exists public.pending_catalogue_imports (
  id                uuid primary key default uuid_generate_v4(),
  run_id            uuid not null references public.scraper_runs(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  source_url        text,
  name              text not null,
  description       text,
  price             numeric,
  currency          text default 'GHS',
  image_url         text,
  category          text,
  raw_data          jsonb,
  state             text not null default 'pending'
                    check (state in ('pending','approved','rejected','imported')),
  reviewed_at       timestamptz,
  imported_to_id    uuid references public.price_list(id) on delete set null,
  created_at        timestamptz default now()
);
create index if not exists pending_imports_user_state_idx
  on public.pending_catalogue_imports (user_id, state, created_at desc);
create index if not exists pending_imports_run_idx
  on public.pending_catalogue_imports (run_id);

alter table public.pending_catalogue_imports enable row level security;
drop policy if exists "owner reads own pending imports" on public.pending_catalogue_imports;
create policy "owner reads own pending imports"
  on public.pending_catalogue_imports for select using (auth.uid() = user_id);
drop policy if exists "owner updates own pending imports" on public.pending_catalogue_imports;
create policy "owner updates own pending imports"
  on public.pending_catalogue_imports for update using (auth.uid() = user_id);
-- Inserts always from server (service role).
