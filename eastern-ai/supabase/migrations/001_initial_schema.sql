-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLE: profiles
-- One row per authenticated user. Created via trigger on auth.users.
-- ============================================================
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  first_name       text not null default '',
  last_name        text not null default '',
  business_name    text not null default '',
  phone            text,
  is_verified      boolean not null default false,
  trial_expires_at timestamptz not null default (now() + interval '15 days'),
  plan             text not null default 'trial' check (plan in ('trial', 'pro')),
  brand_voice      text not null default 'professional_executive'
                     check (brand_voice in ('professional_executive', 'hype_man', 'problem_solver')),
  human_in_loop    boolean not null default false,
  onboarding_done  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-insert stub profile on new auth.users signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, first_name, last_name, business_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.raw_user_meta_data->>'business_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- TABLE: otp_verifications
-- n8n writes OTP codes here (service role). Frontend reads to verify.
-- ============================================================
create table public.otp_verifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  otp_code   text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.otp_verifications enable row level security;

-- Users can only read their own OTP rows (for client-side verification flow)
create policy "Users can read own OTP"
  on public.otp_verifications for select
  using (auth.uid() = user_id);

-- INSERT/UPDATE only via service role (n8n) — no authenticated user policies

-- ============================================================
-- TABLE: whapi_channels
-- One WhatsApp channel per user. n8n manages creation/status updates.
-- ============================================================
create table public.whapi_channels (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null unique references public.profiles(id) on delete cascade,
  whapi_channel_id text,
  status           text not null default 'pending'
                     check (status in ('pending', 'initializing', 'authorized', 'disconnected')),
  qr_code_url      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.whapi_channels enable row level security;

create policy "Users can view own channel"
  on public.whapi_channels for select
  using (auth.uid() = user_id);

create policy "Users can insert own channel"
  on public.whapi_channels for insert
  with check (auth.uid() = user_id);

-- Updates come from n8n via service_role only

-- ============================================================
-- TABLE: message_logs
-- Tracks inbound/outbound messages for usage counting.
-- INSERT only via n8n service role.
-- ============================================================
create table public.message_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  direction     text not null check (direction in ('inbound', 'outbound')),
  contact_phone text,
  content       text,
  ai_generated  boolean not null default false,
  created_at    timestamptz not null default now()
);

alter table public.message_logs enable row level security;

create policy "Users can view own message logs"
  on public.message_logs for select
  using (auth.uid() = user_id);

-- ============================================================
-- TABLE: agent_logs
-- AI response history for the Agent Logs view.
-- ============================================================
create table public.agent_logs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  contact_phone   text,
  inbound_message text,
  ai_response     text,
  brand_voice     text,
  was_overridden  boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.agent_logs enable row level security;

create policy "Users can view own agent logs"
  on public.agent_logs for select
  using (auth.uid() = user_id);

-- ============================================================
-- TABLE: sales_leads
-- Incoming leads/conversations for the Sales Stream view.
-- ============================================================
create table public.sales_leads (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  contact_phone text not null,
  contact_name  text,
  last_message  text,
  status        text not null default 'new' check (status in ('new', 'active', 'closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.sales_leads enable row level security;

create policy "Users can view own leads"
  on public.sales_leads for select
  using (auth.uid() = user_id);

create policy "Users can update own leads"
  on public.sales_leads for update
  using (auth.uid() = user_id);

-- ============================================================
-- REALTIME: enable for live dashboard updates
-- ============================================================
alter publication supabase_realtime add table public.whapi_channels;
alter publication supabase_realtime add table public.message_logs;
alter publication supabase_realtime add table public.agent_logs;
alter publication supabase_realtime add table public.sales_leads;

-- ============================================================
-- HELPER: updated_at auto-updater
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_whapi_channels_updated_at
  before update on public.whapi_channels
  for each row execute procedure public.set_updated_at();

create trigger set_sales_leads_updated_at
  before update on public.sales_leads
  for each row execute procedure public.set_updated_at();
