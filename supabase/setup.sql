-- One-shot setup: paste this whole file into the Supabase SQL editor and click Run.
-- It is idempotent (safe to run again) and equals migrations 0001-0005 in order.

-- ===================== 0001_valuation_engine.sql
-- ValuationEngine AI schema. All reads and writes happen server-side with the
-- service-role key; RLS is enabled with no policies so the anon key can do nothing.

create table if not exists public.company_cache (
  ticker      text primary key,
  cik         text not null,
  name        text not null,
  payload     jsonb not null,           -- parsed XBRL line items with per-fact accession IDs
  fetched_at  timestamptz not null default now()
);

create table if not exists public.valuation_runs (
  id               bigint generated always as identity primary key,
  ticker           text not null,
  name             text not null,
  price            numeric not null,
  current_ev       numeric not null,
  composite_price  numeric not null,
  source           text not null,       -- 'sec-live' | 'snapshot'
  created_at       timestamptz not null default now()
);

create index if not exists valuation_runs_created_at_idx on public.valuation_runs (created_at desc);

alter table public.company_cache  enable row level security;
alter table public.valuation_runs enable row level security;

-- ===================== 0002_saved_deals.sql
-- DealPulse saved teardowns. Server-side access only (service-role key); RLS on with no policies.
create table if not exists public.saved_deals (
  id          uuid primary key default gen_random_uuid(),
  acquirer    text not null,
  target      text not null,
  name        text not null,
  query       text not null default '',      -- assumption overrides as a URL query string
  accretion   numeric not null,              -- EPS accretion at save time, for the list view
  created_at  timestamptz not null default now()
);

create index if not exists saved_deals_created_at_idx on public.saved_deals (created_at desc);

alter table public.saved_deals enable row level security;

-- ===================== 0003_feed_cache.sql
-- Cache for the extended SEC feeds (segments, Form 4, 13D/G, 8-K flags) and proxy extractions.
create table if not exists public.feed_cache (
  key         text primary key,          -- e.g. 'intel:AAPL', 'coc:AAPL:0000320193-25-000008'
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);

alter table public.feed_cache enable row level security;

-- ===================== 0004_deal_room_usage_docs.sql
-- 0004: AI Deal Room history, AI spend tracking and budget guard, filing-text cache,
-- MCP tool-call log, and housekeeping. Server-side access only (service-role key);
-- RLS is enabled with no policies, so the public anon key can read or write nothing.

-- Every AI Deal Room run, kept permanently so it can be reopened, shared and exported.
create table if not exists public.deal_room_runs (
  id               uuid primary key default gen_random_uuid(),
  acquirer         text not null,
  target           text not null,
  query            text not null default '',        -- slider scenario as a URL query string
  mode             text not null check (mode in ('focused', 'whole')),
  status           text not null check (status in ('complete', 'partial')),
  events           jsonb not null,                   -- full agent event log (findings, citations, tool calls)
  cost_synergies   numeric,                          -- headline numbers for list views
  hsr_score        smallint,
  audit_verdict    text,
  risk_count       smallint,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  cost_usd         numeric(10, 4) not null default 0,
  model            text,
  created_at       timestamptz not null default now()
);
create index if not exists deal_room_runs_pair_idx on public.deal_room_runs (acquirer, target, created_at desc);
create index if not exists deal_room_runs_created_at_idx on public.deal_room_runs (created_at desc);

-- Every Claude call the app makes: powers the spend dashboard and the daily budget guard.
create table if not exists public.ai_usage (
  id             bigint generated always as identity primary key,
  feature        text not null,                     -- valuation_memo | deal_memo | proxy | deal_room | bank_memo
  subject        text not null default '',          -- e.g. 'AAPL' or 'MSFT+EA'
  model          text,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  cost_usd       numeric(10, 4) not null default 0,
  ip_hash        text,                              -- salted SHA-256, never the raw IP
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_ip_idx on public.ai_usage (ip_hash, created_at desc);

-- Plain text of annual reports and proxies. Filings never change once filed, so an
-- accession number is cached for good; saves re-downloading multi-MB HTML on cold starts.
create table if not exists public.filing_docs (
  accession_number  text primary key,
  ticker            text not null,
  cik               text not null,
  kind              text not null check (kind in ('annual_report', 'proxy')),
  form              text not null,
  filing_date       date not null,
  url               text not null,
  text              text not null,
  chars             integer generated always as (length(text)) stored,
  fetched_at        timestamptz not null default now()
);
create index if not exists filing_docs_ticker_idx on public.filing_docs (ticker, kind, filing_date desc);

-- SEC EDGAR MCP tool calls, from external MCP clients and from the Deal Room's Risk agent.
create table if not exists public.mcp_calls (
  id          bigint generated always as identity primary key,
  source      text not null check (source in ('mcp', 'deal_room')),
  tool        text not null,
  args        jsonb not null default '{}'::jsonb,
  ok          boolean not null,
  ms          integer not null,
  chars       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists mcp_calls_created_at_idx on public.mcp_calls (created_at desc);

-- Faster cache lookups and expiry sweeps.
create index if not exists feed_cache_fetched_at_idx on public.feed_cache (fetched_at);

alter table public.deal_room_runs enable row level security;
alter table public.ai_usage       enable row level security;
alter table public.filing_docs    enable row level security;
alter table public.mcp_calls      enable row level security;

-- Housekeeping: drop cache rows older than any TTL the app uses (30 days) and logs older than a year.
-- Run manually, or schedule with pg_cron (see README).
create or replace function public.purge_stale_rows() returns void
language sql security definer set search_path = public as $$
  delete from public.feed_cache    where fetched_at < now() - interval '31 days';
  delete from public.company_cache where fetched_at < now() - interval '31 days';
  delete from public.mcp_calls     where created_at < now() - interval '365 days';
  delete from public.ai_usage      where created_at < now() - interval '365 days';
$$;
revoke all on function public.purge_stale_rows() from public, anon, authenticated;

-- Daily AI spend, for the Supabase dashboard or SQL editor: select * from public.ai_spend_daily;
create or replace view public.ai_spend_daily with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, feature, count(*) as calls,
         sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, round(sum(cost_usd), 2) as cost_usd
  from public.ai_usage group by 1, 2 order by 1 desc, 2;

-- ===================== 0005_bank_models.sql
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
