'use client';

import { useState } from 'react';
import type { Assumptions, BaseInputs, WaccBuild } from '@/lib/engine/model';
import { evToPrice } from '@/lib/engine/model';
import type { ValuationRun } from '@/lib/engine/valuation';
import { money, mm, mult, pct, price } from '@/lib/format';
import { Columns, Waterfall } from '../charts/Charts';
import { Card, td, th } from '../ui';

const compact = (v: number) => money(v, 0).replace('.0', '');

export function DcfTab({ b, a, run, wacc }: { b: BaseInputs; a: Assumptions; run: ValuationRun; wacc: WaccBuild }) {
  const [tv, setTv] = useState<'gordon' | 'exit'>('gordon');
  const d = run.dcf;
  const ev = tv === 'gordon' ? d.evGordon : d.evExit;
  const pvTv = tv === 'gordon' ? d.pvTvGordon : d.pvTvExit;
  const equity = ev - b.netDebt;
  const tvShare = pvTv / ev;

  const rows: { label: string; base?: number; get: (i: number) => number; fmt?: (v: number) => string; strong?: boolean; italic?: boolean }[] = [
    { label: 'Revenue', base: b.revenue0, get: (i) => d.years[i].revenue, strong: true },
    { label: '  % growth', get: (i) => d.years[i].growth, fmt: (v) => pct(v), italic: true },
    { label: 'EBIT', base: b.ebit0, get: (i) => d.years[i].ebit },
    { label: '  % margin', base: b.ebitMargin0, get: (i) => d.years[i].ebit / d.years[i].revenue, fmt: (v) => pct(v), italic: true },
    { label: '(-) Taxes', get: (i) => -d.years[i].taxes },
    { label: 'NOPAT', get: (i) => d.years[i].nopat },
    { label: '(+) D&A', base: b.da0, get: (i) => d.years[i].da },
    { label: '(-) CapEx', base: -b.capex0, get: (i) => -d.years[i].capex },
    { label: '(-) Increase in NWC', get: (i) => -d.years[i].dNwc },
    { label: 'Unlevered FCF', get: (i) => d.years[i].fcff, strong: true },
    { label: 'Discount factor', get: (i) => d.years[i].discountFactor, fmt: (v) => v.toFixed(3), italic: true },
    { label: 'PV of FCF', get: (i) => d.years[i].pvFcff, strong: true },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Revenue" subtitle={`Reported (SEC XBRL) and projected, ${b.baseLabel} base year`}>
          <Columns
            title=""
            format={compact}
            data={[
              ...b.history.map((h) => ({ label: h.label, value: h.revenue })),
              ...d.years.map((y) => ({ label: y.label, value: y.revenue, estimate: true })),
            ]}
          />
        </Card>
        <Card title="Unlevered free cash flow" subtitle="FCFF = EBIT x (1 - t) + D&A - CapEx - change in NWC">
          <Columns title="" format={compact} data={d.years.map((y) => ({ label: y.label, value: y.fcff, estimate: true }))} />
        </Card>
      </div>

      <Card title="Discounted cash flow build" subtitle="USD millions; projections fade revenue growth to the perpetuity rate by year 5">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>($M)</th>
                <th className={th}>{b.baseLabel}A</th>
                {d.years.map((y) => (
                  <th key={y.label} className={`${th} text-[#8DB4FF]`}>
                    {y.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className={`border-b border-line/40 ${r.strong ? 'bg-raised/40' : ''}`}>
                  <td className={`${td} whitespace-pre ${r.strong ? 'font-semibold text-ink' : ''} ${r.italic ? 'italic text-mute' : ''}`}>{r.label}</td>
                  <td className={`${td} ${r.italic ? 'italic text-mute' : ''}`}>{r.base === undefined ? '' : r.fmt ? r.fmt(r.base) : mm(r.base)}</td>
                  {d.years.map((_, i) => (
                    <td key={i} className={`${td} ${r.strong ? 'font-semibold text-ink' : ''} ${r.italic ? 'italic text-mute' : ''}`}>
                      {r.fmt ? r.fmt(r.get(i)) : mm(r.get(i))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
        <Card title="WACC build" subtitle="CAPM cost of equity, market-value weights">
          <dl className="num grid grid-cols-[1fr_auto] gap-y-2 text-[13px]">
            {(
              [
                ['Risk-free rate (10Y UST)', pct(wacc.riskFree, 2)],
                ['Levered beta', `${wacc.beta.toFixed(2)}`],
                ['Equity risk premium', pct(wacc.erp, 2)],
                ['Cost of equity  Ke = Rf + β(Rm − Rf)', pct(wacc.costOfEquity, 2), true],
                ['Pre-tax cost of debt', pct(wacc.preTaxKd, 2)],
                ['After-tax cost of debt', pct(wacc.afterTaxKd, 2), true],
                ['E / (D + E)', pct(wacc.weightEquity)],
                ['D / (D + E)', pct(wacc.weightDebt)],
              ] as [string, string, boolean?][]
            ).map(([k, v, strong]) => (
              <div key={k} className="contents">
                <dt className={`font-sans ${strong ? 'text-ink' : 'text-sub'}`}>{k}</dt>
                <dd className={`text-right ${strong ? 'font-semibold text-ink' : 'text-sub'}`}>{v}</dd>
              </div>
            ))}
            <dt className="mt-2 border-t border-line pt-2.5 font-sans font-semibold text-ink">Computed WACC</dt>
            <dd className="mt-2 border-t border-line pt-2.5 text-right text-lg font-semibold text-ink">{pct(wacc.wacc, 2)}</dd>
            <dt className="font-sans text-mute">WACC used (slider)</dt>
            <dd className="text-right font-semibold text-[#8DB4FF]">{pct(a.wacc, 2)}</dd>
          </dl>
        </Card>

        <Card
          title="Enterprise value to share price"
          subtitle={`${tv === 'gordon' ? 'Perpetuity growth' : 'Exit multiple'} method · terminal value is ${pct(tvShare, 0)} of EV`}
          right={
            <div className="flex rounded-lg border border-line p-0.5 text-[11px]">
              {(['gordon', 'exit'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setTv(k)} className={`rounded-md px-2.5 py-1 ${tv === k ? 'bg-brand text-white' : 'text-sub hover:text-ink'}`}>
                  {k === 'gordon' ? 'Perpetuity' : 'Exit multiple'}
                </button>
              ))}
            </div>
          }
        >
          <Waterfall
            format={compact}
            steps={[
              { label: 'PV of FCF\nYears 1-5', value: d.sumPvFcff, kind: 'add' },
              { label: 'PV of terminal\nvalue', value: pvTv, kind: 'add' },
              { label: 'Enterprise\nvalue', value: ev, kind: 'total' },
              { label: b.netDebt >= 0 ? 'Less: net\ndebt' : 'Plus: net\ncash', value: Math.abs(b.netDebt), kind: b.netDebt >= 0 ? 'sub' : 'add' },
              { label: 'Equity\nvalue', value: equity, kind: 'total' },
            ]}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Implied share price" value={price(evToPrice(b, ev))} strong />
            <Mini label="Diluted shares" value={`${(b.shares / 1e9).toFixed(2)}B`} />
            <Mini label={tv === 'gordon' ? 'Implied exit multiple' : 'Implied perpetuity growth'} value={tv === 'gordon' ? mult(d.impliedExitMultiple) : pct(d.impliedPerpetualGrowth, 2)} />
            <Mini label="Terminal value" value={money(tv === 'gordon' ? d.tvGordon : d.tvExit)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-raised/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`num mt-1 text-[15px] font-semibold ${strong ? 'text-[#8DB4FF]' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
