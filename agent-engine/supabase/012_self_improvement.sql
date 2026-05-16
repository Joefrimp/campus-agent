-- Self-improving agent: per-customer preferences + style learning audit.
-- Run AFTER 011_pro_activation.sql.
--
-- This migration is additive — no destructive changes. Existing brain.ts
-- already reads business_settings.learned_style_summary; this migration just
-- gives the new crons somewhere to write per-customer extracts and an audit
-- trail of when the synthesizers ran.

-- ============================================================
-- 1. Per-customer behavioural preferences.
--    Extracted nightly from conversation_memory by Gemini Flash-Lite.
--    Example shape:
--      {
--        "address_label": "Hall 7, Block C",
--        "payment_pattern": "MoMo on Sundays",
--        "tone_preference": "casual + emojis",
--        "favourites": ["jollof+chicken", "kelewele"],
--        "no_go": ["spicy beyond medium"],
--        "loyalty_signals": "5+ orders in last 60d"
--      }
-- ============================================================
alter table public.customers
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.customers
  add column if not exists preferences_updated_at timestamptz;

-- ============================================================
-- 2. Style synthesis run log (so we can see when, what input volume, and
--    a checksum of the new summary). Useful for debugging drift / regressions.
-- ============================================================
create table if not exists public.style_synthesis_runs (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  run_at             timestamptz not null default now(),
  source             text not null check (source in ('weekly_style','daily_preferences')),
  inputs_considered  int not null default 0,
  summary_excerpt    text,
  error              text
);
create index if not exists style_synthesis_runs_user_idx
  on public.style_synthesis_runs (user_id, run_at desc);

alter table public.style_synthesis_runs enable row level security;
drop policy if exists "owner reads own style runs" on public.style_synthesis_runs;
create policy "owner reads own style runs"
  on public.style_synthesis_runs for select using (auth.uid() = user_id);
