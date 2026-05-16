-- Tool planner + per-tenant tool catalogue + tool_gaps logging.
-- Run AFTER 012_self_improvement.sql.

-- ============================================================
-- tool_gaps — records every "I needed a capability I don't have"
-- moment so the owner sees aggregate signal in the dashboard.
-- Populated by:
--   1. The agent calling the new report_missing_capability tool
--   2. escalate_to_owner with action_type='integration_required'
--   3. (future) the tool planner identifying a missing planned tool
--
-- Owner can then act on patterns like "8 customers asked about delivery
-- tracking — connect a courier integration".
-- ============================================================
create table if not exists public.tool_gaps (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  customer_phone        text,
  category              text not null,        -- 'delivery_tracking','payment_link','calendar','catalogue','other'
  source_message        text,                 -- the customer message that triggered it
  suggested_capability  text,                 -- LLM-suggested tool/integration name
  created_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  resolved_note         text
);
create index if not exists tool_gaps_user_idx
  on public.tool_gaps (user_id, created_at desc);
create index if not exists tool_gaps_category_idx
  on public.tool_gaps (user_id, category, created_at desc);

alter table public.tool_gaps enable row level security;
drop policy if exists "owner reads own tool gaps" on public.tool_gaps;
create policy "owner reads own tool gaps"
  on public.tool_gaps for select using (auth.uid() = user_id);
drop policy if exists "owner resolves own tool gaps" on public.tool_gaps;
create policy "owner resolves own tool gaps"
  on public.tool_gaps for update using (auth.uid() = user_id);
