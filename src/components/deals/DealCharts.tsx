'use client';

import { useState } from 'react';
import { DARK, LIGHT, type ChartTheme } from '../charts/theme';
import { useWidth } from '../charts/useWidth';
import type { DealGrid } from '@/lib/deals/engine';
import { money, pct } from '@/lib/format';

export interface WaterStep {
  label: string;
  sub?: string;
  value: number;
  kind: 'total' | 'add' | 'sub';
}

const tabular = { fontVariantNumeric: 'tabular-nums' } as const;

/** Horizontal floating-bar waterfall (PRD 5.3): standalone NI -> pro-forma NI. Pure SVG, renders server-side too. */
export function WaterfallSvg({ steps, width, theme: t = DARK, animate = true, rowHeight }: { steps: WaterStep[]; width: number; theme?: ChartTheme; animate?: boolean; rowHeight?: number }) {
  // On narrow screens the label sits above its bar instead of beside it.
  const narrow = width < 560;
  const labelW = narrow ? 0 : 210;
  const rowH = rowHeight ?? (narrow ? 52 : 48);
  const barTop = narrow ? 22 : rowH * 0.22;
  const barH = narrow ? 20 : rowH * 0.56;
  const padR = narrow ? 70 : 84;
  const top = 8;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === 'total') {
      run = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = run;
    run += s.kind === 'add' ? s.value : -s.value;
    return { ...s, from, to: run };
  });
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
  const x0 = labelW + 8;
  const x1 = width - padR;
  const x = (v: number) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
  const height = top + bars.length * rowH + 8;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Net income bridge from standalone to pro-forma" style={{ display: 'block' }}>
      <line x1={x(0)} x2={x(0)} y1={top} y2={height - 4} stroke={t.axis} />
      {bars.map((b, i) => {
        const y = top + i * rowH;
        const left = x(Math.min(b.from, b.to));
        const w = Math.max(2, Math.abs(x(b.to) - x(b.from)));
        const fill = b.kind === 'total' ? (i === bars.length - 1 ? t.mark : t.bar) : b.kind === 'add' ? t.up : t.down;
        const valueText = b.kind === 'sub' ? `−${money(b.value)}` : b.kind === 'add' ? `+${money(b.value)}` : money(b.value);
        return (
          <g key={b.label}>
            {i > 0 && <line x1={x(b.from)} x2={x(b.from)} y1={y - rowH + barTop + barH} y2={y + barTop} stroke={t.mute} strokeDasharray="3 3" />}
            {narrow ? (
              <text x={8} y={y + 12} fontSize={11.5} fontWeight={b.kind === 'total' ? 700 : 500} fill={t.text}>
                {b.label}
                {b.sub && (
                  <tspan fill={t.mute} fontWeight={400} fontSize={10}>
                    {'  '}
                    {b.sub}
                  </tspan>
                )}
              </text>
            ) : (
              <>
                <text x={8} y={y + rowH / 2 - (b.sub ? 5 : 0)} dominantBaseline="middle" fontSize={13} fontWeight={b.kind === 'total' ? 700 : 500} fill={t.text}>
                  {b.label}
                </text>
                {b.sub && (
                  <text x={8} y={y + rowH / 2 + 10} dominantBaseline="middle" fontSize={10.5} fill={t.mute}>
                    {b.sub}
                  </text>
                )}
              </>
            )}
            <rect
              x={left}
              y={y + barTop}
              width={w}
              height={barH}
              rx={4}
              fill={fill}
              opacity={b.kind === 'total' ? 1 : 0.9}
              style={animate ? { transition: 'x 300ms, width 300ms', transformBox: 'fill-box', transformOrigin: 'left', animation: `grow 800ms cubic-bezier(.2,.8,.2,1) ${i * 80}ms both` } : undefined}
            />
            <text x={left + w + 6} y={y + barTop + barH / 2} dominantBaseline="middle" fontSize={narrow ? 11 : 12} fontWeight={600} fill={t.text} style={tabular}>
              {valueText}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Waterfall({ steps }: { steps: WaterStep[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  return (
    <div ref={ref}>
      <WaterfallSvg steps={steps} width={width} />
    </div>
  );
}

export { LIGHT };

/** Accretion/dilution heatmap: green accretive, red dilutive, base case outlined. */
export function DealHeatmap({ g, base }: { g: DealGrid; base: { row: number; col: number } }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const fmt = (v: number, f: 'pct' | 'usd') => (f === 'pct' ? pct(v, 0) : money(v, 0));
  const nearest = (xs: number[], v: number) => xs.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(xs[bi] - v) ? i : bi), 0);
  const br = nearest(g.rows, base.row);
  const bc = nearest(g.cols, base.col);
  return (
    <div className="overflow-x-auto">
      <table className="num w-full min-w-[420px] border-separate border-spacing-1 text-[12px]">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-medium uppercase tracking-wider text-mute">
              {g.rowLabel} ↓<br />
              {g.colLabel} →
            </th>
            {g.cols.map((c, j) => (
              <th key={c} className={`rounded-md px-2 py-1.5 text-center font-semibold ${j === bc ? 'bg-brand/20 text-[#8DB4FF]' : 'text-sub'}`}>
                {fmt(c, g.colFmt)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r, i) => (
            <tr key={r}>
              <th className={`rounded-md px-2 py-1.5 text-left font-semibold ${i === br ? 'bg-brand/20 text-[#8DB4FF]' : 'text-sub'}`}>{fmt(r, g.rowFmt)}</th>
              {g.values[i].map((v, j) => {
                const a = Math.min(0.75, 0.12 + Math.abs(v) * 6);
                const bg = Math.abs(v) < 0.002 ? 'rgba(148,163,184,0.14)' : v > 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`;
                return (
                  <td
                    key={j}
                    onMouseEnter={() => setHover([i, j])}
                    onMouseLeave={() => setHover(null)}
                    className={`rounded-md px-2 py-2 text-center font-medium text-ink ${i === br && j === bc ? 'outline outline-2 outline-offset-[-2px] outline-white/80' : ''} ${hover && hover[0] === i && hover[1] === j ? 'ring-2 ring-brand' : ''}`}
                    style={{ background: bg }}
                  >
                    {v >= 0 ? '+' : ''}
                    {(v * 100).toFixed(1)}%
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
