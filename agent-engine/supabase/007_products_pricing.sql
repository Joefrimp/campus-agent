-- Operator pricing additions:
--   1. price_list now carries an image and an owner-set discount floor (min_price)
--   2. approval_queue tracks whether we've already sent the customer a 60-min
--      "still working on it" follow-up so we never spam the same line twice.
-- Run AFTER 006_whapi_token.sql.

-- 1. price_list image + min_price
alter table public.price_list add column if not exists image_url text;
alter table public.price_list add column if not exists min_price numeric;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'price_list_min_le_price_check') then
    alter table public.price_list
      add constraint price_list_min_le_price_check
      check (min_price is null or min_price <= price);
  end if;
end $$;

-- 2. approval_queue follow-up tracking
alter table public.approval_queue
  add column if not exists customer_followup_sent_at timestamptz;

-- 3. customer first-contact tracking — used by webhook.ts to allow ONE soft
--    smalltalk reply before going silent. Lives on customers row.
alter table public.customers
  add column if not exists soft_reply_sent_at timestamptz;
