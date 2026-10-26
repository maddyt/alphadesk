'use client';

import { useState } from 'react';
import { FootballFieldSvg, ROW_H, TOP, fieldLayout, type FieldRow } from './FootballFieldSvg';
import { DARK } from './theme';
import { useWidth } from './useWidth';

interface Props {
  rows: FieldRow[];
  current: number;
  currentLabel: string;
  composite?: number;
  format: (v: number) => string;
  axisFormat: (v: number) => string;
  /** Secondary unit shown in the tooltip (per-share when the axis is EV, and vice versa). */
  alt: (row: FieldRow, v: number) => string;
  altLabel: string;
  onSelect?: (methodology: string) => void;
}

export function FootballField(p: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState(0);
  const L = fieldLayout(width, p.rows, p.current);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - box.top - TOP;
    const i = Math.floor(y / ROW_H);
    setHover(y >= 0 && i < p.rows.length ? i : null);
    setMouseX(e.clientX - box.left);
  }

  const row = hover !== null ? p.rows[hover] : null;
  const vsCurrent = (v: number) => {
    const d = v / p.current - 1;
    return { text: `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`, cls: d >= 0 ? 'text-up' : 'text-down' };
  };

  return (
    <div ref={ref} className="relative select-none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => row && p.onSelect?.(row.range.methodology)}>
      <FootballFieldSvg
        id="football-field"
        rows={p.rows}
        current={p.current}
        currentLabel={p.currentLabel}
        composite={p.composite}
        width={width}
        theme={DARK}
        format={p.format}
        axisFormat={p.axisFormat}
        hovered={hover}
      />
      {row && hover !== null && (
        <div
          className="pointer-events-none absolute z-20 w-[300px] rounded-xl border border-line bg-raised/95 p-3.5 text-xs shadow-2xl backdrop-blur"
          style={{
            left: Math.min(Math.max(mouseX + 16, 8), width - 312),
            top: TOP + (hover + 1) * ROW_H + 4 > L.height - 160 ? TOP + hover * ROW_H - 170 : TOP + (hover + 1) * ROW_H - 6,
          }}
        >
          <div className="mb-1 font-semibold text-ink">{row.range.methodology}</div>
          <div className="mb-2.5 leading-snug text-mute">{row.range.basis}</div>
          <table className="num w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-mute">
                <th className="pb-1 text-left font-medium" />
                <th className="pb-1 text-right font-medium">Value</th>
                <th className="pb-1 text-right font-medium">{p.altLabel}</th>
                <th className="pb-1 text-right font-medium">vs mkt</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Max', row.max],
                  ['75th', row.p75],
                  ['Median', row.median],
                  ['25th', row.p25],
                  ['Min', row.min],
                ] as const
              ).map(([k, v]) => {
                const d = vsCurrent(v);
                return (
                  <tr key={k} className={k === 'Median' ? 'font-semibold text-ink' : 'text-sub'}>
                    <td className="py-0.5 font-sans">{k}</td>
                    <td className="py-0.5 text-right">{p.format(v)}</td>
                    <td className="py-0.5 text-right">{p.alt(row, v)}</td>
                    <td className={`py-0.5 text-right ${d.cls}`}>{d.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {row.range.detail.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
              {row.range.detail.map((d) => (
                <span key={d.label} className="rounded-md bg-panel px-1.5 py-0.5 text-[11px] text-sub">
                  {d.label} <span className="num text-ink">{d.value}</span>
                </span>
              ))}
            </div>
          )}
          {p.onSelect && <div className="mt-2 text-[10px] text-mute">Click for the full build</div>}
        </div>
      )}
    </div>
  );
}
