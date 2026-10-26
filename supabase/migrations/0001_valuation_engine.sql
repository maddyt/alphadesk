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
