-- Operator package — additions for owner WhatsApp commands.
-- Run AFTER 004_voice.sql.

-- ============================================================
-- expenses — owner-logged business expenses (EXPENSE 50 supplier)
-- ============================================================
create table if not exists public.expenses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      numeric not null check (amount >= 0),
  description text,
  category    text default 'other',
  recorded_at timestamptz default now(),
  created_at  timestamptz default now()
);
create index if not exists expenses_user_time_idx on public.expenses (user_id, recorded_at desc);

alter table public.expenses enable row level security;
drop policy if exists "owner reads expenses" on public.expenses;
create policy "owner reads expenses" on public.expenses for select using (auth.uid() = user_id);

-- ============================================================
-- payment_attempts — every customer-sent payment screenshot we OCR'd.
-- Keeps a forensic trail in case of disputes.
-- ============================================================
create table if not exists public.payment_attempts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  customer_phone  text not null,
  message_id      text,
  amount          numeric,
  reference       text,
  sender_name     text,
  network         text,
  matched_order_id uuid references public.orders(id) on delete set null,
  status          text default 'pending' check (status in ('pending','matched','unmatched','rejected')),
  raw_extraction  jsonb,
  created_at      timestamptz default now()
);
create index if not exists payment_attempts_user_idx on public.payment_attempts (user_id, created_at desc);
