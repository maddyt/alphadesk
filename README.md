# ValuationEngine AI

An SEC EDGAR valuation workbench. Type a ticker and the app pulls 10-K and 10-Q XBRL data straight from SEC EDGAR, runs five valuation methodologies concurrently, and plots them on an interactive **football field** you can stress-test with sliders. Every input traces back to its XBRL tag and SEC accession number.

**Stack:** Next.js 14 (App Router) · Tailwind · React SVG charts · Supabase (Postgres) · Vercel · SEC EDGAR REST API · Zod · Claude (Anthropic SDK)

---

## What it does

| Feature | Where |
|---|---|
| **Football field** for 52-week range, trading comps, precedents, DCF and LBO floor. Bars show the 25th–75th percentile, whiskers show min–max, plus a median tick, a dashed green current-price line and an amber composite line. Toggles between per-share and enterprise value. Hover a bar for the stats; click it to open its build. | Workbench |
| **Real-time sensitivity sliders**: WACC (6–12%), perpetuity growth (1–4%), exit multiple (8–14x), revenue growth, EBIT margin, tax, control premium, LBO leverage, target IRR, cost of debt | Left rail |
| **DCF build**: 5-year unlevered FCF table, revenue and FCF charts, WACC/CAPM build, EV-to-equity bridge (waterfall), and implied exit multiple / implied perpetuity growth cross-checks | DCF tab |
| **Sensitivity heatmaps**: WACC × growth and WACC × exit multiple, shaded against the current price | Sensitivity tab |
| **Comps & precedents**: peer EV/EBITDA built from each peer's own SEC filings plus a live price, a dot-strip chart, outliers flagged NM, and the control-premium build | Comps tab |
| **LBO floor**: entry price solved by bisection for the target IRR, sources & uses, debt paydown chart, full cash-sweep schedule | LBO tab |
| **SEC audit trail**: click any historical figure to see its XBRL tag, period, form, filing date and **accession ID**, with links to the filing on EDGAR | SEC Financials tab |
| **AI analyst memo**: Claude writes the narrative under a strict Zod schema and may only cite figures from the engine. A verifier checks every $, % and x in the prose against the engine and flags anything unmatched. | AI Memo tab |
| **Pitchbook tear sheet**: two light-theme 16:9 pages (football field, summary table, market data, DCF, sensitivity, LBO, sources footnote). Print or save as PDF. | "Export pitchbook tear sheet" |
| **Shareable scenarios**: slider state lives in the URL | "Copy scenario link" |
| **REST API**: `GET /api/valuation/AAPL?w=0.09&g=0.03` returns the PRD 4.2 `ValuationOutputSchema` JSON, Zod-validated | API |

---

## How the numbers are built

**Data (`src/lib/sec/`)**
- `data.sec.gov/api/xbrl/companyfacts/CIK##########.json` is fetched with a custom User-Agent, rate-limited to stay under SEC's 10 requests/second.
- The annual series comes from 10-K facts with a ~12-month duration. When a later 10-K restates a year, the latest filing wins. Tag switches are handled (e.g. `Revenues` → `RevenueFromContractWithCustomerExcludingAssessedTax`).
- **LTM** = latest FY + current-year YTD − prior-year YTD, using the same tag from 10-Q filings.
- The **latest balance sheet** comes from the most recent 10-K or 10-Q. Total debt = long-term debt (current + non-current) + commercial paper or short-term borrowings. Share count comes from the cover page (`dei:EntityCommonStockSharesOutstanding`).
- **EBIT** is `OperatingIncomeLoss`, or pre-tax income + interest expense when a company (like Disney) doesn't tag it. Restructuring and impairment are added back to give Adj. EBIT.
- **Price, 52-week distribution and beta** come from the Yahoo Finance chart API. Beta is a 2-year weekly regression vs the S&P 500, Blume-adjusted. FMP is used instead if `FMP_API_KEY` is set.

**Engine (`src/lib/engine/`)**: pure TypeScript with no I/O. The browser runs the same code on every slider move and the server runs it for the API and tear sheet, so the two can't drift apart.

| Method | Mechanics | Range (min / 25th / median / 75th / max) |
|---|---|---|
| 52-week | EV = price × shares + net debt | Distribution of trailing daily closes |
| Trading comps | Peer EV / LTM EBITDA × target LTM EBITDA | Peer multiple percentiles. Peers more than 3x from the median are excluded as NM. |
| Precedents | Comps multiple × (1 + control premium) | Peer 25th/median/75th × premium of ±7.5% around the slider (default 15–30%) |
| DCF | FCFF = EBIT(1−t) + D&A − CapEx − ΔNWC. WACC = E/V·Ke + D/V·Kd(1−t), Ke = Rf + β(ERP). TV by Gordon growth **and** exit multiple. | WACC ±1% × (growth ±0.5% and exit ±1x), 30 cases |
| LBO floor | Entry multiple solved for the target IRR (default 20%), 5-year hold, 100% cash sweep, 2% fees, debt ≤ 75% of price | Leverage ±0.5x × exit multiple ±1x, 9 solves |

