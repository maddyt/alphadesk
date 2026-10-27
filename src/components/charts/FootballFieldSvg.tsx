// The football field itself: pure SVG, no hooks, so it renders on the server for
// the tear sheet and inside the interactive client wrapper alike.

import type { MethodRange } from '@/lib/engine/valuation';
import type { ChartTheme } from './theme';
import { niceTicks } from './theme';

export interface FieldRow {
  range: MethodRange;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

export interface FootballFieldSvgProps {
  id?: string;
  rows: FieldRow[];
  current: number;
  currentLabel: string;
  composite?: number;
  width: number;
  theme: ChartTheme;
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  hovered?: number | null;
  animate?: boolean;
  compact?: boolean;
  rowHeight?: number;
}

export const ROW_H = 58;
const DEFAULT_ROW_H = ROW_H;
export const TOP = 54;
export const BOTTOM = 40;

export function fieldLayout(width: number, rows: FieldRow[], current: number, compact = false, rowH = ROW_H) {
  const labelW = compact || width < 640 ? 118 : 232;
  const x0 = labelW + (width < 640 ? 46 : 64);
  const x1 = width - (width < 640 ? 46 : 70);
  const values = rows.flatMap((r) => [r.min, r.max]).concat(current);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo) * 0.04 || Math.abs(hi) * 0.1 || 1;
  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, width < 640 ? 4 : 7);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);
  const sx = (v: number) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
  const height = TOP + rows.length * rowH + BOTTOM;
  return { labelW, x0, x1, lo, hi, ticks, sx, height };
}

const SHORT: Record<string, string> = {
  '52-Week Range': '52-Week Range',
  'Public Comps (EV/EBITDA & EV/Revenue)': 'Trading Comps',
  'Precedent Transactions': 'Precedents',
  'Discounted Cash Flow': 'DCF',
  'LBO Floor Valuation': 'LBO Floor',
  'Sum-of-the-Parts': 'SOTP',
};

const WIDE: Record<string, string> = {
  'Public Comps (EV/EBITDA & EV/Revenue)': 'Public Comps',
};

const SUB: Record<string, string> = {
  '52-Week Range': 'Where the stock traded this year',
  'Public Comps (EV/EBITDA & EV/Revenue)': 'Peers’ EV/EBITDA & EV/Revenue',
  'Precedent Transactions': 'What a takeover buyer might pay',
  'Discounted Cash Flow': 'Value of its future cash',
  'LBO Floor Valuation': 'What a buyout fund could pay',
  'Sum-of-the-Parts': 'Each business valued separately',
};

