# ValuationEngine AI + DealPulse

Two apps on one Next.js site, sharing the SEC EDGAR pipeline, market data and design system:

- **ValuationEngine AI** (`/`): what is one company worth? Five valuation methods on a football field.
- **DealPulse** (`/deals`): what happens if one company buys another? M&A accretion/dilution teardown.

Both layouts are responsive. On phones the controls move below the results, and a sticky bar keeps the answer visible while you drag sliders. Printable tear sheets and teasers scale to the screen width but print at full size.

---

## DealPulse AI Deal Room (agentic extension)

A new **AI Deal Room** tab on every deal runs three Claude agents in parallel and streams their progress live:

| Agent | What it does | How it is checked |
| --- | --- | --- |
| **Model Audit** | Reviews every XBRL input behind the EPS math: periods, derived figures, tax rate, FX, IFRS 16 and leverage | Findings reference fact-sheet ids. The engine numbers are not changed |
| **Synergy & Market** | Reads both annual reports (focused: Items 1 and 7 plus the segment note; or the whole filing) and sizes cost and revenue synergies with a 3-year phase-in, regional overlap and an HSR score | Every quote is matched against the filing text and shown with its accession number and line. The engine re-runs accretion for years 1 to 3 with the phased synergies. "Use in the model" moves the synergy slider |
| **Risk & Governance** | Investigates the target through the SEC EDGAR tools: governance flags, Form 4, 13D/13G, risk factors, full-text search and golden parachutes. Builds a likelihood × impact risk matrix | Quotes are checked against the filings and the tool output. Every tool call is shown in the trace |

- **Model:** every call goes to Claude through one `ANTHROPIC_API_KEY` and uses structured (Zod) outputs.
- **Cost:** a focused run costs under about $1. A whole-filing run costs about $1–2. Each run shows its own token count and cost estimate.
- **Caching:** results are cached for 24 hours per deal, scenario and mode (in memory, and in Supabase `feed_cache` when configured).
- **Without a key:** the tab explains how to add the key.

### SEC EDGAR MCP server (`/api/mcp`)

The same 8 read-only tools are served over the Model Context Protocol (Streamable HTTP, stateless JSON). Any MCP client can use them:

```bash
claude mcp add --transport http sec-edgar https://<your-app>.vercel.app/api/mcp
```

The tools are:
- `get_company_financials`
- `list_filings`
- `read_filing_section` (business, risk factors, MD&A, segments, change in control)
- `search_filing`
- `get_governance_flags`
- `get_insider_activity`
- `get_ownership_filings`
- `get_segment_revenue`

Code: `src/lib/mcp/` (protocol and tools), `src/lib/agents/` (agents, orchestrator, citation checks), `src/app/api/deals/room` (NDJSON stream), `src/components/deals/DealRoomTab.tsx`.

## Cross-border M&A: foreign (20-F) filers in DealPulse

DealPulse accepts non-US companies as acquirer or target (e.g. `/deals/NVDA/ASML`, `/deals/SAP/CRM`). ValuationEngine stays US-only (10-K, US GAAP, USD); a foreign ticker there shows a notice linking to DealPulse.

| Issue | How it's handled |
|---|---|
| IFRS taxonomy | Parser auto-detects `ifrs-full` facts in 20-F/40-F filings and maps them (Revenue, ProfitLossFromOperatingActivities, ProfitLossAttributableToOwnersOfParent, Borrowings, EquityAndLiabilities, ...). Foreign filers that use US GAAP in a 20-F (e.g. Alibaba in CNY) work too |
| Reporting currency | Converted to USD at the spot rate (ECB via Frankfurter, fallback open.er-api.com). One rate applies to all periods (a simplification, disclosed in the UI). Audit facts keep the as-reported currency |
| ADRs | Ordinary share counts are converted to ADR equivalents using a table of depositary ratios (e.g. TSM 5:1, TM 10:1, AZN 0.5:1). Unknown tickers assume 1:1, with a warning |
| IFRS 16 leases | EBITDA is lease-adjusted (minus lease payments and lease interest) so leverage and multiples compare with US GAAP. Lease liabilities are excluded from debt, matching US GAAP's treatment of operating leases |
| No quarterly XBRL | Annual (20-F) figures only, labelled "annual" |
| Exempt filings | No Form 4, DEF 14A or 8-K items for foreign private issuers. Those panels explain why; the governance scan uses 20-F/A and NT 20-F |
| Regulatory | The antitrust card adds a cross-border note: CFIUS for foreign acquirers of US businesses, foreign merger control for foreign targets |

---

## PRD v2 additions (both apps)

**Extended SEC feeds** (`src/lib/sec/feeds.ts`, parsers in `src/lib/sec/parsers.ts`, cached 12h; Supabase `feed_cache` when configured). These load after the page renders, so they never slow the first view:

| Appendix | What the app does | Source |
|---|---|---|
| A. Segment & geographic revenue | Parses dimensional XBRL (product/service, business segment, geography axes) from the latest 10-K's own instance document plus its label linkbase. Subtotal members are removed automatically. Powers the **Sum-of-the-Parts** football-field row (editable per-segment EV/revenue multiples) and DealPulse's product/geographic **overlap** check | 10-K `*_htm.xml` + `*_lab.xml` |
| B. Insider & ownership signals | Form 4: open-market buys (P) and sells (S) over the last 12 months, with a C-suite signal. Schedule 13D/13G (5%+ holders) over 24 months, with 13D flagged as activist. *13F institutional holdings are filed per fund, not per company, so they need a licensed aggregator and are not included* | Form 4 XML, `.hdr.sgml` headers |
| C. Golden parachutes | On demand, Claude extracts the DEF 14A change-in-control payments table under a Zod schema. Every dollar figure must appear verbatim in the filing or it is excluded. One click applies the total as a cost: deducted in Precedents/LBO, or added to DealPulse uses | DEF 14A (needs `ANTHROPIC_API_KEY`) |
| D. Accounting audit scorecard | Scans 24 months of 8-Ks: Item 4.02 restatement = red; 4.01 auditor change, 10-K/A and NT filings = amber. Shown under the football field and as a 5th DealPulse scorecard card for the target | `submissions` API `items` field |
| E. Live cost of capital | U.S. Treasury daily par yield curve, falling back to FRED DGS10. The 10Y is the DCF risk-free rate (yield-curve chart in the WACC card). DealPulse's new-debt rate = 10Y + a credit spread for pro-forma leverage | home.treasury.gov |

**ValuationEngine changes:** comps apply both EV/EBITDA and EV/Revenue percentiles; LBO debt is 50–60% of the price (no longer 5–6x EBITDA); sliders span WACC ±2.0%, terminal growth ±1.0% and exit multiple ±2.0x around the base case; the default axis is enterprise value; **clicking a bar opens a Source Audit modal** with the derivation and every XBRL fact (tag, period, form, accession link); parsed balance sheets are Zod-checked for Assets = Liabilities + Equity.

**DealPulse changes:** EPS uses diluted weighted-average shares; the debt-rate slider is always visible; target alerts (activist 13D, insider selling, 8-K flags) appear under the company cards; there's a new "Overlap & target diligence" tab; transaction costs (golden parachutes) flow through sources & uses, the EPS math and the teaser.

---

## DealPulse: M&A accretion/dilution

Pick a buyer and a target (e.g. `/deals/DIS/EA`). The app fetches both companies' SEC filings and live prices, then answers the first question every banker asks: **does the deal raise or lower the buyer's EPS?**

| Feature | Notes |
|---|---|
| Ticker-pair picker | Buyer + target inputs, swap button, demo pairs (DIS+EA, MSFT+EA, NVDA+AMD, PEP+KHC, CVX+COP, COST+TGT) |
| Sliders | Offer premium (0–50%); cash / stock / debt mix that always totals 100% (moving one rebalances the others), with presets; pre-tax synergies; plus rates and tax under a toggle |
| Hurdle indicators | Breakeven synergies and highest accretive premium, shown as KPIs and as amber markers on the sliders |
| Net income waterfall | Horizontal floating bars: acquirer NI + target NI + after-tax synergies − after-tax interest on new debt − forgone interest on cash = pro-forma NI |
| Risk scorecard | Red/amber/green for antitrust (HSR threshold + SIC industry overlap as a proxy), credit (pro-forma debt/EBITDA: <2.5x green, >4x red), integration friction (relative size, industry, premium), and EPS impact |
| Sensitivity | Accretion heatmaps: premium × synergies and premium × % paid in stock |
| Deal terms | Offer price, equity and enterprise value, purchase multiples, sources of funds, ownership vs. earnings contribution |
| AI rationale | Claude writes the strategic rationale, synergy sources and risks under a Zod schema. Every figure is checked against the engine (template fallback without an API key) |
| SEC data | Inputs for both companies, each with its XBRL audit trail and accession number |
| Deal teaser | One-page US Letter teaser for print or PDF |
| Save teardown | Saves scenarios to Supabase (needs `0002_saved_deals.sql` and the Supabase env vars); without them, use "Copy link" since every scenario is in the URL |
| API | `GET /api/deals?acquirer=DIS&target=EA&p=0.3&s=0.5` returns Zod-validated JSON |

Engine (`src/lib/deals/engine.ts`) implements PRD §4 exactly: P_E = target market cap × (1 + premium); after-tax interest = new debt × r_d × (1 − t); forgone interest = cash used × r_c × (1 − t); NI_PF = NI_A + NI_T + synergies(1 − t) − interest − forgone interest; new shares = P_E × stock % ÷ acquirer price. It uses LTM net income from 10-K/10-Q XBRL and current cover-page share counts. Defaults: 30% premium, 30% debt at 6%, cash capped at half the buyer's cash, the rest in stock, synergies of 3% of target revenue, and the buyer's effective tax rate. Not modelled: transaction fees, purchase-price amortization, and synergy phase-in (noted on the teaser).

---

## ValuationEngine AI

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

### 2. Supabase (optional: persistent cache, "recently valued" feed, saved deal teardowns)

1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_valuation_engine.sql`, `0002_saved_deals.sql` and `0003_feed_cache.sql`.
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