Defaults: risk-free 4.25%, ERP 5.0% (Kroll recommended U.S. ERP), terminal growth 2.5%, exit multiple = peer median, revenue growth = blend of last-year and 3-year CAGR, margins = latest fiscal year.

---

## Setup (same flow as the multi-school app: GitHub → Supabase → Vercel)

### 1. Run locally (2 minutes, no accounts needed)

```bash
npm install
cp .env.example .env.local      # set SEC_USER_AGENT to your name + email
npm run dev                     # http://localhost:3000
```

With no keys at all, the app works fully in live mode: SEC EDGAR and Yahoo prices need no key, and the AI memo falls back to a deterministic template. To demo with no internet, set `DATA_MODE=snapshot`. That serves six bundled tickers (AAPL, NVDA, DIS, MSFT, COST, KO) from an approximate snapshot, clearly labelled.

### 2. Supabase (optional: persistent cache and the "recently valued" feed)

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_valuation_engine.sql`.
3. Copy the **Project URL** and the **service_role key** (Settings → API).

All database access is server-side with the service-role key. RLS is enabled with no policies, so the public anon key can do nothing.

### 3. Vercel

1. Import this GitHub repo at vercel.com/new (framework: Next.js; the defaults are fine).
2. Add environment variables:

| Variable | Required | Notes |
|---|---|---|
| `SEC_USER_AGENT` | **yes** | e.g. `ValuationEngine AI your-name@gmail.com` (SEC fair-access policy) |
| `ANTHROPIC_API_KEY` | for the AI memo | from console.anthropic.com |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | optional | from step 2 |
| `FMP_API_KEY` | optional | alternative price source |

3. Deploy. The first load of each ticker downloads its full XBRL history (a few MB per company, plus peers) and takes about 5–15 seconds. After that it's served from cache.

---

## Demo script (about 5 minutes)

1. **Home → NVDA.** The loading screen walks through the pipeline. Point out the "Live SEC EDGAR" badge, the CIK, and the LTM label (e.g. "LTM Jul-26"), which shows the 10-Q YTD math.
2. **Football field.** Hover each bar for its stats. Toggle **Per share / Enterprise value**. Ask: where does the market price sit versus intrinsic value, and why does the LBO floor sit so low for a high-multiple stock?
3. **Drag WACC from 9% to 12%** and watch the DCF bar slide left. Drag the **exit multiple** and **control premium**. Then open **Sensitivity** to see the same story as a heatmap.
4. **DCF tab.** Walk the FCFF build, the WACC/CAPM card, and the EV → equity bridge. Flip Perpetuity ↔ Exit multiple and compare the implied exit multiple against the peer median (the classic cross-check).
5. **LBO tab.** Ask what entry multiple a sponsor can pay at 5.5x leverage for a 20% IRR. Move the target IRR slider.
6. **SEC Financials → click Revenue.** The audit modal shows the XBRL tag, the period, and the **accession number**, which links to the actual filing on EDGAR.
7. **AI Memo → Generate.** Claude writes the summary, and the guardrail panel shows something like "34/34 figures traced to engine output".
8. **Export pitchbook tear sheet → Print → Save as PDF.**
9. Try **DIS**. Disney doesn't tag operating income, so EBIT is rebuilt from pre-tax income + interest. The warning banner says so, and the audit modal shows both facts.

---

## Project layout

```
src/lib/sec/          SEC client (rate limit, UA), XBRL parser, ticker→CIK + peer sets
src/lib/market/       Price, 52-week distribution, regression beta
src/lib/engine/       Pure valuation engine: model (WACC, DCF), lbo, valuation, stats, params
src/lib/data/         Dataset orchestration + caching (memory, Supabase), offline snapshot
src/lib/ai/           Fact sheet, numeric verifier, Claude memo with Zod structured output
src/lib/schema.ts     PRD 4.2 ValuationOutputSchema
src/components/       Football field + charts (hand-built SVG), workbench tabs, UI kit
src/app/              Home, /t/[ticker] workbench, /t/[ticker]/tearsheet, API routes
supabase/migrations/  company_cache, valuation_runs
tests/                Engine + XBRL parser tests (node --test, no network)
```

```bash
npm test          # 15 tests: DCF/WACC identities, LBO solver, ranges, Zod contract, XBRL parser, memo verifier
npm run typecheck
npm run build
```

## Known limits

- **Financials (banks, insurers):** EV/EBITDA and unlevered DCF aren't meaningful for them. The app warns but still runs.
- **Foreign private issuers** (20-F filers such as TSM or SONY) report in IFRS and aren't supported.
- **Precedent transactions** are modelled as trading multiples plus a control premium (per the PRD), not as a database of actual deals.
- **The offline snapshot** is rounded from 10-K filings. Its market data and peer multiples are approximate and illustrative, and it never shows an accession number. Live mode replaces all of it.
- **Not built yet:** pgvector 10-K text search (PRD 3, Phase 2). The schema has room for it.

For education and analysis. Not investment advice.
