/**
 * Deliverable generators.
 *
 * Structure and discipline follow the Anthropic financial-services / Daloopa skill methodology:
 * an executive summary first, a WACC build shown rather than asserted, a valuation bridge, a
 * sensitivity grid, and — the part most generated reports omit — an explicit self-challenge
 * section that states what would have to be true, and what the model gets wrong.
 *
 * Pure string generation, no dependencies, so these are unit-testable and run anywhere.
 */
import type { CompanyData, ScenarioResult } from '../engine/types.ts';
import type { BacktestResult, ReverseDcf, SensitivityGrid } from '../engine/analytics.ts';

const NAVY = '#1B2A4A', STEEL = '#4A6FA5', GREEN = '#27AE60', RED = '#C0392B', LIGHT = '#F8F9FA', MID = '#E9ECEF', DARK = '#6C757D';

const money = (v: number | null | undefined, dp = 0): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const m = v / 1e6;
  const s = Math.abs(m).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return m < 0 ? `(${s})` : s;
};
const usd = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number | null | undefined, dp = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(dp)}%`;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shell(title: string, body: string, firm: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>
@page { size: A4; margin: 18mm 14mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", -apple-system, Arial, sans-serif; font-size: 12px; line-height: 1.55; color: #343A40; max-width: 1000px; margin: 0 auto; padding: 24px 32px; }
h1 { font-size: 23px; color: ${NAVY}; border-bottom: 3px solid ${NAVY}; padding-bottom: 8px; margin: 0 0 14px; }
h2 { font-size: 17px; color: ${NAVY}; border-bottom: 1px solid ${MID}; padding-bottom: 4px; margin: 26px 0 10px; }
h3 { font-size: 13.5px; color: ${STEEL}; margin: 16px 0 6px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; font-variant-numeric: tabular-nums; }
thead { background: ${NAVY}; color: #fff; }
th { padding: 7px 9px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
td { padding: 5px 9px; border-bottom: 1px solid ${MID}; }
td:not(:first-child), th:not(:first-child) { text-align: right; }
tr:nth-child(even) { background: ${LIGHT}; }
tr.total td { font-weight: 700; border-top: 1.5px solid #343A40; }
blockquote { border-left: 4px solid ${STEEL}; background: ${LIGHT}; padding: 10px 14px; margin: 12px 0; font-size: 11.5px; }
.flag { border-left: 4px solid #C5A55A; background: rgba(197,165,90,.10); padding: 8px 12px; margin: 6px 0; font-size: 11.5px; }
.pos { color: ${GREEN}; } .neg { color: ${RED}; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
.stat { border: 1px solid ${MID}; border-radius: 6px; padding: 9px 11px; }
.stat .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: ${DARK}; }
.stat .v { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.footer { text-align: center; font-size: 9px; color: ${DARK}; font-style: italic; margin-top: 26px; padding-top: 8px; border-top: 1px solid ${MID}; }
</style></head><body>
${body}
<div class="footer">Prepared by ${esc(firm)} · Generated ${new Date().toISOString().slice(0, 10)} · Analyst work product for review by a qualified professional — not investment advice.</div>
</body></html>`;
}

export interface ReportInput {
  data: CompanyData; result: ScenarioResult; firm?: string;
  sensitivity?: SensitivityGrid | null; reverse?: ReverseDcf | null; backtest?: BacktestResult | null;
}