export function FootballFieldSvg(p: FootballFieldSvgProps) {
  const { rows, current, width, theme: t, format, axisFormat, hovered = null, animate = true, compact = false } = p;
  const ROW_H = p.rowHeight ?? DEFAULT_ROW_H;
  const L = fieldLayout(width, rows, current, compact, ROW_H);
  const narrow = compact || width < 640;
  const cx = L.sx(current);
  const barH = 22;

  return (
    <svg
      id={p.id}
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={L.height}
      viewBox={`0 0 ${width} ${L.height}`}
      className={animate ? 'ff-anim' : undefined}
      role="img"
      aria-label={`Valuation football field. ${rows
        .map((r) => `${r.range.methodology}: ${format(r.min)} to ${format(r.max)}, median ${format(r.median)}`)
        .join('. ')}. ${p.currentLabel}: ${format(current)}.`}
      style={{ fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif', display: 'block' }}
    >
      <defs>
        <linearGradient id="ff-iqr" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={t.barHover} />
          <stop offset="100%" stopColor={t.bar} />
        </linearGradient>
      </defs>

      {/* Row bands */}
      {rows.map((r, i) => (
        <rect
          key={`band-${r.range.methodology}`}
          x={0}
          y={TOP + i * ROW_H}
          width={width}
          height={ROW_H}
          fill={hovered === i ? t.rowHover : i % 2 ? t.rowAlt : 'transparent'}
          style={{ transition: 'fill 150ms' }}
        />
      ))}

      {/* Grid + axis ticks (top and bottom) */}
      {L.ticks.map((v) => (
        <g key={`tick-${v}`}>
          <line x1={L.sx(v)} x2={L.sx(v)} y1={TOP - 6} y2={TOP + rows.length * ROW_H} stroke={t.grid} strokeWidth={1} />
          <text x={L.sx(v)} y={TOP + rows.length * ROW_H + 22} textAnchor="middle" fontSize={11} fill={t.mute} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {axisFormat(v)}
          </text>
        </g>
      ))}
      <line x1={L.x0 - 8} x2={L.x1 + 8} y1={TOP + rows.length * ROW_H} y2={TOP + rows.length * ROW_H} stroke={t.axis} strokeWidth={1} />

      {/* Methodology bars */}
      {rows.map((r, i) => {
        const yMid = TOP + i * ROW_H + ROW_H / 2;
        const xMin = L.sx(r.min);
        const xMax = L.sx(r.max);
        const x25 = L.sx(r.p25);
        const x75 = L.sx(r.p75);
        const xMed = L.sx(r.median);
        const active = hovered === i;
        return (
          <g key={r.range.methodology}>
            <text x={16} y={yMid - (narrow ? 0 : 5)} fontSize={narrow ? 12 : 13.5} fontWeight={600} fill={t.text} dominantBaseline={narrow ? 'middle' : 'auto'}>
              {narrow ? SHORT[r.range.methodology] : (WIDE[r.range.methodology] ?? r.range.methodology)}
            </text>
            {!narrow && (
              <text x={16} y={yMid + 13} fontSize={11} fill={t.mute}>
                {SUB[r.range.methodology]}
              </text>
            )}
            <g
              style={
                animate
                  ? { transformBox: 'fill-box', transformOrigin: 'center', animation: `grow 900ms cubic-bezier(.2,.8,.2,1) ${120 + i * 90}ms both` }
                  : undefined
              }
            >
              {/* Whiskers to min / max */}
              <line x1={xMin} x2={xMax} y1={yMid} y2={yMid} stroke={t.whisker} strokeWidth={2} />
              <line x1={xMin} x2={xMin} y1={yMid - 8} y2={yMid + 8} stroke={t.whisker} strokeWidth={2} />
              <line x1={xMax} x2={xMax} y1={yMid - 8} y2={yMid + 8} stroke={t.whisker} strokeWidth={2} />
              {/* Interquartile bar */}
              <rect
                x={Math.min(x25, x75)}
                y={yMid - barH / 2}
                width={Math.max(3, Math.abs(x75 - x25))}
                height={barH}
                rx={4}
                fill={active ? t.barHover : 'url(#ff-iqr)'}
                stroke={active ? t.text : 'none'}
                strokeOpacity={0.5}
              />
              {/* Median tick */}
              <line x1={xMed} x2={xMed} y1={yMid - barH / 2 + 3} y2={yMid + barH / 2 - 3} stroke={t.median} strokeWidth={2} strokeLinecap="round" />
            </g>
            <text x={xMin - 8} y={yMid} textAnchor="end" dominantBaseline="middle" fontSize={11.5} fill={t.sub} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(r.min)}
            </text>
            <text x={xMax + 8} y={yMid} textAnchor="start" dominantBaseline="middle" fontSize={11.5} fill={t.sub} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(r.max)}
            </text>
          </g>
        );
      })}

      {/* Composite median marker */}
      {p.composite !== undefined && Number.isFinite(p.composite) && (
        <line
          x1={L.sx(p.composite)}
          x2={L.sx(p.composite)}
          y1={TOP}
          y2={TOP + rows.length * ROW_H}
          stroke={t.composite}
          strokeWidth={1.5}
          strokeDasharray="2 4"
          opacity={0.9}
        />
      )}

      {/* Current market EV marker (PRD: dashed #10B981) */}
      <line x1={cx} x2={cx} y1={TOP - 10} y2={TOP + rows.length * ROW_H + 4} stroke={t.mark} strokeWidth={2} strokeDasharray="6 4" />
      <g transform={`translate(${Math.min(Math.max(cx, 90), width - 90)}, ${TOP - 26})`}>
        <rect x={-84} y={-12} width={168} height={24} rx={12} fill={t.mark} />
        <text x={0} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={11.5} fontWeight={700} fill={t.markInk} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {p.currentLabel} {format(current)}
        </text>
      </g>
    </svg>
  );
}
