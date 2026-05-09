-- Pending voice transcriptions awaiting owner verification.
-- Run AFTER 003_rpcs.sql.

create table if not exists public.pending_voice (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  customer_phone  text not null,
  customer_name   text,
  transcript      text not null,
  audio_url       text,
  message_id      text,
  resolved        boolean default false,
  resolution      text check (resolution in ('confirmed', 'corrected', 'expired', 'failed')),
  final_text      text,
  created_at      timestamptz default now(),
  resolved_at     timestamptz
);

create index if not exists pending_voice_user_unresolved_idx
  on public.pending_voice (user_id, resolved, created_at desc);

alter table public.pending_voice enable row level security;
drop policy if exists "owner reads pending_voice" on public.pending_voice;
create policy "owner reads pending_voice"
  on public.pending_voice for select
  using (auth.uid() = user_id);
