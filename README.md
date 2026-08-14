# AlphaDesk

Equity valuation portal: transparent three-statement forecasting, **three independent valuations per company**, and a data-quality dashboard that shows you where the numbers cannot be trusted.

Built from three sources of prior art — a working S&P 500 forecast engine (factoralpha.ai / StockReco), the methodology discipline of Anthropic's [financial-services](https://github.com/anthropics/financial-services) skills, and the report structure of the Daloopa skill catalogue.

---

## Why this exists

Most valuation tools produce one confident number. This one produces three, and tells you when they disagree.

That matters more than it sounds. Run the engine across a broad universe and roughly **two in five companies** land more than 2x away from their market price, and **one in five** show the three methods disagreeing by over 35%. A portal that hides that is worse than no portal — it launders model error into false precision.

Design consequences, all of which are visible in the product:

| Decision | Why |
|---|---|
| Value every company three ways (FCFE, FCFF/WACC, residual income) | Agreement is evidence; divergence is a warning. Neither is visible from one method. |
| Residual income preferred for financials | Banks have no meaningful CapEx, so a cash-flow DCF misprices them by construction. |
| Balance-sheet gaps shown, never plugged | Vendor data frequently fails Assets = Liabilities + Equity. Silently patching it hides a data problem behind a valuation. |
| Backtest surfaced next to the forecast | Re-run on data from three years ago, revenue error averages ~25%/yr on large caps. Users should see that. |
| Reverse DCF alongside the DCF | "What must be true for today's price?" is usually more decision-useful than "what is it worth?". |
| SBC deducted, share count linked to buybacks | Two common ways models flatter cash generation, both off by default. |

---

## Architecture

```
src/lib/engine/         Pure, isomorphic valuation engine — no I/O, no framework
  corrections.ts        De-duplicate vendor rows; rebuild "other" buckets as residuals
  forecast.ts           Sequential IS -> CF -> BS build (year t uses year t-1's own closings)
  valuation.ts          FCFE / FCFF-WACC / residual income + sanity flags
  analytics.ts          Sensitivity, Monte Carlo, reverse DCF, backtest, sector medians
src/lib/providers/      FMP adapter (live), Daloopa adapter (stub — see below)
src/lib/pipeline/       Ingest -> audit -> persist -> value
src/lib/deliverables/   DCF report, tearsheet, CSV (zero-dep) and xlsx (exceljs)
src/app/                Next.js App Router: coverage, ticker workspace, audit dashboard, API
supabase/migrations/    Schema + RLS
tests/                  56 tests, no dependencies, run on plain Node
```

**The engine is isomorphic on purpose.** The same module computes the valuation during ingestion (server) and on every keystroke in the scenario builder (browser). Stored numbers and on-screen numbers cannot drift apart, because there is only one implementation.

---

## Setup (about 15 minutes)

### 1. Supabase

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push          # applies supabase/migrations
```

Or paste `supabase/migrations/0001_init.sql` then `0002_rls.sql` into the SQL editor.

RLS is read-only for the anon key; every write goes through the service role. The browser bundle cannot mutate financial data even if the anon key leaks — and it will.

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in the Supabase URL, anon key, service-role key, and `FMP_API_KEY`. Set `INGEST_UNIVERSE` to a comma list or `SP500`.

### 3. Ingest

```bash
npm install
npm run ingest                 # uses INGEST_UNIVERSE
npm run ingest -- AAPL,MSFT,JPM 10
```

Each run fetches, normalises, corrects, audits, stores, values, and records every finding.

### 4. Run

```bash
npm run dev
```

### 5. Deploy

Push to GitHub, import in Vercel, add the same env vars. `vercel.json` schedules ingestion on weekday mornings; the endpoint requires `CRON_SECRET` as a bearer token, or anyone can burn your provider quota.

---

## Verification

```bash
npm test              # 56 tests, no network, no database, no API keys
npm run verify:engine # prints the triangulated valuation for the bundled fixtures
```

The fixtures are **raw vendor rows** — duplicates, gaps and all — so the tests exercise the whole pipeline: de-duplication, residual correction, forecast, and all three valuation routes. Expected values were captured from the reference implementation this engine was ported from, and the port reproduces them to within 1e-9 relative error on every line: projected revenue, net income, operating cash flow, cost of equity, WACC, enterprise value, and all three per-share values.

Structural cases are pinned as tests, not just numbers:

- **JPM** — the cash-flow DCF must fail (no valid terminal value) and residual income must carry the valuation
- **XOM** — cyclicality must be auto-detected and switch the margin base to a full-cycle average
- **AAPL** — a value this far below market must raise the extreme-result flag
- Projected balance sheets must **expose** their imbalance rather than plug it

`npm test` runs on plain Node via `--experimental-strip-types`; no build step, no test framework, nothing to install.

---

## What is deliberately not finished

Honesty about scope, since these are the things you would otherwise discover yourself:

1. **`npm install` was never run.** The sandbox this was built in has no npm registry access, so `next build`, `tsc --noEmit` and the exceljs-backed xlsx export are **unverified**. Everything that could be verified without dependencies — the engine, the pipeline, the audit logic, three of the four deliverables — is covered by the 56 passing tests. Expect to fix a type error or two on first build.
2. **The Daloopa adapter is a stub that throws a clear error.** Its response schema could not be verified without an authorised credential, and guessing at a vendor schema is exactly how silently wrong numbers enter a valuation. `src/lib/providers/daloopa.ts` documents where to implement it, including preserving `fundamental_id` per datapoint so citations survive into the deliverables.
3. **No auth.** Single-tenant internal tool. Add Supabase Auth and tighten the RLS policies before exposing it.
4. **The projected balance sheet does not tie.** Each line rolls forward independently with no balancing plug, so the residual grows to a few percent of assets by the terminal year. It is reported on every projected column rather than hidden. A production model would balance with a cash sweep or revolver; that is a deliberate next step, not an oversight.
5. **No segment or KPI data.** Consolidated statements only, so the bottoms-up revenue build (units x ASP, subscribers x ARPU) that a good analyst prefers is not possible. The top-down build is the weaker method and the reports say so.

---

## Extending

- **New provider** — implement `DataProvider` in `src/lib/providers/`, register it in `getProvider()`. The engine never sees vendor shapes.
- **New deliverable** — add a generator in `src/lib/deliverables/` and a case in the deliverables route. Keep it dependency-free if you want it testable here.
- **New sanity check** — add it to `buildFlags()` in `valuation.ts` (model-level) or `auditCompany()` in `pipeline/ingest.ts` (data-level). Both feed the dashboard automatically.

---

Analyst work product for review by a qualified professional. Not investment advice, and no recommendation is made or implied.
