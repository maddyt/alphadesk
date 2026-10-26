'use client';

import { useState } from 'react';
import { DARK, niceTicks } from './theme';
import { useWidth } from './useWidth';

const t = DARK;
const tabular = { fontVariantNumeric: 'tabular-nums' } as const;

/* ---------------------------------------------------------------- Sparkline */

export function Sparkline({ values, width = 120, height = 32, color = t.bar }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - lo) / (hi - lo || 1)) * (height - 4);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const up = values[values.length - 1] >= values[0];
  const stroke = color === 'auto' ? (up ? t.up : t.down) : color;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill={stroke} />
    </svg>
  );
}

/* ---------------------------------------------------------- Column chart */

export interface Column {
  label: string;
  value: number;
  estimate?: boolean;
}

/** Single-series columns; estimates drawn hollow so actuals vs projections read at a glance. */
export function Columns({ title, data, format, height = 220 }: { title: string; data: Column[]; format: (v: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<number | null>(null);
  const padL = 56;
  const padB = 28;
  const padT = 14;
  const lo = Math.min(0, ...data.map((d) => d.value));
  const hiRaw = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(lo, hiRaw, 4);
  const hi = Math.max(hiRaw, ticks[ticks.length - 1]);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB);
  const band = (width - padL - 8) / data.length;
  const bw = Math.min(44, band * 0.62);
  return (
    <div ref={ref} className="relative">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-mute">{title}</div>
      <svg width={width} height={height} role="img" aria-label={title}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? t.axis : t.grid} />
            <text x={padL - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill={t.mute} style={tabular}>
              {format(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const top = y(Math.max(0, d.value));
          const h = Math.max(1, Math.abs(y(d.value) - y(0)));
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + band * i} y={padT} width={band} height={height - padT - padB} fill="transparent" />
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={h}
                rx={4}
                fill={d.estimate ? 'rgba(37,99,235,0.18)' : hover === i ? t.barHover : t.bar}
                stroke={d.estimate ? t.barHover : 'none'}
                strokeWidth={1.5}
                strokeDasharray={d.estimate ? '4 3' : undefined}
                style={{ transition: 'y 300ms, height 300ms' }}
              />
              <text x={cx} y={height - 9} textAnchor="middle" fontSize={10.5} fill={d.estimate ? t.sub : t.mute}>
                {d.label}
              </text>
              {hover === i && (
                <text x={cx} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={t.text} style={tabular}>
                  {format(d.value)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- Waterfall */

export interface Step {
  label: string;
  value: number;
  kind: 'add' | 'sub' | 'total';
}

export function Waterfall({ steps, format, height = 260 }: { steps: Step[]; format: (v: number) => string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const padB = 40;
  const padT = 24;
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
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)));
  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (height - padT - padB);
  const band = width / bars.length;
  const bw = Math.min(72, band * 0.6);
  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Enterprise value to equity value bridge">
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke={t.axis} />
        {bars.map((b, i) => {
          const cx = band * i + band / 2;
          const top = y(Math.max(b.from, b.to));
          const h = Math.max(2, Math.abs(y(b.from) - y(b.to)));
          const fill = b.kind === 'total' ? t.bar : b.kind === 'add' ? t.up : t.down;
          return (
            <g key={b.label}>
              {i > 0 && (
                <line x1={band * (i - 1) + band / 2 + bw / 2} x2={cx - bw / 2} y1={y(b.from)} y2={y(b.from)} stroke={t.mute} strokeDasharray="3 3" />
              )}
              <rect x={cx - bw / 2} y={top} width={bw} height={h} rx={4} fill={fill} opacity={b.kind === 'total' ? 1 : 0.85} style={{ transition: 'y 300ms, height 300ms' }} />
              <text x={cx} y={top - 7} textAnchor="middle" fontSize={11} fontWeight={600} fill={t.text} style={tabular}>
                {b.kind === 'sub' ? `(${format(b.value)})` : format(b.value)}
              </text>
              <text x={cx} y={height - 22} textAnchor="middle" fontSize={10.5} fill={t.sub}>
                {b.label.split('\n')[0]}
              </text>
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={10.5} fill={t.mute}>
                {b.label.split('\n')[1] ?? ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------- Dot strip */

/** Peer multiples on one axis, target's own multiple marked. */
export function DotStrip({ points, target, targetLabel, p25, median, p75 }: { points: { label: string; value: number }[]; target: number; targetLabel: string; p25: number; median: number; p75: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [hover, setHover] = useState<string | null>(null);
  const height = 120;
  const pad = 28;
  const vals = [...points.map((p) => p.value), target];
  const ticks = niceTicks(0, Math.max(...vals) * 1.08, 6);
  const lo = 0;
  const hi = Math.max(ticks[ticks.length - 1], Math.max(...vals) * 1.08);
  const x = (v: number) => pad + ((v - lo) / (hi - lo || 1)) * (width - 2 * pad);
  const cy = 58;
  return (
    <div ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Peer EV/EBITDA multiples">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={22} y2={cy + 26} stroke={t.grid} />
            <text x={x(v)} y={height - 8} textAnchor="middle" fontSize={10.5} fill={t.mute} style={tabular}>
              {+v.toFixed(1)}x
            </text>
          </g>
        ))}
        <rect x={x(p25)} y={cy - 14} width={Math.max(2, x(p75) - x(p25))} height={28} rx={6} fill="rgba(37,99,235,0.16)" />
        <line x1={x(median)} x2={x(median)} y1={cy - 16} y2={cy + 16} stroke={t.barHover} strokeWidth={2} />
        <line x1={x(target)} x2={x(target)} y1={16} y2={cy + 26} stroke={t.mark} strokeWidth={2} strokeDasharray="5 4" />
        <text x={x(target)} y={11} textAnchor="middle" fontSize={11} fontWeight={700} fill={t.mark}>
          {targetLabel} {target.toFixed(1)}x
        </text>
        {[...points].sort((p, q) => p.value - q.value).map((p, i) => (
          <g key={p.label} onMouseEnter={() => setHover(p.label)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(p.value)} cy={cy} r={hover === p.label ? 8 : 6.5} fill={t.bar} stroke="#0D121A" strokeWidth={2} />
            {(hover === p.label || points.length <= 8) && (
              <text x={x(p.value)} y={cy + (hover === p.label || i % 2 ? -14 : 24)} textAnchor="middle" fontSize={10.5} fill={hover === p.label ? t.text : t.sub}>
                {p.label}
                {hover === p.label ? ` ${p.value.toFixed(1)}x` : ''}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
