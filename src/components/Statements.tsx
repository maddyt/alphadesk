import type { ProjectedBalance, ProjectedCashFlow, ProjectedIncome, CompanyData } from '@/lib/engine/types';
import { money, pct } from '@/lib/format';

interface Row { label: string; hist: (number | null)[]; proj: (number | null)[]; kind?: 'money' | 'pct'; total?: boolean }

function Table({ title, note, years, projYears, rows }: { title: string; note?: string; years: number[]; projYears: number[]; rows: Row[] }) {
  return (
    <section className="space-y-1">
      <h3 className="font-serif text-lg text-navy">{title}</h3>
      {note && <p className="text-[12.5px] text-muted">{note}</p>}
      <div className="scroller">
        <table className="tbl">
          <thead>
            <tr>
              <th className="li">Line item ($mm)</th>
              {years.map((y) => <th key={y}>FY{y}</th>)}
              {projYears.map((y) => <th key={y} className="proj">FY{y}E</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.total ? 'total' : ''}>
                <td className="li">{r.label}</td>
                {r.hist.map((v, i) => (
                  <td key={i} className={`num ${v !== null && v < 0 ? 'text-neg' : ''}`}>
                    {r.kind === 'pct' ? pct(v) : money(v)}
                  </td>
                ))}
                {r.proj.map((v, i) => (
                  <td key={`p${i}`} className={`num proj ${v !== null && v < 0 ? 'text-neg' : ''}`}>
                    {r.kind === 'pct' ? pct(v) : money(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const g = (rows: Record<string, unknown>[], key: string): (number | null)[] =>
  rows.map((r) => (r[key] === null || r[key] === undefined ? null : Number(r[key])));

export function Statements({ data, projIS, projCF, projBS }: {
  data: CompanyData; projIS: ProjectedIncome[]; projCF: ProjectedCashFlow[]; projBS: ProjectedBalance[];
}) {
  const is_ = data.income_statement.filter((r) => !r.is_projected) as unknown as Record<string, unknown>[];
  const bs = data.balance_sheet.filter((r) => !r.is_projected) as unknown as Record<string, unknown>[];
  const cf = data.cash_flow.filter((r) => !r.is_projected) as unknown as Record<string, unknown>[];
  const years = is_.map((r) => Number(r.fiscal_year));
  const lastYear = years[years.length - 1] ?? new Date().getFullYear();
  const projYears = projIS.map((p) => lastYear + p.fy);
  const P = projIS as unknown as Record<string, unknown>[];
  const PC = projCF as unknown as Record<string, unknown>[];
  const PB = projBS as unknown as Record<string, unknown>[];

  return (
    <div className="space-y-6">
      <Table title="Income statement" years={years} projYears={projYears}
        note="Shaded columns are model output. Margins mean-revert toward a blend of the company's own history and its sector median."
        rows={[
          { label: 'Revenue', hist: g(is_, 'revenue'), proj: g(P, 'revenue'), total: true },
          { label: 'Revenue growth', hist: years.map((_, i) => (i === 0 ? null : (Number(is_[i].revenue) / Number(is_[i - 1].revenue)) - 1)), proj: g(P, 'growth'), kind: 'pct' },
          { label: 'Gross profit', hist: g(is_, 'gross_profit'), proj: g(P, 'gross_profit') },
          { label: 'Gross margin', hist: is_.map((r) => (r.revenue ? Number(r.gross_profit) / Number(r.revenue) : null)), proj: g(P, 'gross_margin'), kind: 'pct' },
          { label: 'Operating income', hist: g(is_, 'operating_income'), proj: g(P, 'operating_income'), total: true },
          { label: 'Operating margin', hist: is_.map((r) => (r.revenue ? Number(r.operating_income) / Number(r.revenue) : null)), proj: g(P, 'operating_margin'), kind: 'pct' },
          { label: 'EBITDA', hist: g(is_, 'ebitda'), proj: g(P, 'ebitda') },
          { label: 'Interest expense', hist: g(is_, 'interest_expense'), proj: g(P, 'interest_expense') },
          { label: 'Interest income', hist: g(is_, 'interest_income'), proj: g(P, 'interest_income') },
          { label: 'Income before tax', hist: g(is_, 'income_before_tax'), proj: g(P, 'income_before_tax') },
          { label: 'Income tax expense', hist: g(is_, 'income_tax_expense'), proj: g(P, 'tax_expense') },
          { label: 'Net income', hist: g(is_, 'net_income'), proj: g(P, 'net_income'), total: true },
          { label: 'Net margin', hist: is_.map((r) => (r.revenue ? Number(r.net_income) / Number(r.revenue) : null)), proj: g(P, 'net_margin'), kind: 'pct' },
        ]} />

      <Table title="Cash flow" years={years} projYears={projYears}
        rows={[
          { label: 'Net income', hist: g(cf, 'net_income'), proj: g(P, 'net_income') },
          { label: 'Depreciation & amortisation', hist: g(cf, 'depreciation_amortization'), proj: g(PC, 'da') },
          { label: 'Stock-based compensation', hist: g(cf, 'stock_based_compensation'), proj: g(PC, 'sbc') },
          { label: 'Change in working capital', hist: g(cf, 'change_in_working_capital'), proj: g(PC, 'wc_change') },
          { label: 'Operating cash flow', hist: g(cf, 'operating_cash_flow'), proj: g(PC, 'ocf'), total: true },
          { label: 'Capital expenditure', hist: g(cf, 'capital_expenditure'), proj: g(PC, 'capex') },
          { label: 'Dividends paid', hist: g(cf, 'dividends_paid'), proj: g(PC, 'div_paid') },
          { label: 'Share repurchases', hist: g(cf, 'stock_repurchased'), proj: g(PC, 'buybacks') },
          { label: 'Net debt issuance', hist: g(cf, 'debt_repayment'), proj: g(PC, 'd_repay') },
          { label: 'Free cash flow', hist: g(cf, 'free_cash_flow'), proj: g(PC, 'free_cash_flow'), total: true },
        ]} />

      <Table title="Balance sheet" years={years} projYears={projYears}
        note="The balance check row is shown for every year. Non-zero in a reported year is a source-data gap; non-zero in a projected year is the model's own unplugged residual."
        rows={[
          { label: 'Cash & equivalents', hist: g(bs, 'cash_and_equivalents'), proj: g(PB, 'cash') },
          { label: 'Accounts receivable', hist: g(bs, 'accounts_receivable'), proj: g(PB, 'ar') },
          { label: 'Inventory', hist: g(bs, 'inventory'), proj: g(PB, 'inv') },
          { label: 'Total current assets', hist: g(bs, 'total_current_assets'), proj: g(PB, 'totalCurrentAssets'), total: true },
          { label: 'Property, plant & equipment', hist: g(bs, 'property_plant_equipment'), proj: g(PB, 'ppe') },
          { label: 'Total assets', hist: g(bs, 'total_assets'), proj: g(PB, 'totalAssets'), total: true },
          { label: 'Total liabilities', hist: g(bs, 'total_liabilities'), proj: g(PB, 'totalLiabilities'), total: true },
          { label: 'Total debt', hist: g(bs, 'total_debt'), proj: g(PB, 'totalDebt') },
          { label: "Total stockholders' equity", hist: g(bs, 'total_stockholders_equity'), proj: g(PB, 'totalSE'), total: true },
          {
            label: 'Balance check (A − L − E)',
            hist: bs.map((r) => (r.total_assets === null || r.total_assets === undefined ? null : Number(r.total_assets) - Number(r.total_liabilities ?? 0) - Number(r.total_stockholders_equity ?? 0) - Number(r.minority_interest ?? 0))),
            proj: g(PB, 'balanceCheck'), total: true,
          },
        ]} />
    </div>
  );
}
