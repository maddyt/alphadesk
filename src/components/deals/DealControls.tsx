'use client';

import { useState } from 'react';
import type { DealAssumptions } from '@/lib/deals/engine';
import { setMix } from '@/lib/deals/engine';
import { money, pct } from '@/lib/format';

interface SliderProps {
  label: string;
  term?: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  minLabel: string;
  maxLabel: string;
  moved: boolean;
  onChange: (v: number) => void;
  marker?: { value: number; label: string } | null;
  color?: string;
}

export function Slider(p: SliderProps) {
  const fill = ((p.value - p.min) / (p.max - p.min || 1)) * 100;
  const markerPos = p.marker ? ((p.marker.value - p.min) / (p.max - p.min || 1)) * 100 : null;
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
        <span className="text-ink">
          {p.label} {p.term && <span className="text-[10.5px] text-mute">· {p.term}</span>}
        </span>
        <span className={`num shrink-0 rounded-md px-1.5 py-0.5 text-[12.5px] font-semibold ${p.moved ? 'bg-brand/15 text-[#8DB4FF]' : 'text-ink'}`}>{p.display}</span>
      </div>
      <div className="relative">
        <input
          type="range"
          className="slider"
          min={p.min}
          max={p.max}
          step={p.step}
          value={p.value}
          aria-label={p.label}
          style={{ ['--fill' as string]: `${fill}%`, ...(p.color ? { ['--track' as string]: p.color } : {}) }}
          onChange={(e) => p.onChange(Number(e.target.value))}
        />
        {markerPos !== null && markerPos >= 0 && markerPos <= 100 && (
          <span className="pointer-events-none absolute top-[3px] h-4 w-0.5 -translate-x-1/2 rounded bg-amber" style={{ left: `${markerPos}%` }} title={p.marker!.label} />
        )}
      </div>
      <div className="num -mt-0.5 flex justify-between text-[10px] text-mute">
        <span>{p.minLabel}</span>
        {p.marker && markerPos !== null && markerPos >= 0 && markerPos <= 100 && <span className="text-amber">◆ {p.marker.label}</span>}
        <span>{p.maxLabel}</span>
      </div>
      {p.help && <p className="mt-0.5 text-[10.5px] leading-snug text-mute">{p.help}</p>}
    </label>
  );
}

const MIX = [
  { key: 'cashPct', label: 'Cash on hand', color: '#10B981', help: 'Uses the buyer’s cash, so it loses the interest that cash was earning.' },
  { key: 'stockPct', label: 'New shares', color: '#3B82F6', help: 'Pays target holders in buyer stock, which spreads earnings over more shares.' },
  { key: 'debtPct', label: 'New debt', color: '#F59E0B', help: 'Borrows the money, which adds interest cost and leverage.' },
] as const;

const PRESETS: [string, Partial<Record<'cashPct' | 'stockPct' | 'debtPct', number>>][] = [
  ['All stock', { cashPct: 0, stockPct: 1, debtPct: 0 }],
  ['All cash', { cashPct: 1, stockPct: 0, debtPct: 0 }],
  ['All debt', { cashPct: 0, stockPct: 0, debtPct: 1 }],
  ['50/50 stock-debt', { cashPct: 0, stockPct: 0.5, debtPct: 0.5 }],
];

