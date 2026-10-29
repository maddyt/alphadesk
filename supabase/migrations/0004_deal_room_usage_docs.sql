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
