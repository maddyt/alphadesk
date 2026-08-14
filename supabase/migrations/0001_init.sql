-- AlphaDesk core schema
-- Design notes:
--  * Statements are stored one row per (company, fiscal_year, statement) with the line items
--    in a typed jsonb payload. Vendors add and rename fields constantly; a wide table would
--    need a migration every time. Frequently-queried figures are promoted to real columns.
--  * Raw vendor payloads are retained verbatim so any correction can be re-derived and any
--    number can be traced back to what the provider actually returned.
--  * Valuations are snapshots: assumptions in, results out, immutable, timestamped. Changing
--    an assumption creates a new row rather than mutating history.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------- companies
create table if not exists companies (
  id            uuid primary key default uuid_generate_v4(),
  ticker        text not null unique,
  company_name  text not null,
  sector        text,
  industry      text,
  currency      text not null default 'USD',
  current_price numeric,
  shares_outstanding numeric,
  beta          numeric,
  market_data_at timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists companies_sector_idx on companies (sector) where is_active;

-- ---------------------------------------------------------------- statements
do $$ begin
  create type statement_kind as enum ('income_statement', 'balance_sheet', 'cash_flow');
exception when duplicate_object then null; end $$;

create table if not exists financial_statements (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid not null references companies (id) on delete cascade,
  statement    statement_kind not null,
  fiscal_year  int not null,
  period_end_date date,
  is_projected boolean not null default false,
  -- corrected, model-ready line items
  data         jsonb not null,
  -- exactly what the provider returned, for lineage and re-derivation
  raw          jsonb,
  provider     text not null,
  -- promoted columns for cheap screening/aggregation
  revenue          numeric generated always as ((data->>'revenue')::numeric) stored,
  net_income       numeric generated always as ((data->>'net_income')::numeric) stored,
  total_assets     numeric generated always as ((data->>'total_assets')::numeric) stored,
  operating_cash_flow numeric generated always as ((data->>'operating_cash_flow')::numeric) stored,
  ingested_at  timestamptz not null default now(),
  unique (company_id, statement, fiscal_year, is_projected)
);
create index if not exists statements_company_idx on financial_statements (company_id, statement, fiscal_year);
create index if not exists statements_year_idx on financial_statements (fiscal_year) where not is_projected;

-- ---------------------------------------------------------------- valuations
create table if not exists valuation_snapshots (
  id            uuid primary key default uuid_generate_v4(),
  company_id    uuid not null references companies (id) on delete cascade,
  scenario_name text not null default 'base',
  assumptions   jsonb not null,
  -- headline results, promoted for ranking
  price              numeric,
  fcfe_per_share     numeric,
  fcff_per_share     numeric,
  residual_income_per_share numeric,
  cost_of_equity     numeric,
  wacc               numeric,
  method_spread      numeric,
  tv_share_equity    numeric,
  tv_share_ev        numeric,
  margin_of_safety   numeric,
  -- full projections, fcfe build, diagnostics
  detail        jsonb not null,
  engine_version text not null,
  created_at    timestamptz not null default now()
);
create index if not exists valuations_company_idx on valuation_snapshots (company_id, created_at desc);
create index if not exists valuations_scenario_idx on valuation_snapshots (company_id, scenario_name, created_at desc);

-- ---------------------------------------------------------------- data quality
do $$ begin
  create type flag_severity as enum ('warn', 'info');
exception when duplicate_object then null; end $$;

create table if not exists quality_flags (
  id          uuid primary key default uuid_generate_v4(),
  company_id  uuid not null references companies (id) on delete cascade,
  code        text not null,
  severity    flag_severity not null default 'warn',
  message     text not null,
  context     jsonb,
  fiscal_year int,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists flags_open_idx on quality_flags (code, severity) where resolved_at is null;
create index if not exists flags_company_idx on quality_flags (company_id) where resolved_at is null;

-- ---------------------------------------------------------------- ingestion audit
create table if not exists ingestion_runs (
  id           uuid primary key default uuid_generate_v4(),
  provider     text not null,
  universe     text[],
  status       text not null default 'running',
  tickers_ok   int not null default 0,
  tickers_failed int not null default 0,
  flags_raised int not null default 0,
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- ---------------------------------------------------------------- sector aggregates
-- Margin medians feed the forecast's mean-reversion target, so they are a first-class
-- artefact rather than something recomputed ad hoc in the UI.
create or replace view sector_margin_medians as
with latest as (
  select distinct on (fs.company_id)
         c.sector,
         (fs.data->>'revenue')::numeric          as revenue,
         (fs.data->>'gross_profit')::numeric     as gross_profit,
         (fs.data->>'operating_income')::numeric as operating_income,
         (fs.data->>'ebitda')::numeric           as ebitda
    from financial_statements fs
    join companies c on c.id = fs.company_id
   where fs.statement = 'income_statement' and not fs.is_projected and c.is_active
   order by fs.company_id, fs.fiscal_year desc
)
select sector,
       count(*) as constituents,
       percentile_cont(0.5) within group (order by gross_profit / nullif(revenue, 0))     as gross_median,
       percentile_cont(0.5) within group (order by operating_income / nullif(revenue, 0)) as op_median,
       percentile_cont(0.5) within group (order by ebitda / nullif(revenue, 0))           as ebitda_median
  from latest
 where revenue > 0
 group by sector;

-- Latest valuation per company, for the screener and audit dashboard.
create or replace view latest_valuations as
select distinct on (v.company_id)
       v.*, c.ticker, c.company_name, c.sector
  from valuation_snapshots v
  join companies c on c.id = v.company_id
 where v.scenario_name = 'base'
 order by v.company_id, v.created_at desc;

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists companies_touch on companies;
create trigger companies_touch before update on companies
  for each row execute function touch_updated_at();
