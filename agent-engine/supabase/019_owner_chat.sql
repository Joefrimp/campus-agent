-- Owner ↔ Vector chat (like Claude/Manus): multi-thread chat where the
-- owner can ask Vector business questions, generate reports, draft
-- marketing copy, etc. Credits cap at 300 per 48-hour rolling window.

create table if not exists public.owner_chat_threads (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null default 'New chat',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);
create index if not exists owner_chat_threads_user_idx
  on public.owner_chat_threads (user_id, updated_at desc);

alter table public.owner_chat_threads enable row level security;
drop policy if exists "owner reads own threads" on public.owner_chat_threads;
create policy "owner reads own threads"
  on public.owner_chat_threads for select using (auth.uid() = user_id);
drop policy if exists "owner updates own threads" on public.owner_chat_threads;
create policy "owner updates own threads"
  on public.owner_chat_threads for update using (auth.uid() = user_id);

create table if not exists public.owner_chat_messages (
  id              uuid primary key default uuid_generate_v4(),
  thread_id       uuid not null references public.owner_chat_threads(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user','assistant','tool','system')),
  content         text not null default '',
  tool_calls      jsonb,         -- list of {name, args, result_summary}
  attachments     jsonb,         -- list of {type, filename, url, size_bytes}
  credits_spent   int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists owner_chat_messages_thread_idx
  on public.owner_chat_messages (thread_id, created_at asc);
create index if not exists owner_chat_messages_user_idx
  on public.owner_chat_messages (user_id, created_at desc);

alter table public.owner_chat_messages enable row level security;
drop policy if exists "owner reads own messages" on public.owner_chat_messages;
create policy "owner reads own messages"
  on public.owner_chat_messages for select using (auth.uid() = user_id);

-- Credit window: 300 credits per 48-hour rolling window.
-- credits_used is incremented per turn; credits_window_start_at is the
-- timestamp the window opened. When (now - window_start) > 48h, the
-- backend resets credits_used=0 and credits_window_start_at=now() on the
-- next send.
alter table public.profiles
  add column if not exists owner_chat_credits_used int not null default 0;
alter table public.profiles
  add column if not exists owner_chat_credits_window_start_at timestamptz;
