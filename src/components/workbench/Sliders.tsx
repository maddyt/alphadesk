'use client';

import type { AssumptionKey, Assumptions, SliderRange } from '@/lib/engine/model';

type Fmt = 'pct' | 'x';

interface Item {
  key: AssumptionKey;
  label: string;
  term: string;
  help: string;
  fmt: Fmt;
}

// Plain-English label first, banker term second, and one line on which way it pushes value.
const GROUPS: { title: string; hint: string; items: Item[] }[] = [
  {
    title: 'Cash-flow valuation',
    hint: 'moves the DCF bar',
    items: [
      { key: 'wacc', label: 'Required return', term: 'WACC', fmt: 'pct', help: 'The yearly return investors demand. Higher → future cash is worth less today → lower value.' },
      { key: 'terminalGrowth', label: 'Long-term growth', term: 'Perpetuity growth', fmt: 'pct', help: 'How fast cash flow grows forever after year 5. Higher → higher value.' },
      { key: 'exitMultiple', label: 'Year-5 sale price', term: 'Exit EV/EBITDA', fmt: 'x', help: 'What the business could sell for in year 5, as a multiple of its yearly profit. Higher → higher value.' },
    ],
  },
  {
    title: 'Business outlook',
    hint: 'moves DCF and LBO',
    items: [
      { key: 'revenueGrowth', label: 'Sales growth next year', term: 'Revenue growth Y1', fmt: 'pct', help: 'Fades toward long-term growth by year 5. Higher → higher value.' },
      { key: 'ebitMargin', label: 'Profit per $1 of sales', term: 'EBIT margin', fmt: 'pct', help: 'Operating profit as a share of revenue. Higher → higher value.' },
      { key: 'taxRate', label: 'Tax rate', term: 'Effective tax', fmt: 'pct', help: 'Share of profit paid in tax. Higher → lower value.' },
    ],
  },
  {
    title: 'If someone bought the company',
    hint: 'moves Precedents and LBO',
    items: [
      { key: 'controlPremium', label: 'Takeover premium', term: 'Control premium', fmt: 'pct', help: 'Extra a buyer typically pays over the market price to take control. Higher → higher Precedents bar.' },
      { key: 'lboLeverage', label: 'Share of price borrowed by a buyout fund', term: 'Debt / price', fmt: 'pct', help: 'Private-equity buyers typically fund 50–60% of the price with debt. More debt → fund can pay more.' },
      { key: 'lboTargetIrr', label: "Fund's target return", term: 'Target IRR', fmt: 'pct', help: 'Yearly return a private-equity buyer insists on. Higher → it can pay less → lower floor.' },
      { key: 'lboInterestRate', label: 'Interest rate on that debt', term: 'Cost of debt', fmt: 'pct', help: 'Higher interest eats cash flow → fund can pay less.' },
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
      <p className="rounded-lg bg-raised/60 px-3 py-2 text-[11.5px] leading-relaxed text-sub">
        Every valuation rests on assumptions. Drag a slider and watch the bars on the chart move. That shows which assumptions really change the answer.
      </p>
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-3 flex items-baseline justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">{g.title}</h4>
            <span className="text-[10.5px] text-mute">{g.hint}</span>
          </div>
          <div className="space-y-4">
            {g.items.map(({ key, label, term, help, fmt }) => {
              const r = ranges[key];
              const v = a[key];
              const fill = ((v - r.min) / (r.max - r.min)) * 100;
              const moved = Math.abs(v - defaults[key]) > 1e-9;
              return (
                <label key={key} className="block">
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="text-ink">
                      {label} <span className="text-[10.5px] text-mute">· {term}</span>
                    </span>
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
                  <p className="mt-0.5 text-[10.5px] leading-snug text-mute">{help}</p>
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
        Reset all to starting assumptions
      </button>
    </div>
  );
}
