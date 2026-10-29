-- 0005: BankVal AI saved scenarios. Server-side access only (service-role key); RLS on, no policies.
-- Parsed bank XBRL and AI bank notes are cached in feed_cache ('bank:v1:<TICKER>', 'bankmemo:…'),
-- and AI spend is logged to ai_usage with feature 'bank_memo'.
create table if not exists public.saved_bank_models (
  id                uuid primary key default gen_random_uuid(),
  ticker            text not null,
  name              text not null,
  query             text not null default '',   -- scenario (CET1 target, growth, Ke, stress) as a URL query string
  price             numeric not null,            -- share price at save time
  regression_price  numeric,                     -- P/TBV-on-ROATCE implied price at save time
  ddm_price         numeric,                     -- 3-stage DDM value per share at save time
  created_at        timestamptz not null default now()
);
create index if not exists saved_bank_models_created_at_idx on public.saved_bank_models (created_at desc);
alter table public.saved_bank_models enable row level security;
