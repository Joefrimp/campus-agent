-- Pro plan auto-activation via MoMo screenshot OCR.
-- Run AFTER 010_storage_rls.sql.
--
-- Flow:
--   1. User clicks "Go Pro" → /billing/start-upgrade creates a row in
--      pro_activation_pending with a unique short code (VEC-XXXX-XXXX).
--   2. User pays Eastern AI's MoMo number using that code as the reference.
--   3. User forwards MoMo confirmation screenshot to the Eastern AI
--      activation WhatsApp number.
--   4. Whapi webhook → /billing/activation-webhook OCRs the screenshot,
--      finds the code in the reference, validates amount + recipient +
--      txn_id uniqueness, then flips profiles.plan = 'pro'.
--   5. Vector DMs the customer "✅ Pro activated".
--
-- A cron sweep marks expired rows so they can't be redeemed late.

create table if not exists public.pro_activation_pending (
  code              text primary key,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount_due_ghs    numeric not null,
  plan              text not null default 'pro' check (plan in ('pro')),
  duration_months   int not null default 1 check (duration_months between 1 and 24),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '20 minutes',
  status            text not null default 'pending'
                    check (status in ('pending','paid','expired','cancelled')),
  matched_txn_id    text,
  matched_amount    numeric,
  matched_at        timestamptz,
  notes             text
);

create index if not exists pro_activation_user_idx
  on public.pro_activation_pending (user_id, status, created_at desc);
create index if not exists pro_activation_status_idx
  on public.pro_activation_pending (status, expires_at);
-- A given MoMo transaction can only ever activate ONE upgrade (replay-safe).
create unique index if not exists pro_activation_txn_unique
  on public.pro_activation_pending (matched_txn_id)
  where matched_txn_id is not null;

alter table public.pro_activation_pending enable row level security;
drop policy if exists "owner reads own activation rows"
  on public.pro_activation_pending;
create policy "owner reads own activation rows"
  on public.pro_activation_pending
  for select using (auth.uid() = user_id);
-- All writes happen via service-role from the backend.

-- ============================================================
-- profiles columns for plan + expiry, if missing.
-- ============================================================
alter table public.profiles
  add column if not exists plan text not null default 'free'
  check (plan in ('free','pro'));
alter table public.profiles
  add column if not exists plan_expires_at timestamptz;
alter table public.profiles
  add column if not exists plan_activated_at timestamptz;
alter table public.profiles
  add column if not exists plan_activation_method text;  -- 'momo_ocr' | 'manual_admin'

-- ============================================================
-- operator_config — single-row table with Eastern AI billing details.
-- v1 we read from env vars; this table exists so v1.5 admin page can
-- override without a redeploy. Backend prefers the row if present.
-- ============================================================
create table if not exists public.operator_config (
  id                       int primary key default 1 check (id = 1),
  momo_number              text,
  momo_account_name        text,
  pro_price_ghs            numeric default 100,
  activation_whatsapp      text,
  activation_minutes       int default 20,
  updated_at               timestamptz default now()
);
insert into public.operator_config (id) values (1)
  on conflict (id) do nothing;

-- Public read — the frontend Pro upgrade modal needs these values
-- (they're not secrets; customers see them anyway).
alter table public.operator_config enable row level security;
drop policy if exists "anyone reads operator config" on public.operator_config;
create policy "anyone reads operator config"
  on public.operator_config for select using (true);
-- Writes: service-role only.

-- ============================================================
-- billing_audit — every activation event for forensic / dispute trail.
-- ============================================================
create table if not exists public.billing_audit (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid references public.profiles(id) on delete set null,
  code              text,
  event             text not null,        -- 'started','matched','rejected','expired','manual_grant'
  amount_ghs        numeric,
  txn_id            text,
  reason            text,
  raw_extraction    jsonb,
  created_at        timestamptz default now()
);
create index if not exists billing_audit_user_idx
  on public.billing_audit (user_id, created_at desc);
create index if not exists billing_audit_event_idx
  on public.billing_audit (event, created_at desc);

alter table public.billing_audit enable row level security;
drop policy if exists "owner reads own billing audit" on public.billing_audit;
create policy "owner reads own billing audit"
  on public.billing_audit for select using (auth.uid() = user_id);
