-- agent-engine RPC helpers
-- Run this in Supabase SQL Editor AFTER 002_agent_engine.sql is applied.

-- ============================================================
-- 1. Add the message_count column FIRST (functions below reference it)
-- ============================================================
alter table public.profiles add column if not exists message_count int default 0;

-- ============================================================
-- 2. match_knowledge — vector similarity search for the agent's
--    search_knowledge_base tool. Returns top-K most similar chunks.
-- ============================================================
create or replace function public.match_knowledge(
  query_embedding vector(768),
  p_user_id uuid,
  match_count int default 5
)
returns table (content text, similarity float)
language sql stable
as $$
  select content, 1 - (embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  where user_id = p_user_id
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- 3. increment_message_count — atomic counter bump for trial quota.
--    Called from the inbound brain after every reply.
-- ============================================================
create or replace function public.increment_message_count(p_user_id uuid)
returns void
language sql
as $$
  update public.profiles
  set message_count = coalesce(message_count, 0) + 1
  where id = p_user_id;
$$;