export function dcfReport({ data, result: r, firm = 'AlphaDesk', sensitivity: sens, reverse, backtest: bt }: ReportInput): string {
  const m = data.meta;
  const lastYear = data.income_statement.filter((x) => !x.is_projected).slice(-1)[0]?.fiscal_year ?? 0;
  const yr = (i: number) => `FY${lastYear + i + 1}E`;

  const summary = `
<h1>${esc(m.company_name)} (${esc(m.ticker)}) — Discounted Cash Flow</h1>
<div class="grid">
  <div class="stat"><div class="k">Market price</div><div class="v">${usd(r.price)}</div></div>
  <div class="stat"><div class="k">FCFE value</div><div class="v">${r.fcfe.terminalOk ? usd(r.fcfe.perShare) : '—'}</div></div>
  <div class="stat"><div class="k">FCFF value</div><div class="v">${r.fcff?.ok ? usd(r.fcff.perShare) : '—'}</div></div>
  <div class="stat"><div class="k">Residual income</div><div class="v">${usd(r.residualIncome?.perShare ?? null)}</div></div>
</div>
<h2>Executive summary</h2>
<ul>
  <li>Three independent routes value the equity at ${[r.fcfe.perShare, r.fcff?.perShare, r.residualIncome?.perShare].filter((v): v is number => typeof v === 'number').map((v) => usd(v)).join(' / ')} against a market price of ${usd(r.price)}.</li>
  <li>The methods ${r.diagnostics.spread !== null && r.diagnostics.spread > 0.35 ? `<b>disagree by ${pct(r.diagnostics.spread, 0)}</b>, so no single figure should be relied on` : `agree within ${pct(r.diagnostics.spread ?? 0, 0)}, which is the strongest evidence this model offers`}.</li>
  <li>${r.fcff?.tvShare != null ? `${pct(r.fcff.tvShare, 0)} of enterprise value sits in the terminal value` : 'Terminal value share unavailable'}${r.fcff?.tvShare != null && r.fcff.tvShare > 0.75 ? ' — the result is largely an assumption about the years beyond the forecast.' : '.'}</li>
  <li>Margins were projected on a <b>${r.diagnostics.marginMode}</b> base${r.diagnostics.autoDetected ? ' (auto-detected from margin volatility)' : ''}, blended ${pct(r.diagnostics.sectorBlend, 0)} toward the sector median.</li>
  ${bt ? `<li>Re-run on data through FY${bt.cutoffYear} only, this engine missed revenue by <b>${pct(bt.revenueMape)}</b> a year. Treat the point estimates accordingly.</li>` : ''}
</ul>`;

  const wacc = r.fcff?.ok ? `
<h2>Cost of capital</h2>
<table><thead><tr><th>Component</th><th>Value</th><th>Basis</th></tr></thead><tbody>
<tr><td>Cost of equity</td><td>${pct(r.costOfEquity, 2)}</td><td>CAPM, clamped to a 6–16% band</td></tr>
<tr><td>Cost of debt (pre-tax)</td><td>${pct(r.fcff.costOfDebt, 2)}</td><td>interest expense ÷ prior-year total debt</td></tr>
<tr><td>Effective tax rate</td><td>${pct(r.fcff.taxRate, 2)}</td><td>average of reported rates between 0% and 50%</td></tr>
<tr class="total"><td>WACC</td><td>${pct(r.fcff.wacc, 2)}</td><td>market-cap and debt weighted</td></tr>
</tbody></table>` : '';

  const proj = `
<h2>Projections</h2>
<table><thead><tr><th>$mm</th>${r.projIS.map((_, i) => `<th>${yr(i)}</th>`).join('')}</tr></thead><tbody>
<tr><td>Revenue</td>${r.projIS.map((p) => `<td>${money(p.revenue)}</td>`).join('')}</tr>
<tr><td>Revenue growth</td>${r.projIS.map((p) => `<td>${pct(p.growth)}</td>`).join('')}</tr>
<tr><td>Operating margin</td>${r.projIS.map((p) => `<td>${pct(p.operating_margin)}</td>`).join('')}</tr>
<tr><td>Net income</td>${r.projIS.map((p) => `<td>${money(p.net_income)}</td>`).join('')}</tr>
<tr><td>Operating cash flow</td>${r.projCF.map((p) => `<td>${money(p.ocf)}</td>`).join('')}</tr>
<tr><td>Capital expenditure</td>${r.projCF.map((p) => `<td>${money(p.capex)}</td>`).join('')}</tr>
<tr class="total"><td>Free cash flow to equity</td>${r.fcfeRows.map((f) => `<td>${money(f.fcfe)}</td>`).join('')}</tr>
<tr><td>PV of FCFE</td>${r.fcfeRows.map((f) => `<td>${money(f.pv)}</td>`).join('')}</tr>
</tbody></table>
<blockquote>Stock-based compensation is ${r.diagnostics.sbcDeducted ? 'deducted from' : 'left inside'} free cash flow, and the diluted
share count ${r.diagnostics.sharesLinked ? 'moves with buybacks and issuance' : 'follows its own historical trend'}. Discounting uses the
${r.diagnostics.midYear ? 'mid-year' : 'year-end'} convention.</blockquote>`;

  const bridge = r.fcff?.ok ? `
<h2>Valuation bridge (FCFF route)</h2>
<table><tbody>
<tr><td>PV of unlevered free cash flow</td><td>${money(r.fcff.pvOperating)}</td></tr>
<tr><td>PV of terminal value</td><td>${money(r.fcff.pvTerminal)}</td></tr>
<tr class="total"><td>Enterprise value</td><td>${money(r.fcff.enterpriseValue)}</td></tr>
<tr><td>Less: net debt</td><td class="neg">${money(-r.fcff.netDebt)}</td></tr>
<tr class="total"><td>Equity value</td><td>${money(r.fcff.equityValue)}</td></tr>
<tr><td>Shares outstanding (mm)</td><td>${((r.shares ?? 0) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td></tr>
<tr class="total"><td>Implied value per share</td><td>${usd(r.fcff.perShare)}</td></tr>
</tbody></table>` : '';

  const sensTable = sens && sens.waccRows.length ? `
<h2>Sensitivity — implied value per share</h2>
<table><thead><tr><th>WACC ╲ terminal growth</th>${sens.growthCols.map((g) => `<th>${pct(g, 1)}</th>`).join('')}</tr></thead><tbody>
${sens.grid.map((row, i) => `<tr><td>${pct(sens.waccRows[i], 2)}</td>${row.map((c) => `<td class="${c === null ? '' : c > (r.price ?? 0) ? 'pos' : 'neg'}">${c === null ? 'n/a' : usd(c)}</td>`).join('')}</tr>`).join('')}
</tbody></table>
<p style="font-size:11px;color:${DARK}">Green exceeds the current price of ${usd(r.price)}. A conclusion that flips sign inside this grid is not a conclusion.</p>` : '';

  const challenge = `
<h2>Self-challenge</h2>
${r.flags.length ? r.flags.map((f) => `<div class="flag"><b>${esc(f.code.replace(/_/g, ' '))}</b> — ${esc(f.message)}</div>`).join('') : '<p>No structural check failed and the three methods agree.</p>'}
${reverse && reverse.status === 'ok' ? `<p>At ${usd(r.price)} the market implies about <b>${pct(reverse.impliedAvgGrowth, 1)}</b> average annual revenue growth against this model's <b>${pct(reverse.modelAvgGrowth, 1)}</b>. ${reverse.impliedAvgGrowth > reverse.modelAvgGrowth ? 'For the market to be right, growth must land far above what the history supports.' : 'The market is pricing less growth than the history supports.'}</p>` : ''}
${bt ? `<p>Held-out test: using data through FY${bt.cutoffYear} only, the engine's revenue error averaged ${pct(bt.revenueMape)} and its operating-income error ${pct(bt.operatingIncomeMape)}. That is the honest precision of everything above.</p>` : ''}
<blockquote>This model extrapolates reported history. It knows nothing about products, competition, regulation, litigation or
management. Where it disagrees violently with the market, the base rate favours the market.</blockquote>`;

  return shell(`${m.ticker} DCF`, summary + wacc + proj + bridge + sensTable + challenge, firm);
}

export function tearsheet({ data, result: r, firm = 'AlphaDesk' }: ReportInput): string {
  const m = data.meta;
  const is_ = data.income_statement.filter((x) => !x.is_projected);
  const recent = is_.slice(-5);
  const body = `
<h1>${esc(m.company_name)} (${esc(m.ticker)}) — Tearsheet</h1>
<div class="grid">
  <div class="stat"><div class="k">Price</div><div class="v">${usd(m.current_price)}</div></div>
  <div class="stat"><div class="k">Shares (mm)</div><div class="v">${((m.shares_outstanding ?? 0) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div></div>
  <div class="stat"><div class="k">Beta</div><div class="v">${m.beta?.toFixed(2) ?? '—'}</div></div>
  <div class="stat"><div class="k">Sector</div><div class="v" style="font-size:13px">${esc(m.sector ?? '—')}</div></div>
</div>
<h2>Reported history</h2>
<table><thead><tr><th>$mm</th>${recent.map((x) => `<th>FY${x.fiscal_year}</th>`).join('')}</tr></thead><tbody>
<tr><td>Revenue</td>${recent.map((x) => `<td>${money(x.revenue as number)}</td>`).join('')}</tr>
<tr><td>Gross margin</td>${recent.map((x) => `<td>${pct(x.revenue ? Number(x.gross_profit) / Number(x.revenue) : null)}</td>`).join('')}</tr>
<tr><td>Operating margin</td>${recent.map((x) => `<td>${pct(x.revenue ? Number(x.operating_income) / Number(x.revenue) : null)}</td>`).join('')}</tr>
<tr><td>Net income</td>${recent.map((x) => `<td>${money(x.net_income as number)}</td>`).join('')}</tr>
<tr><td>Diluted EPS</td>${recent.map((x) => `<td>${usd(x.eps_diluted as number)}</td>`).join('')}</tr>
</tbody></table>
<h2>Valuation</h2>
<table><tbody>
<tr><td>FCFE at cost of equity</td><td>${usd(r.fcfe.perShare)}</td></tr>
<tr><td>FCFF at WACC</td><td>${usd(r.fcff?.perShare ?? null)}</td></tr>
<tr><td>Residual income</td><td>${usd(r.residualIncome?.perShare ?? null)}</td></tr>
<tr class="total"><td>Market price</td><td>${usd(r.price)}</td></tr>
<tr><td>Trailing P/E</td><td>${r.diagnostics.peCurrent?.toFixed(1) ?? '—'}</td></tr>
<tr><td>EV / EBITDA</td><td>${r.diagnostics.evEbitdaCurrent?.toFixed(1) ?? '—'}</td></tr>
</tbody></table>
${r.flags.length ? `<h2>Flags</h2>${r.flags.map((f) => `<div class="flag">${esc(f.message)}</div>`).join('')}` : ''}`;
  return shell(`${m.ticker} tearsheet`, body, firm);
}

/** Model export as CSV — dependency-free and openable anywhere. */
export function modelCsv({ data, result: r }: ReportInput): string {
  const is_ = data.income_statement.filter((x) => !x.is_projected);
  const lastYear = is_.slice(-1)[0]?.fiscal_year ?? 0;
  const head = ['Line item ($mm)', ...is_.map((x) => `FY${x.fiscal_year}`), ...r.projIS.map((p) => `FY${lastYear + p.fy}E`)];
  const rows: (string | number)[][] = [head];
  const push = (label: string, hist: (number | null | undefined)[], proj: (number | null | undefined)[]) =>
    rows.push([label, ...hist.map((v) => (v === null || v === undefined ? '' : v / 1e6)), ...proj.map((v) => (v === null || v === undefined ? '' : v / 1e6))]);

  push('Revenue', is_.map((x) => x.revenue as number), r.projIS.map((p) => p.revenue));
  push('Gross profit', is_.map((x) => x.gross_profit as number), r.projIS.map((p) => p.gross_profit));
  push('Operating income', is_.map((x) => x.operating_income as number), r.projIS.map((p) => p.operating_income));
  push('EBITDA', is_.map((x) => x.ebitda as number), r.projIS.map((p) => p.ebitda));
  push('Net income', is_.map((x) => x.net_income as number), r.projIS.map((p) => p.net_income));
  push('Operating cash flow', data.cash_flow.filter((x) => !x.is_projected).map((x) => x.operating_cash_flow as number), r.projCF.map((p) => p.ocf));
  push('Capital expenditure', data.cash_flow.filter((x) => !x.is_projected).map((x) => x.capital_expenditure as number), r.projCF.map((p) => p.capex));
  push('Free cash flow to equity', is_.map(() => null), r.fcfeRows.map((f) => f.fcfe));
  push('PV of FCFE', is_.map(() => null), r.fcfeRows.map((f) => f.pv));
  rows.push([]);
  rows.push(['Cost of equity', r.costOfEquity]);
  rows.push(['WACC', r.fcff?.wacc ?? '']);
  rows.push(['Terminal growth', r.terminalGrowth]);
  rows.push(['FCFE value per share', r.fcfe.perShare ?? '']);
  rows.push(['FCFF value per share', r.fcff?.perShare ?? '']);
  rows.push(['Residual income per share', r.residualIncome?.perShare ?? '']);
  rows.push(['Market price', r.price ?? '']);
  for (const f of r.flags) rows.push([`FLAG ${f.code}`, f.message]);

  return rows.map((row) => row.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',')).join('\n');
}
