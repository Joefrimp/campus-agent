-- Services, appointments, tool connections.
-- Run AFTER 008_observation_personalization.sql.

-- ============================================================
-- 1. price_list extensions for services + units
--    A row can be a product, a service, or both.
--    Services may have null/optional price (quoted at booking).
-- ============================================================
alter table public.price_list
  add column if not exists kind text default 'product';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_list_kind_check') then
    alter table public.price_list
      add constraint price_list_kind_check check (kind in ('product','service','both'));
  end if;
end $$;

alter table public.price_list
  add column if not exists unit text;                -- e.g. "30 min session", "per kg"
alter table public.price_list
  add column if not exists duration_minutes int;     -- for services
alter table public.price_list
  add column if not exists low_stock_threshold int default 3;

-- price can now be null for services that quote at booking
alter table public.price_list alter column price drop not null;

-- ============================================================
-- 2. appointments — for service businesses (nail tech, tutoring, etc.)
-- ============================================================
create table if not exists public.appointments (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete cascade,
  service_id      uuid references public.price_list(id) on delete set null,
  scheduled_at    timestamptz not null,
  duration_minutes int default 60,
  state           text default 'requested' check (state in
                    ('requested','confirmed','rescheduled','completed','cancelled','no_show')),
  agreed_price    numeric,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists appointments_user_time_idx on public.appointments (user_id, scheduled_at desc);
create index if not exists appointments_state_idx on public.appointments (user_id, state);

alter table public.appointments enable row level security;
drop policy if exists "owner reads appointments" on public.appointments;
create policy "owner reads appointments" on public.appointments for select using (auth.uid() = user_id);
drop policy if exists "owner updates appointments" on public.appointments;
create policy "owner updates appointments" on public.appointments for update using (auth.uid() = user_id);

create or replace function public.touch_appointments()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists touch_appointments on public.appointments;
create trigger touch_appointments before update on public.appointments
  for each row execute procedure public.touch_appointments();

-- ============================================================
-- 3. tool_connections — Pro-plan integrations (Google Calendar, Gmail, etc.)
-- ============================================================
create table if not exists public.tool_connections (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  provider      text not null check (provider in
                  ('google_calendar','gmail','google_drive','notion')),
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  account_email text,
  status        text default 'connected' check (status in ('connected','expired','revoked')),
  connected_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, provider)
);
alter table public.tool_connections enable row level security;
drop policy if exists "owner reads connections" on public.tool_connections;
create policy "owner reads connections" on public.tool_connections for select using (auth.uid() = user_id);
-- Inserts/updates from server only (service_role).

-- ============================================================
-- 4. business_settings — schedule blocks (vacation, off-days, lunch)
-- ============================================================
alter table public.business_settings
  add column if not exists schedule_blocks jsonb default '[]';
-- schedule_blocks shape:
-- [{ "label":"Lunch", "weekly":"daily", "from":"13:00", "to":"14:00" },
--  { "label":"Christmas break", "from_date":"2026-12-23", "to_date":"2027-01-02" }]

alter table public.business_settings
  add column if not exists business_kind text default 'product'
  check (business_kind in ('product','service','both'));

-- ============================================================
-- 5. Storage bucket for product images (run via Supabase dashboard if SQL fails)
--    The dashboard call is: Storage > Create bucket > "product-images" (public)
-- ============================================================
-- This may require running via the Supabase UI if your role can't create buckets via SQL.
-- It's idempotent — safe to skip if already exists.
do $$
begin
  perform 1 from storage.buckets where id = 'product-images';
  if not found then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);
  end if;
exception when others then
  raise notice 'Could not auto-create storage bucket. Create "product-images" manually in the Supabase dashboard.';
end $$;
