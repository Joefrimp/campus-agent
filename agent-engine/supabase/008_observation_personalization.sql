-- Quiet observation + personalization (Pro plan).
-- Run AFTER 007_products_pricing.sql.

-- ============================================================
-- 1. owner_messages — every message the owner sends manually from
--    their own phone (Whapi delivers these with from_me=true).
--    Used as raw material for style learning later.
-- ============================================================
create table if not exists public.owner_messages (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contact_phone text not null,
  content       text not null,
  is_group      boolean default false,
  message_id    text,
  sent_at       timestamptz default now()
);

create index if not exists owner_msgs_user_time_idx
  on public.owner_messages (user_id, sent_at desc);

alter table public.owner_messages enable row level security;
drop policy if exists "owner reads own messages" on public.owner_messages;
create policy "owner reads own messages" on public.owner_messages
  for select using (auth.uid() = user_id);

-- ============================================================
-- 2. business_settings additions for personalization (Pro feature)
-- ============================================================
-- Owner-authored "how I want my agent to sound" — appended to brain prompt.
alter table public.business_settings
  add column if not exists tenant_style_guide text default '';

-- Auto-extracted style summary (v2 will write here from owner_messages).
alter table public.business_settings
  add column if not exists learned_style_summary text default '';
alter table public.business_settings
  add column if not exists learned_style_updated_at timestamptz;
