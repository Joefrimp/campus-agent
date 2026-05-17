-- Stale inquiry follow-up + onboarding interview.
-- Run AFTER 016_scraper_reasoning.sql.

-- When the daily cron sends a "haven't heard from you, still interested?"
-- nudge to a customer who inquired but never ordered, we record the
-- timestamp here so we don't nudge the same person twice in a row.
alter table public.customers
  add column if not exists inquiry_followup_sent_at timestamptz;

-- Onboarding interview state per tenant.
--   pending  → not yet started (default)
--   in_progress → owner is mid-Q&A
--   completed → all questions answered, brain has full context
--   skipped → owner explicitly declined
alter table public.profiles
  add column if not exists onboarding_interview_state text default 'pending'
  check (onboarding_interview_state in ('pending','in_progress','completed','skipped'));

alter table public.profiles
  add column if not exists onboarding_interview_step int default 0;

-- Raw transcript of the onboarding interview (Q+A pairs). Gemini will
-- summarise this into tenant_style_guide once complete.
alter table public.profiles
  add column if not exists onboarding_interview_data jsonb default '[]'::jsonb;
