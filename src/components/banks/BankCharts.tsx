'use client';

import { useState } from 'react';
import { DARK, niceTicks, type ChartTheme } from '../charts/theme';
import type { CapitalStack, Ddm, Regression, Stress } from '@/lib/banks/engine';
import { money, mult, pct, price } from '@/lib/format';

// BankVal SVG charts. Colours come from an explicit theme so the same charts render
// in the dark workbench and on the light, printable one-page summary.

const AMBER = '#F59E0B';

// ------------------------------------------------------------------ P/TBV vs ROATCE

export function ScatterSvg({
  reg,
  roatce,
  theme = DARK,
  width = 720,
  height = 420,
  onToggle,
  interactive = true,
}: {
  reg: Regression;
  roatce: number;
  theme?: ChartTheme;
  width?: number;
  height?: number;
  onToggle?: (ticker: string) => void;
  interactive?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const pad = { l: 52, r: 18, t: 16, b: 42 };
  const pts = reg.points;
  const xsAll = [...pts.map((p) => p.x), roatce];
  const xLo = Math.min(0, ...xsAll) - 0.02;
  const xHi = Math.max(...xsAll) + 0.02;
  const yHi = Math.max(1, ...pts.map((p) => p.y), reg.impliedPtbv) * 1.12;
  const X = (x: number) => pad.l + ((x - xLo) / (xHi - xLo)) * (width - pad.l - pad.r);
  const Y = (y: number) => pad.t + (1 - y / yHi) * (height - pad.t - pad.b);
  const { alpha, beta } = reg.fit;
  const line = (x: number) => alpha + beta * x;
  const xT = niceTicks(xLo, xHi, 6);
  const yT = niceTicks(0, yHi, 5);
  const band = reg.band;
  const fitted = Number.isFinite(alpha) && Number.isFinite(beta);
  const h = pts.find((p) => p.ticker === hover);
  // Greedy label placement: target first, then each peer tries right, left, above, below
  // and drops its label (dot stays, tooltip still works) if every spot collides.
  const placed: { x: number; y: number; w: number; h: number }[] = pts.map((p) => ({ x: X(p.x) - 6, y: Y(p.y) - 6, w: 12, h: 12 }));
  const labels = new Map<string, { x: number; y: number; anchor: 'start' | 'end' | 'middle' }>();
  const hit = (b: { x: number; y: number; w: number; h: number }) => placed.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  for (const p of [...pts].sort((x, y) => Number(y.isTarget) - Number(x.isTarget))) {
    const fs = p.isTarget ? 12 : 10.5;
    const w = p.ticker.length * fs * 0.62;
    const r = (p.isTarget ? 8 : 6) + 3;
    const cx = X(p.x);
    const cy = Y(p.y);
    const options = [
      { x: cx + r, y: cy - fs / 2, anchor: 'start' as const, tx: cx + r, ty: cy + fs * 0.35 },
      { x: cx - r - w, y: cy - fs / 2, anchor: 'end' as const, tx: cx - r, ty: cy + fs * 0.35 },
      { x: cx - w / 2, y: cy - r - fs, anchor: 'middle' as const, tx: cx, ty: cy - r - 2 },
      { x: cx - w / 2, y: cy + r, anchor: 'middle' as const, tx: cx, ty: cy + r + fs * 0.8 },
    ];
    const pick = options.find((o) => o.x > pad.l && o.x + w < width - pad.r + 10 && !hit({ x: o.x, y: o.y, w, h: fs }));
    if (pick || p.isTarget) {
      const o = pick ?? options[0];
      placed.push({ x: o.x, y: o.y, w, h: fs });
      labels.set(p.ticker, { x: o.tx, y: o.ty, anchor: o.anchor });
    }
  }
  const color = (p: (typeof pts)[number]) => (p.isTarget ? AMBER : !p.included ? theme.mute : p.flag === 'premium' ? theme.down : p.flag === 'discount' ? theme.up : theme.bar);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Price to tangible book versus ROATCE regression">
        {yT.map((y) => (
          <g key={`y${y}`}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(y)} y2={Y(y)} stroke={theme.grid} />
            <text x={pad.l - 8} y={Y(y) + 3.5} textAnchor="end" fontSize={10.5} fill={theme.mute} className="num">
              {y.toFixed(1)}x
            </text>
          </g>
        ))}
        {xT.map((x) => (
          <g key={`x${x}`}>
            <line x1={X(x)} x2={X(x)} y1={pad.t} y2={height - pad.b} stroke={theme.grid} />
            <text x={X(x)} y={height - pad.b + 15} textAnchor="middle" fontSize={10.5} fill={theme.mute} className="num">
              {(x * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <text x={(pad.l + width - pad.r) / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={theme.sub}>
          ROATCE (return on average tangible common equity)
        </text>
        <text x={13} y={(pad.t + height - pad.b) / 2} textAnchor="middle" fontSize={11} fill={theme.sub} transform={`rotate(-90 13 ${(pad.t + height - pad.b) / 2})`}>
          Price / tangible book
        </text>
        {fitted && (
          <>
            {/* Fair-value band: within it, a bank trades in line with its returns. */}
            <path
              d={`M${X(xLo)},${Y(Math.max(0, line(xLo) + band))} L${X(xHi)},${Y(Math.max(0, line(xHi) + band))} L${X(xHi)},${Y(Math.max(0, line(xHi) - band))} L${X(xLo)},${Y(Math.max(0, line(xLo) - band))} Z`}
              fill={theme.bar}
              opacity={0.08}
            />
            <line x1={X(xLo)} x2={X(xHi)} y1={Y(Math.max(0, line(xLo)))} y2={Y(Math.max(0, line(xHi)))} stroke={theme.bar} strokeWidth={2} />
            {/* Reading the line at the ROATCE slider. */}
            <line x1={X(roatce)} x2={X(roatce)} y1={pad.t} y2={height - pad.b} stroke={AMBER} strokeDasharray="4 4" opacity={0.7} />
            <line x1={pad.l} x2={X(roatce)} y1={Y(reg.impliedPtbv)} y2={Y(reg.impliedPtbv)} stroke={AMBER} strokeDasharray="4 4" opacity={0.7} />
            <path d={`M${X(roatce)},${Y(reg.impliedPtbv) - 7} l7,7 l-7,7 l-7,-7 Z`} fill={AMBER} />
            <text x={pad.l + 4} y={Y(reg.impliedPtbv) - 5} fontSize={10.5} fill={AMBER} fontWeight={600} className="num">
              implied {mult(reg.impliedPtbv, 2)}
            </text>
          </>
        )}
        {pts.map((p) => {
          const r = p.isTarget ? 8 : 6;
          const c = color(p);
          return (
            <g
              key={p.ticker}
              onMouseEnter={() => interactive && setHover(p.ticker)}
              onMouseLeave={() => interactive && setHover(null)}
              onClick={() => interactive && !p.isTarget && onToggle?.(p.ticker)}
              className={interactive && !p.isTarget && onToggle ? 'cursor-pointer' : undefined}
            >
              <circle cx={X(p.x)} cy={Y(p.y)} r={r + 6} fill="transparent" />
              <circle cx={X(p.x)} cy={Y(p.y)} r={r} fill={p.included || p.isTarget ? c : 'transparent'} stroke={c} strokeWidth={p.included || p.isTarget ? 0 : 1.5} opacity={hover && hover !== p.ticker ? 0.45 : 1} />
              {labels.has(p.ticker) && (
                <text x={labels.get(p.ticker)!.x} y={labels.get(p.ticker)!.y} textAnchor={labels.get(p.ticker)!.anchor} fontSize={p.isTarget ? 12 : 10.5} fontWeight={p.isTarget ? 700 : 500} fill={p.isTarget ? AMBER : theme.sub}>
                  {p.ticker}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 rounded-xl border border-line bg-panel/95 px-3 py-2 text-[11.5px] shadow-xl backdrop-blur"
          style={{ left: `${(X(h.x) / width) * 100}%`, top: `calc(${(Y(h.y) / height) * 100}% + 14px)` }}
        >
          <div className="font-semibold text-ink">{h.name}</div>
          <div className="num text-[10.5px] text-mute">
            {h.ticker} · CIK {h.cik}
          </div>
          <div className="num mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sub">
            <span>ROATCE</span>
            <span className="text-right text-ink">{pct(h.x)}</span>
            <span>P/TBV</span>
            <span className="text-right text-ink">{mult(h.y, 2)}</span>
            <span>Line says</span>
            <span className="text-right">{mult(h.fitted, 2)}</span>
            <span>Residual</span>
            <span className={`text-right font-semibold ${h.residual > 0 ? 'text-down' : 'text-up'}`}>
              {h.residual > 0 ? '+' : ''}
              {h.residual.toFixed(2)}x
            </span>
          </div>
          <div className="mt-1.5 text-[10.5px] text-mute">
            {h.isTarget ? 'Target bank (not in the fit)' : h.flag === 'premium' ? 'Premium to its returns (rich)' : h.flag === 'discount' ? 'Discount to its returns (cheap)' : 'In line with its returns'}
            {!h.isTarget && onToggle ? ` · click to ${h.included ? 'exclude' : 'include'}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ DDM

export function DividendBars({ d, theme = DARK, width = 640, height = 220 }: { d: Ddm; theme?: ChartTheme; width?: number; height?: number }) {
  const pad = { l: 56, r: 10, t: 14, b: 30 };
  const vals = d.years.map((y) => y.dividend);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals) * 1.15 || 1;
  const Y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const bw = (width - pad.l - pad.r) / d.years.length;
  const ticks = niceTicks(lo, hi, 4);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Dividend capacity by year">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? theme.axis : theme.grid} />
          <text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize={10} fill={theme.mute} className="num">
            {money(t, 0)}
          </text>
        </g>
      ))}
      {d.years.map((y, k) => {
        const x = pad.l + k * bw + bw * 0.18;
        const neg = y.dividend < 0;
        return (
          <g key={y.t}>
            <rect x={x} width={bw * 0.64} y={Math.min(Y(y.dividend), Y(0))} height={Math.max(1, Math.abs(Y(y.dividend) - Y(0)))} rx={3} fill={neg ? theme.down : y.stage === 1 ? theme.bar : theme.mark} opacity={0.9}>
              <title>{`Year ${y.t}: ${neg ? 'capital raise' : 'dividend capacity'} ${money(Math.abs(y.dividend))} (PV ${money(y.pv)})`}</title>
            </rect>
            <text x={x + bw * 0.32} y={height - pad.b + 14} textAnchor="middle" fontSize={10} fill={theme.sub}>
              Y{y.t}
            </text>
          </g>
        );
      })}
      <text x={pad.l + 2.5 * bw} y={height - 4} textAnchor="middle" fontSize={9.5} fill={theme.mute}>
        Stage 1 · loan growth
      </text>
      <text x={pad.l + 7.5 * bw} y={height - 4} textAnchor="middle" fontSize={9.5} fill={theme.mute}>
        Stage 2 · fade to terminal
      </text>
    </svg>
  );
}

/** Value build per share: PV stage 1 + PV stage 2 + PV terminal = DDM value, against the share price. */
export function ValueBuild({ d, sharePrice, shares, theme = DARK, width = 640, height = 190 }: { d: Ddm; sharePrice: number; shares: number; theme?: ChartTheme; width?: number; height?: number }) {
  const parts = [
    { label: 'Stage 1 dividends', v: d.pvStage1 / shares, c: theme.bar },
    { label: 'Stage 2 dividends', v: d.pvStage2 / shares, c: theme.mark },
    { label: 'Terminal value', v: d.pvTerminal / shares, c: '#8B5CF6' },
  ];
  const total = d.perShare;
  const pad = { l: 130, r: 70, t: 8, b: 8 };
  const rows = parts.length + 2;
  const rh = (height - pad.t - pad.b) / rows;
  const lo = Math.min(0, ...parts.map((p) => p.v), total);
  const hi = Math.max(total, sharePrice, parts.reduce((s, p) => s + Math.max(0, p.v), 0)) * 1.05;
  const X = (v: number) => pad.l + ((v - lo) / (hi - lo || 1)) * (width - pad.l - pad.r);
  let run = 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="DDM value build per share">
      {parts.map((p, k) => {
        const from = run;
        run += p.v;
        const y = pad.t + k * rh;
        return (
          <g key={p.label}>
            <text x={pad.l - 8} y={y + rh / 2 + 4} textAnchor="end" fontSize={11} fill={theme.sub}>
              {p.label}
            </text>
            <rect x={Math.min(X(from), X(run))} width={Math.max(1, Math.abs(X(run) - X(from)))} y={y + rh * 0.2} height={rh * 0.6} rx={3} fill={p.c} />
            <text x={Math.max(X(from), X(run)) + 6} y={y + rh / 2 + 4} fontSize={11} fill={theme.text} className="num">
              {price(p.v)}
            </text>
          </g>
        );
      })}
      {[
        { label: 'DDM value / share', v: total, c: AMBER, bold: true },
        { label: 'Share price today', v: sharePrice, c: theme.whisker, bold: false },
      ].map((r, k) => {
        const y = pad.t + (parts.length + k) * rh;
        return (
          <g key={r.label}>
            <text x={pad.l - 8} y={y + rh / 2 + 4} textAnchor="end" fontSize={11} fontWeight={r.bold ? 700 : 400} fill={r.bold ? theme.text : theme.sub}>
              {r.label}
            </text>
            <rect x={Math.min(X(0), X(r.v))} width={Math.max(1, Math.abs(X(r.v) - X(0)))} y={y + rh * 0.2} height={rh * 0.6} rx={3} fill={r.c} />
            <text x={Math.max(X(0), X(r.v)) + 6} y={y + rh / 2 + 4} fontSize={11} fontWeight={r.bold ? 700 : 400} fill={theme.text} className="num">
              {price(r.v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ Basel capital stack

export function CapitalGauge({ s, target, after, theme = DARK, width = 640, height = 150 }: { s: CapitalStack; target: number; after?: number; theme?: ChartTheme; width?: number; height?: number }) {
  const pad = { l: 16, r: 16, t: 22, b: 52 };
  const max = Math.max(0.2, s.cet1 + s.at1 + s.t2 + 0.02);
  const X = (r: number) => pad.l + (r / max) * (width - pad.l - pad.r);
  const y = pad.t;
  const bh = height - pad.t - pad.b;
  const segs = [
    { label: 'CET1', v: s.cet1, c: theme.mark },
    { label: 'AT1', v: s.at1, c: theme.bar },
    { label: 'Tier 2', v: s.t2, c: '#8B5CF6' },
  ];
  let acc = 0;
  const marks = [
    { v: s.requirement.cet1, label: `CET1 min ${pct(s.requirement.cet1)}`, c: theme.down },
    { v: s.requirement.tier1, label: `Tier 1 min ${pct(s.requirement.tier1)}`, c: theme.down },
    { v: s.requirement.total, label: `Total min ${pct(s.requirement.total)}`, c: theme.down },
  ];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Basel III capital stack">
      <rect x={X(0)} y={y} width={X(max) - X(0)} height={bh} rx={6} fill={theme.neutral} />
      {segs.map((sg) => {
        const from = acc;
        acc += sg.v;
        return (
          <g key={sg.label}>
            <rect x={X(from)} y={y} width={Math.max(0, X(acc) - X(from))} height={bh} fill={sg.c} opacity={0.9} />
            {X(acc) - X(from) > 44 && (
              <text x={(X(from) + X(acc)) / 2} y={y + bh / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff" className="num">
                {sg.label} {pct(sg.v)}
              </text>
            )}
          </g>
        );
      })}
      {marks.map((m, k) => (
        <g key={m.label}>
          <line x1={X(m.v)} x2={X(m.v)} y1={y - 4} y2={y + bh + 4} stroke={m.c} strokeWidth={1.5} />
          <line x1={X(m.v)} x2={X(m.v)} y1={y + bh + 4} y2={y + bh + 4 + k * 11} stroke={m.c} strokeWidth={0.75} opacity={0.6} />
          <text x={X(m.v) + 3} y={y + bh + 12 + k * 11} textAnchor="start" fontSize={9.5} fill={m.c}>
            {m.label}
          </text>
        </g>
      ))}
      <line x1={X(target)} x2={X(target)} y1={y - 4} y2={y + bh + 38} stroke={AMBER} strokeWidth={2} strokeDasharray="4 3" />
      <text x={X(target) + 3} y={y + bh + 46} textAnchor="start" fontSize={10} fontWeight={600} fill={AMBER}>
        Target CET1 {pct(target)}
      </text>
      {after !== undefined && Number.isFinite(after) && (
        <g>
          <line x1={X(Math.max(0, after))} x2={X(Math.max(0, after))} y1={y} y2={y + bh} stroke="#fff" strokeWidth={2} />
          <text x={X(Math.max(0, after))} y={y - 7} textAnchor="middle" fontSize={10} fontWeight={600} fill={theme.text}>
            after stress {pct(after)}
          </text>
        </g>
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ Stress: deposit run waterfall

export function LiquidityBars({ s, theme = DARK, width = 640, height = 170 }: { s: Stress; theme?: ChartTheme; width?: number; height?: number }) {
  const pad = { l: 150, r: 80, t: 6, b: 6 };
  const rows = [
    { label: 'Deposit outflow', v: s.outflow, c: theme.down },
    ...s.sources.map((x, k) => ({ label: x.label, v: x.used, avail: x.available, c: [theme.mark, theme.bar, '#8B5CF6'][k] })),
    { label: 'Shortfall (borrow)', v: s.shortfall, c: s.shortfall > 0 ? theme.down : theme.mute },
  ];
  const max = Math.max(s.outflow, ...s.sources.map((x) => x.available)) || 1;
  const rh = (height - pad.t - pad.b) / rows.length;
  const X = (v: number) => pad.l + (v / max) * (width - pad.l - pad.r);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Deposit run liquidity waterfall">
      {rows.map((r, k) => {
        const y = pad.t + k * rh;
        const avail = 'avail' in r ? (r.avail as number) : undefined;
        return (
          <g key={r.label}>
            <text x={pad.l - 8} y={y + rh / 2 + 4} textAnchor="end" fontSize={11} fill={theme.sub}>
              {r.label}
            </text>
            {avail !== undefined && <rect x={X(0)} y={y + rh * 0.2} width={Math.max(0, X(avail) - X(0))} height={rh * 0.6} rx={3} fill={r.c} opacity={0.18} />}
            <rect x={X(0)} y={y + rh * 0.2} width={Math.max(r.v > 0 ? 1 : 0, X(r.v) - X(0))} height={rh * 0.6} rx={3} fill={r.c} />
            <text x={Math.max(X(r.v), avail !== undefined ? X(avail) : 0) + 6} y={y + rh / 2 + 4} fontSize={11} fill={theme.text} className="num">
              {money(r.v)}
              {avail !== undefined ? ` of ${money(avail)}` : ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
