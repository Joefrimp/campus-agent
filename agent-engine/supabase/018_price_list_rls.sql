-- price_list RLS — owner reads / writes their own catalogue rows.
-- Run AFTER 017_stale_inquiry_followup.sql.
--
-- Why this exists: the dashboard's Catalogue page reads price_list with
-- the user's anon Supabase JWT (RLS-gated). Without an explicit owner
-- SELECT policy, RLS returns zero rows even though our backend inserts
-- (via service-role key) succeed silently. That's why approved imports
-- show "IMPORTED" badge in the import flow but never appear in the
-- Catalogue page.
--
-- Backend writes still use the service-role key and bypass RLS, so the
-- existing scrape-approve flow + cmdAdd + cmdAddWithImage are unaffected.

alter table public.price_list enable row level security;

drop policy if exists "owner reads own price_list" on public.price_list;
create policy "owner reads own price_list"
  on public.price_list
  for select
  using (auth.uid() = user_id);

drop policy if exists "owner inserts own price_list" on public.price_list;
create policy "owner inserts own price_list"
  on public.price_list
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner updates own price_list" on public.price_list;
create policy "owner updates own price_list"
  on public.price_list
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "owner deletes own price_list" on public.price_list;
create policy "owner deletes own price_list"
  on public.price_list
  for delete
  using (auth.uid() = user_id);
