'use client';

import { useMemo, useState } from 'react';
import type { Assumptions, CompanyData, ScenarioResult, SectorMedian } from '@/lib/engine/types';
import { defaultAssumptions } from '@/lib/engine/assumptions';
import { runScenario } from '@/lib/engine/valuation';
import { cases, monteCarlo, reverseDcf, sensitivity } from '@/lib/engine/analytics';
import { Triangulation } from './Triangulation';
import { Flags } from './Flags';
import { pct, usd } from '@/lib/format';

/**
 * The engine is isomorphic, so the whole scenario recomputes in the browser on every keystroke.
 * No round-trip, no server load, and the numbers are identical to the ones the ingestion job
 * stored — same module, same code path.
 */
export function ScenarioBuilder({ data, sectorMedian }: { data: CompanyData; sectorMedian: SectorMedian }) {
  const [a, setA] = useState<Assumptions>(() => defaultAssumptions(data.meta));
  const [mcTrials, setMcTrials] = useState(500);
  const [showMc, setShowMc] = useState(false);

  const result: ScenarioResult = useMemo(() => runScenario(data, a, sectorMedian), [data, a, sectorMedian]);
  const grid = useMemo(() => (data.meta.shares_outstanding ? sensitivity(result, a, data.meta.shares_outstanding) : null), [result, a, data]);
  const bookends = useMemo(() => cases(data, a, sectorMedian), [data, a, sectorMedian]);
  const reverse = useMemo(() => reverseDcf(data, a, sectorMedian), [data, a, sectorMedian]);
  const mc = useMemo(() => (showMc ? monteCarlo(data, a, sectorMedian, mcTrials) : null), [showMc, mcTrials, data, a, sectorMedian]);

  const set = (fn: (draft: Assumptions) => void) => {
    setA((prev) => { const next = structuredClone(prev); fn(next); return next; });
  };

  return (
    <div className="space-y-6">
      <Triangulation r={result} />
      <Flags flags={result.flags} />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-2">
          <h3 className="font-serif text-base text-navy">Growth &amp; margins</h3>
          <Field label="Long-run growth anchor" value={a.revenue.longTermGrowth} step={0.005} suffix="%"
                 onChange={(v) => set((d) => { d.revenue.longTermGrowth = v; })} />
          <Field label="Growth clamp — max" value={a.revenue.growthMax} step={0.05} suffix="%"
                 onChange={(v) => set((d) => { d.revenue.growthMax = v; })} />
          <Field label="Margin stability (higher = stickier)" value={a.margin.stability} step={0.05} raw
                 onChange={(v) => set((d) => { d.margin.stability = v; })} />
          <Field label="Sector-median blend" value={a.margin.sectorBlend} step={0.05} suffix="%"
                 onChange={(v) => set((d) => { d.margin.sectorBlend = v; })} />
          <Radio label="Margin base" value={a.margin.mode}
                 options={[['auto', 'Auto'], ['recency', 'Recency-weighted'], ['cycle', 'Full-cycle average']]}
                 onChange={(v) => set((d) => { d.margin.mode = v as Assumptions['margin']['mode']; })} />
          <p className="text-[11px] text-muted">
            Detected: <b>{result.diagnostics.marginMode}</b>
            {result.diagnostics.autoDetected ? ' (auto, from margin volatility)' : ''} · sector median op margin{' '}
            {pct(sectorMedian.op)}
          </p>
        </div>

        <div className="card space-y-2">
          <h3 className="font-serif text-base text-navy">Discount rate &amp; terminal</h3>
          <Field label="Risk-free rate" value={a.dcf.rf} step={0.001} suffix="%" onChange={(v) => set((d) => { d.dcf.rf = v; })} />
          <Field label="Equity risk premium" value={a.dcf.erp} step={0.001} suffix="%" onChange={(v) => set((d) => { d.dcf.erp = v; })} />
          <Field label="Beta" value={a.dcf.beta} step={0.05} raw onChange={(v) => set((d) => { d.dcf.beta = v; })} />
          <Field label="Terminal growth" value={a.dcf.terminalGrowth} step={0.0025} suffix="%" onChange={(v) => set((d) => { d.dcf.terminalGrowth = v; })} />
          <Check label="Mid-year discounting" checked={a.dcf.midYear} onChange={(v) => set((d) => { d.dcf.midYear = v; })} />
          <Check label="Deduct stock-based comp from cash flow" checked={a.flags.sbcDeduct} onChange={(v) => set((d) => { d.flags.sbcDeduct = v; })} />
          <Check label="Link share count to buybacks" checked={a.flags.sharesLink} onChange={(v) => set((d) => { d.flags.sharesLink = v; })} />
          <p className="text-[11px] text-muted">
            Street practice often uses a 5.5% equity risk premium; this defaults to {pct(a.dcf.erp, 2)}. Neither is neutral.
          </p>
        </div>
      </div>

      {grid && grid.waccRows.length > 0 && (
        <section>
          <h3 className="font-serif text-lg text-navy mb-1">Sensitivity — value per share</h3>
          <p className="text-[12.5px] text-muted mb-1">Green is above the market price. If the verdict flips inside this grid, it is fragile.</p>
          <div className="scroller">
            <table className="tbl">
              <thead>
                <tr><th className="li">WACC ╲ terminal growth</th>{grid.growthCols.map((g) => <th key={g}>{pct(g, 1)}</th>)}</tr>
              </thead>
              <tbody>
                {grid.grid.map((row, i) => (
                  <tr key={i}>
                    <td className="li">{pct(grid.waccRows[i], 2)}{Math.abs(grid.waccRows[i] - (result.fcff?.wacc ?? 0)) < 1e-12 ? ' (base)' : ''}</td>
                    {row.map((cell, j) => (
                      <td key={j} className={`num ${cell === null ? 'text-muted' : cell > (result.price ?? 0) ? 'text-pos' : 'text-neg'}`}>
                        {cell === null ? 'n/a' : usd(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-serif text-base text-navy mb-2">Bull / base / bear</h3>
          <table className="w-full text-[12.5px]">
            <tbody>
              <Case label={`Bull (+1σ)`} v={bookends.bull.perShare} g={bookends.bull.avgGrowth}
                    note={`growth +${pct(bookends.sdG, 1)}/yr, margins +${pct(bookends.sdM, 1)}`} />
              <Case label="Base" v={result.fcfe.perShare} g={result.projIS.reduce((s, p) => s + p.growth, 0) / result.projIS.length} note="the engine's own extrapolation" strong />
              <Case label={`Bear (−1σ)`} v={bookends.bear.perShare} g={bookends.bear.avgGrowth}
                    note={`growth −${pct(bookends.sdG, 1)}/yr, margins −${pct(bookends.sdM, 1)}`} />
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 className="font-serif text-base text-navy mb-2">What the price implies</h3>
          {reverse?.status === 'ok' ? (
            <p className="text-[13px]">
              At {usd(result.price)} the market is pricing roughly <b>{pct(reverse.impliedAvgGrowth, 1)}</b> average annual
              revenue growth. This model assumes <b>{pct(reverse.modelAvgGrowth, 1)}</b>.{' '}
              {reverse.impliedAvgGrowth > reverse.modelAvgGrowth
                ? 'The market is more optimistic than the model.'
                : 'The market is more pessimistic than the model.'}
            </p>
          ) : (
            <p className="text-[13px] text-muted">
              {reverse ? 'No growth path inside ±35pp reprices this to market — the gap is not about growth alone.' : 'No market price available.'}
            </p>
          )}
          <p className="text-[11.5px] text-muted mt-2">
            Reverse DCF asks what must be true for today&apos;s price to be right, which sidesteps arguing about the growth input.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-serif text-base text-navy">Monte Carlo</h3>
          <input type="number" value={mcTrials} step={100} min={100} max={5000}
                 onChange={(e) => setMcTrials(Number(e.target.value))}
                 className="w-24 border border-rule rounded px-2 py-1 text-[12px] font-mono text-right" />
          <button onClick={() => setShowMc(true)} className="text-[12px] border border-rule rounded px-3 py-1 hover:border-accent hover:text-accent">
            Run simulation
          </button>
        </div>
        {mc ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat k="P10 (bear)" v={usd(mc.p10)} />
              <Stat k="P50 (median)" v={usd(mc.p50)} />
              <Stat k="P90 (bull)" v={usd(mc.p90)} />
              <Stat k="P(value > price)" v={mc.probAbovePrice === null ? '—' : `${(mc.probAbovePrice * 100).toFixed(0)}%`} />
            </div>
            <p className="text-[11.5px] text-muted mt-2">
              {mc.trials} trials, growth ±{pct(mc.sdG, 1)} and margins ±{pct(mc.sdM, 1)} drawn from this company&apos;s own
              history; {mc.failed} produced no valid terminal value. A single number implies precision this model does not have.
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-muted">Runs the full model hundreds of times with inputs randomised from historical volatility.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, step, onChange, suffix, raw }: {
  label: string; value: number; step: number; onChange: (v: number) => void; suffix?: string; raw?: boolean;
}) {
  const shown = raw ? value : value * 100;
  return (
    <label className="flex items-center justify-between gap-2 text-[12.3px]">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input type="number" value={Number(shown.toFixed(4))} step={raw ? step : step * 100}
               onChange={(e) => { const v = Number(e.target.value); onChange(raw ? v : v / 100); }}
               className="w-20 border border-rule rounded px-2 py-0.5 font-mono text-right text-[12px]" />
        {suffix && <span className="text-muted">{suffix}</span>}
      </span>
    </label>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-[12.3px]">
      <span className="text-muted">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
function Radio({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="text-[12.3px]">
      <div className="text-muted mb-1">{label}</div>
      <div className="flex flex-wrap gap-3">
        {options.map(([v, l]) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" checked={value === v} onChange={() => onChange(v)} /> {l}
          </label>
        ))}
      </div>
    </div>
  );
}
function Stat({ k, v }: { k: string; v: string }) {
  return <div><div className="stat-k">{k}</div><div className="font-mono text-lg font-bold tabular-nums">{v}</div></div>;
}
function Case({ label, v, g, note, strong }: { label: string; v: number | null; g: number | null; note: string; strong?: boolean }) {
  return (
    <tr className={strong ? 'font-semibold' : ''}>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right font-mono">{usd(v)}</td>
      <td className="py-1 text-right font-mono">{pct(g, 1)}</td>
      <td className="py-1 pl-3 text-muted text-[11.5px]">{note}</td>
    </tr>
  );
}
