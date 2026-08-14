# Methodology

Every number the portal shows can be traced to one of the rules below. Where a choice was
available, the reasoning is given — including the cases where the choice is arguable.

## 1. Source correction

Vendor fundamentals arrive with two recurring defects.

**Duplicate fiscal years.** A stale modelled row can sit alongside the real reported year. The
loader keeps one row per year, preferring reported over modelled and the more complete row on ties.

**Subtotals that do not tie.** Vendor "other" buckets omit categories (deferred tax, operating
leases, pensions), so components do not sum to their own stored totals. Every "other" bucket is
rebuilt as a pure residual: `other = total − Σ(known components)`. This makes subtotals tie by
construction, and pushes the vendor's error into a visible line rather than leaving it scattered.

What this does **not** fix: cases where the reported `total_assets` itself does not equal
liabilities plus equity. That is a source defect, is raised as a `BALANCE_GAP` finding, and
requires better data — no client-side formula can repair it.

## 2. Forecast

Five years, built **sequentially** — year *t* uses year *t−1*'s own computed closing balances.
This is what allows interest expense to be driven by the prior year's debt balance without
circularity.

| Line | Rule |
|---|---|
| Revenue | Weighted-average historical growth (recent years weighted more), decaying toward a long-run anchor. Faster growers decay faster. Clamped; floored at half the prior year. |
| Margins | Blend of the company's own base and the **sector median**, approached with 70% stability per year. |
| Cyclicals | If operating-margin dispersion exceeds 35% of its mean, the base switches from recency-weighted to a **full-cycle average**. Recency weighting is exactly wrong at a cycle peak. |
| Ratio lines | Weighted-average historical ratio to revenue (or COGS), held constant. |
| Interest | Effective rate x prior-year balance, **not** a revenue ratio. Years reporting zero interest against material debt are excluded as reporting gaps. |
| Income before tax | Built bottom-up from its components; net income is derived from it. The reverse hides the drivers. |
| Net borrowing | Ratio to revenue, clamped, decaying to zero by the terminal year so debt reaches a steady state. |
| Share count | Rolls forward with buybacks, issuance and SBC at the current price. |
| PP&E / intangibles | D&A split 85/15 so the two together absorb exactly 100% of it; CapEx floored at D&A so chronic under-investers hold flat instead of decaying to zero. |

## 3. Valuation

**① FCFE at cost of equity.** `OCF + CapEx + net borrowing − SBC`, discounted at CAPM cost of
equity (clamped 6–16%), Gordon terminal value, mid-year convention.

**② FCFF at WACC.** `EBIT(1−t) + D&A + ΔWC − CapEx − SBC`, discounted at WACC, giving an
enterprise value; net debt is subtracted to reach equity.

**③ Residual income.** `Book value + Σ PV(net income − cost of equity × opening book value)`.
Preferred for financials.

SBC is deducted from both cash-flow measures by default. It is non-cash but economically real,
and adding it back flatters exactly the companies that issue the most of it.

## 4. Self-challenge

| Flag | Trigger | Meaning |
|---|---|---|
| `EXTREME_RESULT` | value >2x or <0.5x price | Usually an assumption is wrong, not the market |
| `METHOD_DISAGREEMENT` | spread >35% across ①②③ | No single figure is reliable |
| `TV_CONCENTRATION` | terminal value >80% of EV | Mostly an assumption about the far future |
| `WACC_BAND` | WACC outside [risk-free, 15%] | Capital-structure inputs are wrong |
| `NO_TERMINAL` | terminal FCFE ≤ 0 | That route cannot value the company at all |
| `FINANCIAL_SECTOR` | sector is a financial | Use residual income as the anchor |
| `BALANCE_GAP` | reported A ≠ L + E | Source-data defect |

Alongside these: a 7x6 sensitivity grid, a seeded Monte Carlo over the company's own historical
volatility, a reverse DCF, and a held-out backtest of the engine itself.

## 5. Known limitations

- The projected balance sheet does not tie; the residual is shown, not plugged.
- Top-down revenue only — no segment or KPI data, so no bottoms-up build.
- No analyst consensus, so no consensus sanity check.
- The equity risk premium is a house view (default 4.46%; street practice often uses 5.5%,
  which moves large-cap values by roughly 14%). It is an input, not a fact.
