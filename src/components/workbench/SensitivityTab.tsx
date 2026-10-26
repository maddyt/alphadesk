'use client';

import type { SensitivityGrid } from '@/lib/engine/valuation';
import { pct, price } from '@/lib/format';
import { Card } from '../ui';

/** Diverging fill around the current share price: green above, red below, neutral at par. */
function cellColor(v: number, current: number): string {
  const d = Math.max(-0.5, Math.min(0.5, v / current - 1));
  const a = 0.08 + (Math.abs(d) / 0.5) * 0.62;
  if (Math.abs(d) < 0.02) return 'rgba(148,163,184,0.14)';
  return d > 0 ? `rgba(34,197,94,${a.toFixed(3)})` : `rgba(239,68,68,${a.toFixed(3)})`;
}

function Grid({ g, current, colFmt }: { g: SensitivityGrid; current: number; colFmt: (v: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[480px] border-separate border-spacing-1 text-[12.5px]">
        <thead>
          <tr>
            <th className="w-20 text-left text-[10px] font-medium uppercase tracking-wider text-mute">
              {g.rowLabel} ↓ / {g.colLabel.split(' ')[0]} →
            </th>
            {g.cols.map((c, j) => (
              <th key={c} className={`rounded-md px-2 py-1.5 text-center font-semibold ${j === 2 ? 'bg-brand/20 text-[#8DB4FF]' : 'text-sub'}`}>
                {colFmt(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r, i) => (
            <tr key={r}>
              <th className={`rounded-md px-2 py-1.5 text-left font-semibold ${i === 2 ? 'bg-brand/20 text-[#8DB4FF]' : 'text-sub'}`}>{pct(r, 2)}</th>
              {g.values[i].map((v, j) => {
                const base = i === 2 && j === 2;
                return (
                  <td
                    key={j}
                    className={`rounded-md px-2 py-2 text-center font-medium text-ink ${base ? 'outline outline-2 outline-offset-[-2px] outline-white/80' : ''}`}
                    style={{ background: cellColor(v, current) }}
                    title={`${price(v)} (${((v / current - 1) * 100).toFixed(1)}% vs current)`}
                  >
                    {price(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SensitivityTab({ growth, exit, current }: { growth: SensitivityGrid; exit: SensitivityGrid; current: number }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs text-sub">
        <span>Implied share price per cell, shaded against the current price of</span>
        <span className="num font-semibold text-ink">{price(current)}</span>
        <span className="ml-auto flex items-center gap-2">
          <span className="h-3 w-6 rounded" style={{ background: 'rgba(239,68,68,0.6)' }} /> −50%
          <span className="h-3 w-6 rounded" style={{ background: 'rgba(148,163,184,0.14)' }} /> at market
          <span className="h-3 w-6 rounded" style={{ background: 'rgba(34,197,94,0.6)' }} /> +50%
        </span>
      </div>
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card title="WACC vs perpetuity growth" subtitle="Gordon growth terminal value">
          <Grid g={growth} current={current} colFmt={(v) => pct(v, 2)} />
        </Card>
        <Card title="WACC vs exit multiple" subtitle="Terminal value = exit EV/EBITDA x final-year EBITDA">
          <Grid g={exit} current={current} colFmt={(v) => `${v.toFixed(1)}x`} />
        </Card>
      </div>
    </div>
  );
}
