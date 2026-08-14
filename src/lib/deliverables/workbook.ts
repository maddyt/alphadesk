/**
 * Excel model export. Uses exceljs, so it is the one deliverable that needs a dependency —
 * kept isolated behind a dynamic import so the rest of the app (and the tests) never pay for it.
 * Follows banking convention: blue for hardcoded inputs, black for formulas, negatives in
 * parentheses, percentages stored as fractions.
 */
import type { CompanyData, ScenarioResult } from '../engine/types.ts';

const CUR = '$#,##0;($#,##0);"-"';
const PCT = '0.0%;(0.0%);"-"';
const CUR2 = '$#,##0.00;($#,##0.00);"-"';

export async function buildWorkbook(data: CompanyData, r: ScenarioResult): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AlphaDesk';
  wb.created = new Date();

  const is_ = data.income_statement.filter((x) => !x.is_projected);
  const lastYear = is_.slice(-1)[0]?.fiscal_year ?? 0;
  const histCols = is_.map((x) => `FY${x.fiscal_year}`);
  const projCols = r.projIS.map((p) => `FY${lastYear + p.fy}E`);

  const blue = { font: { color: { argb: 'FF0000FF' }, name: 'Arial', size: 10 } };
  const black = { font: { name: 'Arial', size: 10 } };
  const bold = { font: { name: 'Arial', size: 10, bold: true } };

  // ---- Summary
  const s = wb.addWorksheet('Summary');
  s.columns = [{ width: 46 }, { width: 18 }, { width: 16 }];
  s.addRow([`${data.meta.company_name} (${data.meta.ticker}) — valuation summary`]).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1B2A4A' } };
  s.addRow(['Generated', new Date().toISOString().slice(0, 10)]);
  s.addRow([]);
  s.addRow(['Method', 'Value per share', 'vs market']).eachCell((c) => { c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }; });
  const addVal = (label: string, v: number | null | undefined) => {
    const row = s.addRow([label, v ?? null, v && r.price ? v / r.price - 1 : null]);
    row.getCell(2).numFmt = CUR2; row.getCell(3).numFmt = PCT;
    row.getCell(1).style = black;
  };
  addVal('FCFE discounted at cost of equity', r.fcfe.perShare);
  addVal('FCFF discounted at WACC (EV bridge)', r.fcff?.perShare ?? null);
  addVal('Residual income', r.residualIncome?.perShare ?? null);
  const priceRow = s.addRow(['Market price', r.price ?? null]);
  priceRow.getCell(2).numFmt = CUR2; priceRow.font = bold.font;
  s.addRow([]);
  const stats: [string, number | null | undefined, string][] = [
    ['Cost of equity', r.costOfEquity, PCT], ['WACC', r.fcff?.wacc ?? null, PCT],
    ['Terminal growth', r.terminalGrowth, PCT],
    ['Terminal value share of enterprise value', r.fcff?.tvShare ?? null, PCT],
    ['Widest disagreement across methods', r.diagnostics.spread, PCT],
  ];
  for (const [k, v, fmt] of stats) { const row = s.addRow([k, v ?? null]); row.getCell(2).numFmt = fmt; }
  s.addRow([]);
  s.addRow(['Sanity flags']).font = { name: 'Arial', size: 10, bold: true };
  if (r.flags.length) for (const f of r.flags) s.addRow([f.code.replace(/_/g, ' '), f.message]);
  else s.addRow(['none', 'No structural check failed.']);

  // ---- Statements
  const sheet = (name: string, rows: { label: string; hist: (number | null | undefined)[]; proj: (number | null | undefined)[]; fmt?: string; bold?: boolean }[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [{ width: 42 }, ...histCols.map(() => ({ width: 14 })), ...projCols.map(() => ({ width: 14 }))];
    const header = ws.addRow(['Line item ($mm)', ...histCols, ...projCols]);
    header.eachCell((c) => { c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }; });
    for (const row of rows) {
      const vals = [row.label,
        ...row.hist.map((v) => (v === null || v === undefined ? null : row.fmt === PCT ? v : v / 1e6)),
        ...row.proj.map((v) => (v === null || v === undefined ? null : row.fmt === PCT ? v : v / 1e6))];
      const rr = ws.addRow(vals);
      rr.getCell(1).style = row.bold ? bold : black;
      rr.eachCell((c, i) => {
        if (i === 1) return;
        c.numFmt = row.fmt ?? CUR;
        c.style = { ...(i <= histCols.length + 1 ? blue : black), numFmt: row.fmt ?? CUR } as never;
        if (row.bold) c.font = { name: 'Arial', size: 10, bold: true, color: i <= histCols.length + 1 ? { argb: 'FF0000FF' } : undefined };
      });
    }
    return ws;
  };

  const cf = data.cash_flow.filter((x) => !x.is_projected);
  const bs = data.balance_sheet.filter((x) => !x.is_projected);
  sheet('Income Statement', [
    { label: 'Revenue', hist: is_.map((x) => x.revenue as number), proj: r.projIS.map((p) => p.revenue), bold: true },
    { label: 'Gross profit', hist: is_.map((x) => x.gross_profit as number), proj: r.projIS.map((p) => p.gross_profit) },
    { label: 'Gross margin', hist: is_.map((x) => (x.revenue ? Number(x.gross_profit) / Number(x.revenue) : null)), proj: r.projIS.map((p) => p.gross_margin), fmt: PCT },
    { label: 'Operating income', hist: is_.map((x) => x.operating_income as number), proj: r.projIS.map((p) => p.operating_income), bold: true },
    { label: 'Operating margin', hist: is_.map((x) => (x.revenue ? Number(x.operating_income) / Number(x.revenue) : null)), proj: r.projIS.map((p) => p.operating_margin), fmt: PCT },
    { label: 'EBITDA', hist: is_.map((x) => x.ebitda as number), proj: r.projIS.map((p) => p.ebitda) },
    { label: 'Interest expense', hist: is_.map((x) => x.interest_expense as number), proj: r.projIS.map((p) => p.interest_expense) },
    { label: 'Income before tax', hist: is_.map((x) => x.income_before_tax as number), proj: r.projIS.map((p) => p.income_before_tax) },
    { label: 'Income tax expense', hist: is_.map((x) => x.income_tax_expense as number), proj: r.projIS.map((p) => p.tax_expense) },
    { label: 'Net income', hist: is_.map((x) => x.net_income as number), proj: r.projIS.map((p) => p.net_income), bold: true },
  ]);
  sheet('Cash Flow', [
    { label: 'Operating cash flow', hist: cf.map((x) => x.operating_cash_flow as number), proj: r.projCF.map((p) => p.ocf), bold: true },
    { label: 'Depreciation & amortisation', hist: cf.map((x) => x.depreciation_amortization as number), proj: r.projCF.map((p) => p.da) },
    { label: 'Stock-based compensation', hist: cf.map((x) => x.stock_based_compensation as number), proj: r.projCF.map((p) => p.sbc) },
    { label: 'Capital expenditure', hist: cf.map((x) => x.capital_expenditure as number), proj: r.projCF.map((p) => p.capex) },
    { label: 'Dividends paid', hist: cf.map((x) => x.dividends_paid as number), proj: r.projCF.map((p) => p.div_paid) },
    { label: 'Share repurchases', hist: cf.map((x) => x.stock_repurchased as number), proj: r.projCF.map((p) => p.buybacks) },
    { label: 'Free cash flow', hist: cf.map((x) => x.free_cash_flow as number), proj: r.projCF.map((p) => p.free_cash_flow), bold: true },
  ]);
  sheet('Balance Sheet', [
    { label: 'Cash & equivalents', hist: bs.map((x) => x.cash_and_equivalents as number), proj: r.projBS.map((p) => p.cash) },
    { label: 'Total assets', hist: bs.map((x) => x.total_assets as number), proj: r.projBS.map((p) => p.totalAssets), bold: true },
    { label: 'Total debt', hist: bs.map((x) => x.total_debt as number), proj: r.projBS.map((p) => p.totalDebt) },
    { label: 'Total liabilities', hist: bs.map((x) => x.total_liabilities as number), proj: r.projBS.map((p) => p.totalLiabilities), bold: true },
    { label: "Total stockholders' equity", hist: bs.map((x) => x.total_stockholders_equity as number), proj: r.projBS.map((p) => p.totalSE), bold: true },
    { label: 'Balance check (A - L - E)', hist: bs.map((x) => (x.total_assets == null ? null : Number(x.total_assets) - Number(x.total_liabilities ?? 0) - Number(x.total_stockholders_equity ?? 0) - Number(x.minority_interest ?? 0))), proj: r.projBS.map((p) => p.balanceCheck), bold: true },
  ]);

  // ---- DCF
  const d = wb.addWorksheet('DCF');
  d.columns = [{ width: 46 }, ...projCols.map(() => ({ width: 15 }))];
  const dh = d.addRow(['FCFE build ($mm)', ...projCols]);
  dh.eachCell((c) => { c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B2A4A' } }; });
  const dcfRow = (label: string, vals: number[], b = false) => {
    const rr = d.addRow([label, ...vals.map((v) => v / 1e6)]);
    rr.eachCell((c, i) => { if (i > 1) c.numFmt = CUR; if (b) c.font = { name: 'Arial', size: 10, bold: true }; });
  };
  dcfRow('Operating cash flow', r.fcfeRows.map((f) => f.ocf));
  dcfRow('Capital expenditure', r.fcfeRows.map((f) => f.capex));
  dcfRow('Net borrowing (used)', r.fcfeRows.map((f) => f.nb));
  dcfRow('Less: stock-based compensation', r.fcfeRows.map((f) => -f.sbcDed));
  dcfRow('Free cash flow to equity', r.fcfeRows.map((f) => f.fcfe), true);
  dcfRow('PV of FCFE', r.fcfeRows.map((f) => f.pv));
  d.addRow([]);
  const bridge: [string, number | null | undefined][] = [
    ['Sum of PV (5 years)', r.fcfe.pvSum], ['PV of terminal value', r.fcfe.pvTerminal],
    ['Equity value', r.fcfe.equityValue], ['Enterprise value (FCFF route)', r.fcff?.enterpriseValue],
    ['Less: net debt', r.fcff ? -r.fcff.netDebt : null], ['Equity value (FCFF route)', r.fcff?.equityValue],
  ];
  for (const [k, v] of bridge) { const rr = d.addRow([k, v == null ? null : v / 1e6]); rr.getCell(2).numFmt = CUR; }

  // ---- Notes
  const n = wb.addWorksheet('Sources & Notes');
  n.columns = [{ width: 34 }, { width: 110 }];
  const note = (k: string, v: string) => { const rr = n.addRow([k, v]); rr.getCell(1).font = { name: 'Arial', size: 10, bold: true }; rr.getCell(2).alignment = { wrapText: true }; };
  note('Data source', 'Provider fundamentals ingested by AlphaDesk. Raw vendor payloads are retained alongside the corrected copy used here.');
  note('Corrections', 'Duplicate fiscal-year rows are de-duplicated and every "other" balance-sheet bucket is rebuilt as a residual so subtotals tie.');
  note('Projections', 'Computed by the AlphaDesk engine: revenue mean-reverts toward a long-run anchor, margins blend company history with the sector median, ratio lines hold at weighted-average historical levels.');
  note('Stock-based compensation', r.diagnostics.sbcDeducted ? 'Deducted from free cash flow as a real economic cost.' : 'Left inside free cash flow (non-cash add-back).');
  note('Share count', r.diagnostics.sharesLinked ? 'Rolls forward with buybacks and issuance at the current price.' : 'Follows its own historical growth trend.');
  note('Discounting', r.diagnostics.midYear ? 'Mid-year convention (cash arrives through the year).' : 'Year-end convention.');
  note('Known limitation', 'The projected balance sheet is not forced to balance; each line rolls forward independently and the residual is reported on the Balance Sheet tab rather than plugged.');
  note('Disclaimer', 'Analyst work product for review by a qualified professional. Not investment advice, and no recommendation is made or implied.');

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
