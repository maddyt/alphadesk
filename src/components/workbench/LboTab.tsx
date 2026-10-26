'use client';

import type { Assumptions, BaseInputs } from '@/lib/engine/model';
import { evToPrice } from '@/lib/engine/model';
import type { LboResult } from '@/lib/engine/lbo';
import { LBO_FEES_PCT, LBO_HOLD_YEARS } from '@/lib/engine/lbo';
import { money, mm, mult, pct, price } from '@/lib/format';
import { Columns } from '../charts/Charts';
import { Card, td, th } from '../ui';

export function LboTab({ b, a, lbo }: { b: BaseInputs; a: Assumptions; lbo: LboResult | null }) {
  if (!lbo) {
    return <Card title="LBO floor">The LBO could not be solved: LTM EBITDA is not positive, so there is no debt capacity to model.</Card>;
  }
  const premium = evToPrice(b, lbo.entryEv) / b.price - 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Max entry EV" value={money(lbo.entryEv)} sub={`${mult(lbo.entryMultiple)} ${b.ltmLabel} EBITDA`} />
        <Kpi label="Implied share price" value={price(evToPrice(b, lbo.entryEv))} sub={`${premium >= 0 ? '+' : ''}${pct(premium)} vs current`} accent />
        <Kpi label="Sponsor IRR" value={pct(lbo.irr)} sub={`Target ${pct(a.lboTargetIrr)}`} />
        <Kpi label="MoIC" value={mult(lbo.moic, 2)} sub={`${LBO_HOLD_YEARS}-year hold`} />
        <Kpi label="Exit EV" value={money(lbo.exitEv)} sub={`${mult(lbo.exitMultiple)} exit multiple`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Sources & uses" subtitle="At the solved entry price">
          <div className="grid grid-cols-2 gap-6">
            <SU
              title="Sources"
              rows={[
                ['Senior debt', lbo.debt, `${mult(lbo.debt / b.ltmEbitda)} EBITDA`],
                ['Sponsor equity', lbo.sponsorEquity, pct(lbo.sponsorEquity / (lbo.entryEv + lbo.fees), 0)],
              ]}
              total={lbo.entryEv + lbo.fees}
            />
            <SU
              title="Uses"
              rows={[
                ['Purchase enterprise value', lbo.entryEv, mult(lbo.entryMultiple)],
                ['Fees & expenses', lbo.fees, pct(LBO_FEES_PCT, 0)],
              ]}
              total={lbo.entryEv + lbo.fees}
            />
          </div>
        </Card>
        <Card title="Debt paydown" subtitle={`100% cash sweep at ${pct(a.lboInterestRate, 2)} cost of debt`}>
          <Columns
            title=""
            height={200}
            format={(v) => money(v, 0)}
            data={[{ label: 'Close', value: lbo.debt }, ...lbo.years.map((y) => ({ label: y.label, value: y.endingDebt, estimate: true }))]}
          />
        </Card>
      </div>

      <Card title="Debt schedule & cash flow" subtitle="USD millions">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>($M)</th>
                {lbo.years.map((y) => (
                  <th key={y.label} className={th}>
                    {y.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['EBITDA', (i: number) => lbo.years[i].ebitda, true],
                  ['(-) Interest', (i: number) => -lbo.years[i].interest],
                  ['(-) Cash taxes', (i: number) => -lbo.years[i].taxes],
                  ['(-) CapEx', (i: number) => -lbo.years[i].capex],
                  ['(-) Increase in NWC', (i: number) => -lbo.years[i].dNwc],
                  ['Free cash flow to debt paydown', (i: number) => lbo.years[i].fcf, true],
                  ['Ending debt', (i: number) => lbo.years[i].endingDebt, true],
                  ['Debt / EBITDA', (i: number) => lbo.years[i].endingDebt / lbo.years[i].ebitda, false, true],
                ] as [string, (i: number) => number, boolean?, boolean?][]
              ).map(([label, get, strong, isMult]) => (
                <tr key={label} className={`border-b border-line/40 ${strong ? 'bg-raised/40' : ''}`}>
                  <td className={`${td} ${strong ? 'font-semibold text-ink' : ''}`}>{label}</td>
                  {lbo.years.map((_, i) => (
                    <td key={i} className={`${td} ${strong ? 'font-semibold text-ink' : ''}`}>
                      {isMult ? mult(get(i)) : mm(get(i))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-mute">
          The floor is solved by bisection: the highest entry price at which a sponsor levered {mult(a.lboLeverage)} (capped at 75% of price) still earns a {pct(a.lboTargetIrr, 1)} IRR
          exiting at {mult(a.exitMultiple)} after {LBO_HOLD_YEARS} years. The football-field bar spans leverage of {mult(a.lboLeverage - 0.5)}-{mult(a.lboLeverage + 0.5)} and exit multiples ±1.0x.
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border px-4 py-3.5 ${accent ? 'border-brand/50 bg-brand/10' : 'border-line bg-panel/80'}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${accent ? 'text-[#8DB4FF]' : 'text-ink'}`}>{value}</div>
      <div className="num mt-0.5 text-[11px] text-mute">{sub}</div>
    </div>
  );
}

function SU({ title, rows, total }: { title: string; rows: [string, number, string][]; total: number }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sub">{title}</div>
      {rows.map(([k, v, note]) => (
        <div key={k} className="flex items-baseline justify-between border-b border-line/50 py-1.5 text-[13px]">
          <span className="text-sub">
            {k} <span className="num text-[11px] text-mute">{note}</span>
          </span>
          <span className="num text-ink">{money(v)}</span>
        </div>
      ))}
      <div className="flex justify-between pt-2 text-[13px] font-semibold">
        <span className="text-ink">Total</span>
        <span className="num text-ink">{money(total)}</span>
      </div>
    </div>
  );
}