export function DealControls({
  a,
  defaults,
  synMax,
  synStep,
  breakeven,
  maxPremium,
  acquirerCash,
  equityPrice,
  onChange,
  onReset,
  rateNote,
  transactionCosts,
}: {
  a: DealAssumptions;
  defaults: DealAssumptions;
  synMax: number;
  synStep: number;
  breakeven: number;
  maxPremium: number | null;
  acquirerCash: number;
  equityPrice: number;
  onChange: (a: DealAssumptions) => void;
  onReset: () => void;
  rateNote: string;
  transactionCosts?: number;
}) {
  const [advanced, setAdvanced] = useState(false);
  const moved = (k: keyof DealAssumptions) => Math.abs(a[k] - defaults[k]) > 1e-6;
  const changed = (Object.keys(a) as (keyof DealAssumptions)[]).some(moved);
  const cashOver = a.cashPct * equityPrice > acquirerCash;

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-raised/60 px-3 py-2 text-[11.5px] leading-relaxed text-sub">
        Change how much the buyer pays, how it pays, and the savings it expects. Everything recalculates instantly.
      </p>

      <section>
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">1 · Price</h4>
        <Slider
          label="Offer premium"
          term="over today’s price"
          value={a.premium}
          min={0}
          max={0.5}
          step={0.01}
          display={pct(a.premium, 0)}
          minLabel="0%"
          maxLabel="50%"
          moved={moved('premium')}
          marker={maxPremium !== null && maxPremium <= 0.5 ? { value: maxPremium, label: `breakeven ${pct(maxPremium, 0)}` } : null}
          onChange={(v) => onChange({ ...a, premium: v })}
          help="Buyers usually pay 20–40% above the market price to win control. Higher → more dilutive."
        />
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">2 · How it’s paid for</h4>
          <span className="text-[10.5px] text-mute">always totals 100%</span>
        </div>
        <div className="mb-3 flex h-3 overflow-hidden rounded-full ring-1 ring-line" aria-hidden>
          {MIX.map((m) => (
            <span key={m.key} style={{ width: `${a[m.key] * 100}%`, background: m.color, transition: 'width 200ms' }} />
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map(([label, mix]) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ ...a, ...mix } as DealAssumptions)}
              className="rounded-md border border-line px-2 py-1 text-[10.5px] text-sub transition hover:border-brand/50 hover:text-ink"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {MIX.map((m) => (
            <Slider
              key={m.key}
              label={m.label}
              value={a[m.key]}
              min={0}
              max={1}
              step={0.05}
              display={pct(a[m.key], 0)}
              minLabel="0%"
              maxLabel="100%"
              moved={moved(m.key)}
              color={m.color}
              onChange={(v) => onChange(setMix(a, m.key, v))}
              help={m.help}
            />
          ))}
        </div>
        <div className="mt-4">
          <Slider
            label="Interest rate on new debt"
            value={a.debtRate}
            min={0.03}
            max={0.12}
            step={0.0025}
            display={pct(a.debtRate, 2)}
            minLabel="3%"
            maxLabel="12%"
            moved={moved('debtRate')}
            onChange={(v) => onChange({ ...a, debtRate: v })}
            help={rateNote}
          />
        </div>
        {cashOver && (
          <p className="mt-2 rounded-md border border-amber/30 bg-amber/10 px-2 py-1.5 text-[11px] text-amber">
            Cash needed ({money(a.cashPct * equityPrice)}) is more than the buyer holds ({money(acquirerCash)}).
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">3 · Savings from combining</h4>
        <Slider
          label="Annual cost synergies"
          term="pre-tax"
          value={a.synergies}
          min={0}
          max={synMax}
          step={synStep}
          display={money(a.synergies, 0)}
          minLabel="$0"
          maxLabel={money(synMax, 0)}
          moved={moved('synergies')}
          marker={breakeven <= synMax ? { value: breakeven, label: `breakeven ${money(breakeven, 0)}` } : null}
          onChange={(v) => onChange({ ...a, synergies: v })}
          help="Yearly costs cut by merging (overlapping offices, systems, staff). More savings → more accretive."
        />
      </section>

      <section>
        <button type="button" onClick={() => setAdvanced((x) => !x)} className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-sub">
          Cash yield, tax & costs <span className="text-mute">{advanced ? '−' : '+'}</span>
        </button>
        {advanced && (
          <div className="mt-3 space-y-3">
            <Slider label="Interest cash was earning" value={a.cashRate} min={0} max={0.06} step={0.0025} display={pct(a.cashRate, 2)} minLabel="0%" maxLabel="6%" moved={moved('cashRate')} onChange={(v) => onChange({ ...a, cashRate: v })} />
            {(transactionCosts ?? 0) > 0 && (
              <p className="rounded-md bg-raised/60 px-2 py-1.5 text-[11px] text-sub">
                Includes {money(a.transactionCosts)} of change-of-control payouts (from the target&rsquo;s proxy) funded at close.
              </p>
            )}
            <Slider label="Tax rate" value={a.taxRate} min={0.1} max={0.3} step={0.005} display={pct(a.taxRate, 1)} minLabel="10%" maxLabel="30%" moved={moved('taxRate')} onChange={(v) => onChange({ ...a, taxRate: v })} />
          </div>
        )}
      </section>

      <button
        type="button"
        disabled={!changed}
        onClick={onReset}
        className="w-full rounded-lg border border-line py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink disabled:opacity-40"
      >
        Reset to starting assumptions
      </button>
    </div>
  );
}
