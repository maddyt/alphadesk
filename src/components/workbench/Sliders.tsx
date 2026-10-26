'use client';

import type { AssumptionKey, Assumptions, SliderRange } from '@/lib/engine/model';

type Fmt = 'pct' | 'x';

const GROUPS: { title: string; hint: string; items: { key: AssumptionKey; label: string; fmt: Fmt }[] }[] = [
  {
    title: 'DCF',
    hint: 'Moves the DCF bar',
    items: [
      { key: 'wacc', label: 'WACC', fmt: 'pct' },
      { key: 'terminalGrowth', label: 'Perpetuity growth', fmt: 'pct' },
      { key: 'exitMultiple', label: 'Exit EV/EBITDA', fmt: 'x' },
    ],
  },
  {
    title: 'Operating case',
    hint: 'DCF and LBO cash flows',
    items: [
      { key: 'revenueGrowth', label: 'Revenue growth (Y1)', fmt: 'pct' },
      { key: 'ebitMargin', label: 'EBIT margin', fmt: 'pct' },
      { key: 'taxRate', label: 'Tax rate', fmt: 'pct' },
    ],
  },
  {
    title: 'Transaction',
    hint: 'Precedents and LBO floor',
    items: [
      { key: 'controlPremium', label: 'Control premium', fmt: 'pct' },
      { key: 'lboLeverage', label: 'LBO leverage (Debt/EBITDA)', fmt: 'x' },
      { key: 'lboTargetIrr', label: 'Sponsor target IRR', fmt: 'pct' },
      { key: 'lboInterestRate', label: 'Cost of LBO debt', fmt: 'pct' },
    ],
  },
];

function show(v: number, fmt: Fmt) {
  return fmt === 'pct' ? `${(v * 100).toFixed(2).replace(/\.?0+$/, '')}%` : `${v.toFixed(2).replace(/\.?0+$/, '')}x`;
}

export function Sliders({
  a,
  defaults,
  ranges,
  onChange,
  onReset,
}: {
  a: Assumptions;
  defaults: Assumptions;
  ranges: Record<AssumptionKey, SliderRange>;
  onChange: (k: AssumptionKey, v: number) => void;
  onReset: () => void;
}) {
  const changed = (Object.keys(a) as AssumptionKey[]).some((k) => Math.abs(a[k] - defaults[k]) > 1e-9);
  return (
    <div className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">{g.title}</h4>
            <span className="text-[10.5px] text-mute">{g.hint}</span>
          </div>
          <div className="space-y-4">
            {g.items.map(({ key, label, fmt }) => {
              const r = ranges[key];
              const v = a[key];
              const fill = ((v - r.min) / (r.max - r.min)) * 100;
              const moved = Math.abs(v - defaults[key]) > 1e-9;
              return (
                <label key={key} className="block">
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="text-sub">{label}</span>
                    <span className="flex items-center gap-2">
                      {moved && (
                        <button
                          type="button"
                          className="text-[10.5px] text-mute hover:text-ink"
                          title={`Reset to ${show(defaults[key], fmt)}`}
                          onClick={(e) => {
                            e.preventDefault();
                            onChange(key, defaults[key]);
                          }}
                        >
                          ↺ {show(defaults[key], fmt)}
                        </button>
                      )}
                      <span className={`num rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold ${moved ? 'bg-brand/15 text-[#8DB4FF]' : 'text-ink'}`}>{show(v, fmt)}</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={v}
                    aria-label={label}
                    style={{ ['--fill' as string]: `${fill}%` }}
                    onChange={(e) => onChange(key, Number(e.target.value))}
                  />
                  <div className="num -mt-0.5 flex justify-between text-[10px] text-mute">
                    <span>{show(r.min, fmt)}</span>
                    <span>{show(r.max, fmt)}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={!changed}
        onClick={onReset}
        className="w-full rounded-lg border border-line py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink disabled:opacity-40"
      >
        Reset to base case
      </button>
    </div>
  );
}
