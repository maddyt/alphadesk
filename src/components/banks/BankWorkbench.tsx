'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { runBank, BASEL, costOfEquity, ERP, type BankAssumptions, type BankInputs } from '@/lib/banks/engine';
import { bankQuery } from '@/lib/banks/params';
import { BANK_LABELS, type BankFinancials, type BankKey, type BankMarket } from '@/lib/banks/types';
import { money, mult, pct, price, signedPct } from '@/lib/format';
import type { LineItem } from '@/lib/types';
import { Badge, Card, LiveDot, Stat, td, th } from '../ui';
import { Slider } from '../deals/DealControls';
import { AuditModal } from '../workbench/FinancialsTab';
import { CapitalGauge, DividendBars, LiquidityBars, ScatterSvg, ValueBuild } from './BankCharts';
import { BankMemoTab } from './BankMemoTab';

const TABS = [
  { id: 'regression', label: 'P/TBV vs ROATCE' },
  { id: 'ddm', label: 'Dividend discount model' },
  { id: 'capital', label: 'Capital stack' },
  { id: 'stress', label: 'Stress tests' },
  { id: 'ai', label: 'AI analysis' },
  { id: 'sec', label: 'SEC data' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function BankWorkbench({
  fin,
  market,
  i,
  peers,
  basis,
  defaults,
  initial,
  warnings,
  rf,
  rfSource,
}: {
  fin: BankFinancials;
  market: BankMarket;
  i: BankInputs;
  peers: BankInputs[];
  basis: string;
  defaults: BankAssumptions;
  initial: BankAssumptions;
  warnings: string[];
  rf: number;
  rfSource: string;
}) {
  const [a, setA] = useState<BankAssumptions>(initial);
  const [tab, setTab] = useState<Tab>('regression');
  const [copied, setCopied] = useState(false);
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ state: 'idle' });
  const run = useMemo(() => runBank(i, peers, a), [i, peers, a]);
  const { reg, ddm, stack, stress } = run;
  const query = bankQuery(a, defaults);
  const live = fin.source === 'sec-live';
  const capm = costOfEquity(rf, i.beta);

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
    setSave({ state: 'idle' });
  }, [query]);

  const set = <K extends keyof BankAssumptions>(k: K, v: BankAssumptions[K]) => setA((p) => ({ ...p, [k]: v }));
  const moved = (k: keyof BankAssumptions) => a[k] !== defaults[k];
  const toggle = (t: string) => setA((p) => ({ ...p, excluded: p.excluded.includes(t) ? p.excluded.filter((x) => x !== t) : [...p.excluded, t] }));

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  async function saveModel() {
    setSave({ state: 'saving' });
    const res = await fetch('/api/banks/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: i.ticker,
        name: `${i.ticker} · CET1 ${pct(a.targetCet1)} · Ke ${pct(a.ke)}`,
        query,
        price: i.price,
        regression_price: Number.isFinite(reg.impliedPrice) ? reg.impliedPrice : null,
        ddm_price: Number.isFinite(ddm.perShare) ? ddm.perShare : null,
      }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSave(res?.ok ? { state: 'saved' } : { state: 'error', msg: json.error ?? 'Could not save' });
  }

  const regUp = reg.impliedPrice / i.price - 1;
  const ddmUp = ddm.perShare / i.price - 1;
  const t = reg.points.find((p) => p.isTarget);
  const verdict = !t ? 'n/a' : t.flag === 'premium' ? 'trades at a premium to its returns' : t.flag === 'discount' ? 'trades at a discount to its returns' : 'trades in line with its returns';

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-24 sm:px-6">
      {/* ---------------------------------------------------------------- Header */}
      <section className="animate-fadeup pt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#8DB4FF]">BankVal AI · FIG valuation</span>
          {live ? (
            <Badge tone="live">
              <LiveDot /> Live SEC EDGAR · CIK {fin.cik}
            </Badge>
          ) : (
            <Badge tone="snap">Offline snapshot data</Badge>
          )}
          <Badge>
            {fin.fyLabel} earnings · balance sheet {fin.balanceLabel}
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {i.name} <span className="text-mute">({i.ticker})</span>
          </h1>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={copyLink} className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink">
              {copied ? '✓ Link copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={saveModel}
              disabled={save.state === 'saving' || save.state === 'saved'}
              title={save.msg}
              className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink disabled:opacity-60"
            >
              {save.state === 'saved' ? '✓ Saved' : save.state === 'saving' ? 'Saving…' : save.state === 'error' ? 'Save unavailable' : 'Save model'}
            </button>
            <Link href={`/banks/${i.ticker}/summary${query}`} target="_blank" className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6]">
              Export 1-page summary ↗
            </Link>
          </div>
        </div>
        {save.state === 'error' && <p className="mt-2 text-xs text-amber">{save.msg}</p>}

        <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl border border-line bg-panel/70 p-4 sm:grid-cols-4 xl:grid-cols-8">
          <Stat label="Share price" value={price(i.price)} sub={market.source.split(' · ')[0]} />
          <Stat label="Tangible book / share" value={price(i.tbvps)} sub="TCE ÷ shares" />
          <Stat label="Price / TBV" value={mult(i.ptbv, 2)} sub={`${mult(i.pe)} P/E`} />
          <Stat label="ROATCE" value={pct(i.roatce)} sub={fin.fyLabel} tone={i.roatce >= 0.12 ? 'up' : i.roatce < 0.08 ? 'down' : undefined} />
          <Stat label="CET1 ratio" value={pct(i.cet1Ratio)} sub={i.capitalEstimated ? 'estimated' : `min ${pct(stack.requirement.cet1)}`} />
          <Stat label="NII / avg assets" value={i.nim !== null ? pct(i.nim, 2) : '—'} sub="NIM proxy" />
          <Stat label="Efficiency ratio" value={i.efficiency !== null ? pct(i.efficiency, 0) : '—'} sub="lower is better" />
          <Stat label="NPLs / loans" value={i.nplRatio !== null ? pct(i.nplRatio, 2) : '—'} sub={i.aclRatio !== null ? `reserves ${pct(i.aclRatio, 2)}` : 'not tagged'} />
        </div>
        {warnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {warnings.map((w) => (
              <p key={w} className="rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-[12px] text-amber">
                {w}
              </p>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- Valuation summary */}
      <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-line bg-panel/80 p-5">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mute">What is this bank worth?</div>
          <div className="mt-3 space-y-3">
            {[
              { k: 'Share price today', v: i.price, c: 'bg-[#64748B]', note: market.asOf ? `as of ${market.asOf}` : '' },
              { k: 'Peer regression (P/TBV vs ROATCE)', v: reg.impliedPrice, c: 'bg-brand', note: `${mult(reg.impliedPtbv, 2)} × ${price(i.tbvps)} TBV`, up: regUp },
              { k: '3-stage dividend discount model', v: ddm.perShare, c: 'bg-mark', note: `Ke ${pct(a.ke)} · CET1 target ${pct(a.targetCet1)}`, up: ddmUp },
            ].map((r) => {
              const max = Math.max(i.price, reg.impliedPrice || 0, ddm.perShare || 0) * 1.08;
              return (
                <div key={r.k}>
                  <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="text-sub">{r.k}</span>
                    <span className="num font-semibold text-ink">
                      {price(r.v)}
                      {r.up !== undefined && Number.isFinite(r.up) && <span className={`ml-2 text-[11.5px] ${r.up >= 0 ? 'text-up' : 'text-down'}`}>{signedPct(r.up)}</span>}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 rounded bg-line/50">
                    <div className={`h-full rounded ${r.c} transition-all duration-300`} style={{ width: `${Math.max(0, Math.min(100, (r.v / max) * 100))}%` }} />
                  </div>
                  <div className="num mt-0.5 text-[10.5px] text-mute">{r.note}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-panel/80 p-5 text-[13px] leading-relaxed text-sub">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mute">In plain English</div>
          <p className="mt-2">
            Banks are valued on their <span className="text-ink">tangible book</span> (equity minus goodwill) and how much they earn on it (<span className="text-ink">ROATCE</span>), not on EBITDA:
            money is their raw material, so debt isn&rsquo;t financing, it&rsquo;s inventory.
          </p>
          <p className="mt-2">
            {i.ticker} earns <span className="num text-ink">{pct(i.roatce)}</span> on tangible equity and trades at <span className="num text-ink">{mult(i.ptbv, 2)}</span> tangible book, so
            against {reg.fit.n} peers it <span className={t?.flag === 'premium' ? 'text-down' : t?.flag === 'discount' ? 'text-up' : 'text-ink'}>{verdict}</span>. Regulators require it to hold
            capital, so it can only pay out what keeps CET1 above <span className="num text-ink">{pct(a.targetCet1)}</span>: that cap drives the dividend model.
          </p>
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[330px_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------- Controls */}
        <aside className="no-print lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <Card title="Model controls" right={<button type="button" onClick={() => setA(defaults)} className="text-[11px] text-[#8DB4FF] hover:underline">Reset</button>}>
            <div className="space-y-5">
              <Group n={1} title="Returns">
                <Slider
                  label="ROATCE"
                  term="normalized"
                  help="Reads the peer line at this return and drives DDM earnings. Set it for a bank in a loss or one-off year."
                  value={a.roatce}
                  min={-0.05}
                  max={0.35}
                  step={0.0025}
                  display={pct(a.roatce)}
                  minLabel="-5%"
                  maxLabel="35%"
                  moved={moved('roatce')}
                  marker={Number.isFinite(i.roatce) ? { value: i.roatce, label: `reported ${pct(i.roatce)}` } : null}
                  onChange={(v) => set('roatce', v)}
                />
              </Group>
              <Group n={2} title="Dividend discount model">
                <Slider label="Target CET1 ratio" help="Capital the bank keeps. Higher = safer, but less left to pay out." value={a.targetCet1} min={0.09} max={0.13} step={0.0025} display={pct(a.targetCet1, 2)} minLabel="9%" maxLabel="13%" moved={moved('targetCet1')} marker={{ value: i.cet1Ratio, label: `today ${pct(i.cet1Ratio)}` }} onChange={(v) => set('targetCet1', v)} />
                <Slider label="Loan growth" term="years 1-5" help="Faster growth needs more capital, which holds back dividends now." value={a.loanGrowth} min={-0.02} max={0.12} step={0.005} display={pct(a.loanGrowth)} minLabel="-2%" maxLabel="12%" moved={moved('loanGrowth')} onChange={(v) => set('loanGrowth', v)} />
                <Slider label="Cost of equity" term="Ke" help={`CAPM: ${pct(rf, 2)} risk-free (${rfSource}) + β ${i.beta.toFixed(2)} × ${pct(ERP)} ERP.`} value={a.ke} min={0.07} max={0.16} step={0.0025} display={pct(a.ke, 2)} minLabel="7%" maxLabel="16%" moved={moved('ke')} marker={{ value: capm, label: `CAPM ${pct(capm)}` }} onChange={(v) => set('ke', v)} />
                <Slider label="Terminal growth" value={a.terminalGrowth} min={0} max={0.05} step={0.0025} display={pct(a.terminalGrowth, 2)} minLabel="0%" maxLabel="5%" moved={moved('terminalGrowth')} onChange={(v) => set('terminalGrowth', v)} />
              </Group>
              <Group n={3} title="Stress test">
                <Slider label="Rate shock" help="Instant parallel rise in rates; bond prices fall by duration × shock." value={a.rateShockBps} min={0} max={400} step={25} display={`+${a.rateShockBps} bps`} minLabel="0" maxLabel="+400" moved={moved('rateShockBps')} color="#EF4444" onChange={(v) => set('rateShockBps', v)} />
                <Slider label="Securities duration" value={a.duration} min={1} max={10} step={0.5} display={`${a.duration.toFixed(1)} yrs`} minLabel="1" maxLabel="10" moved={moved('duration')} onChange={(v) => set('duration', v)} />
                <Slider label="Deposit outflow" help="Share of deposits that leave (SVB lost ~25% in a day)." value={a.outflowPct} min={0} max={0.5} step={0.01} display={pct(a.outflowPct, 0)} minLabel="0%" maxLabel="50%" moved={moved('outflowPct')} color="#EF4444" onChange={(v) => set('outflowPct', v)} />
                <label className="flex items-start gap-2 text-[12px] text-sub">
                  <input type="checkbox" checked={a.aociInCet1} onChange={(e) => set('aociInCet1', e.target.checked)} className="mt-0.5 accent-[#3B82F6]" />
                  <span>
                    Unrealized AFS losses count against CET1 <span className="text-mute">(Basel III endgame; today only the largest banks)</span>
                  </span>
                </label>
              </Group>
            </div>
          </Card>
        </aside>

        {/* ---------------------------------------------------------------- Tabs */}
        <div className="min-w-0">
          <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel/60 p-1">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition ${tab === tb.id ? 'bg-raised text-ink ring-1 ring-line' : 'text-mute hover:text-sub'}`}
              >
                {tb.label}
                {tb.id === 'ai' && <span className="ml-1.5 rounded bg-brand/20 px-1 py-px text-[9.5px] font-bold text-[#8DB4FF]">AI</span>}
              </button>
            ))}
          </div>
          <div key={tab} className="animate-fadeup space-y-5">
            {tab === 'regression' && (
              <>
                <Card
                  title="Price / tangible book vs. ROATCE"
                  subtitle={`Each dot is a bank. Higher returns should earn a higher multiple; the line is the market's going rate. ${basis}. Click a dot to drop it from the fit.`}
                  right={
                    <div className="num flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded-md bg-raised px-2 py-1 text-sub">
                        P/TBV = {reg.fit.alpha.toFixed(2)} + {reg.fit.beta.toFixed(2)} × ROATCE
                      </span>
                      <span className="rounded-md bg-raised px-2 py-1 text-sub">R² {reg.fit.r2.toFixed(2)}</span>
                      <span className="rounded-md bg-raised px-2 py-1 text-sub">n = {reg.fit.n}</span>
                    </div>
                  }
                >
                  <ScatterSvg reg={reg} roatce={a.roatce} onToggle={toggle} />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mute">
                    <Legend c="#F59E0B" label={`${i.ticker} (target, not in fit)`} />
                    <Legend c="#2563EB" label="In line" />
                    <Legend c="#EF4444" label="Premium to returns (rich)" />
                    <Legend c="#22C55E" label="Discount to returns (cheap)" />
                    <Legend c="#6B7689" label="Excluded" hollow />
                  </div>
                </Card>
                <div className="grid gap-5 xl:grid-cols-[1fr_1.4fr]">
                  <Card title="What the line implies" subtitle="Read the regression at the ROATCE slider">
                    <dl className="num grid grid-cols-2 gap-4 text-[13px]">
                      <Kv k="Implied P/TBV" v={mult(reg.impliedPtbv, 2)} />
                      <Kv k="Implied price" v={price(reg.impliedPrice)} sub={signedPct(regUp)} tone={regUp >= 0 ? 'up' : 'down'} />
                      <Kv k={`${i.ticker} actual P/TBV`} v={mult(i.ptbv, 2)} />
                      <Kv k="Residual vs line" v={`${(reg.targetResidual >= 0 ? '+' : '') + reg.targetResidual.toFixed(2)}x`} sub={verdict} />
                    </dl>
                    <p className="mt-4 text-[11.5px] leading-relaxed text-mute">
                      Each 1 point of ROATCE is worth about <span className="num text-sub">{(reg.fit.beta / 100).toFixed(3)}x</span> of tangible book in this peer group. Banks more than{' '}
                      <span className="num">{reg.band.toFixed(2)}x</span> above or below the line are flagged.
                    </p>
                  </Card>
                  <Card title="Peer group">
                    <div className="-mx-5 overflow-x-auto">
                      <table className="w-full min-w-[520px]">
                        <thead>
                          <tr className="border-b border-line">
                            <th className={th}>Bank</th>
                            <th className={th}>ROATCE</th>
                            <th className={th}>P/TBV</th>
                            <th className={th}>Line</th>
                            <th className={th}>Residual</th>
                            <th className={th}>In fit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...reg.points].sort((x, y) => y.x - x.x).map((p) => (
                            <tr key={p.ticker} className={`border-b border-line/40 ${p.isTarget ? 'bg-amber/5' : ''}`}>
                              <td className={`${td} ${p.isTarget ? 'font-semibold text-amber' : 'text-ink'}`} title={p.name}>
                                {p.ticker}
                              </td>
                              <td className={td}>{pct(p.x)}</td>
                              <td className={td}>{mult(p.y, 2)}</td>
                              <td className={td}>{mult(p.fitted, 2)}</td>
                              <td className={`${td} ${p.flag === 'premium' ? 'text-down' : p.flag === 'discount' ? 'text-up' : ''}`}>
                                {(p.residual >= 0 ? '+' : '') + p.residual.toFixed(2)}
                              </td>
                              <td className={td}>{p.isTarget ? <span className="text-mute">target</span> : <input type="checkbox" checked={p.included} onChange={() => toggle(p.ticker)} className="accent-[#3B82F6]" aria-label={`Include ${p.ticker}`} />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              </>
            )}

            {tab === 'ddm' && (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  <Card title="Value build per share" subtitle="Present value of what the bank can pay out, at the cost of equity">
                    <ValueBuild d={ddm} sharePrice={i.price} shares={i.shares} />
                    <p className="mt-2 text-[11.5px] text-mute">
                      Terminal value is <span className="num text-sub">{pct(ddm.pvTerminal / ddm.equityValue, 0)}</span> of the total. DDM-implied P/TBV{' '}
                      <span className="num text-sub">{mult(ddm.impliedPtbv, 2)}</span>.
                    </p>
                  </Card>
                  <Card title="Dividend capacity by year" subtitle="Net income − (RWA × target CET1 − last year's CET1). Red = capital the bank would have to raise.">
                    <DividendBars d={ddm} />
                    <p className="mt-2 text-[11.5px] text-mute">
                      {ddm.excessCet1Now >= 0 ? (
                        <>
                          Year 1 includes <span className="num text-sub">{money(ddm.excessCet1Now)}</span> of CET1 above the target, released as a payout.
                        </>
                      ) : (
                        <>
                          CET1 is <span className="num text-down">{money(-ddm.excessCet1Now)}</span> below the target, so year 1 must rebuild capital first.
                        </>
                      )}
                    </p>
                  </Card>
                </div>
                <Card title="Sensitivity: value per share" subtitle="Cost of equity (rows) × target CET1 ratio (columns). Outlined cell = current scenario.">
                  <div className="-mx-5 overflow-x-auto px-5">
                    <table className="num w-full min-w-[520px] border-collapse text-center text-[12px]">
                      <thead>
                        <tr>
                          <th className="p-1.5 text-[10.5px] font-medium text-mute">Ke \ CET1</th>
                          {run.grid.cols.map((c) => (
                            <th key={c} className="p-1.5 text-[11px] font-semibold text-sub">
                              {pct(c)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {run.grid.rows.map((ke, r) => (
                          <tr key={ke}>
                            <th className="p-1.5 text-[11px] font-semibold text-sub">{pct(ke, 2)}</th>
                            {run.grid.values[r].map((val, c) => {
                              const up = val / i.price - 1;
                              const cur = Math.abs(ke - a.ke) < 1e-6 && Math.abs(run.grid.cols[c] - a.targetCet1) < 1e-6;
                              return (
                                <td key={c} className={`border border-bg p-1.5 ${cur ? 'outline outline-2 outline-amber' : ''}`} style={{ background: up >= 0 ? `rgba(34,197,94,${Math.min(0.45, 0.08 + up)})` : `rgba(239,68,68,${Math.min(0.45, 0.08 - up)})` }}>
                                  {price(val)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
                <Card title="Year-by-year model">
                  <div className="-mx-5 overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="border-b border-line">
                          <th className={th}>Year</th>
                          <th className={th}>Growth</th>
                          <th className={th}>RWA</th>
                          <th className={th}>Net income</th>
                          <th className={th}>Required CET1</th>
                          <th className={th}>Dividend capacity</th>
                          <th className={th}>Present value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ddm.years.map((y) => (
                          <tr key={y.t} className="border-b border-line/40">
                            <td className={td}>
                              Y{y.t} <span className="text-mute">· stage {y.stage}</span>
                            </td>
                            <td className={td}>{pct(y.growth)}</td>
                            <td className={td}>{money(y.rwa)}</td>
                            <td className={td}>{money(y.netIncome)}</td>
                            <td className={td}>{money(y.requiredCet1)}</td>
                            <td className={`${td} ${y.dividend < 0 ? 'text-down' : 'text-ink'}`}>{money(y.dividend)}</td>
                            <td className={td}>{money(y.pv)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td className={`${td} font-semibold text-ink`}>Terminal</td>
                          <td className={td}>{pct(a.terminalGrowth)}</td>
                          <td className={td} colSpan={3} />
                          <td className={td}>{money(ddm.terminalValue)}</td>
                          <td className={`${td} font-semibold text-ink`}>{money(ddm.pvTerminal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {tab === 'capital' && (
              <>
                <Card
                  title="Basel III capital stack"
                  subtitle="How much loss-absorbing capital the bank holds per dollar of risk-weighted assets, against the regulatory minimums (including the 2.5% conservation buffer)."
                  right={i.capitalEstimated ? <Badge tone="snap">Estimated from equity: capital not in consolidated XBRL</Badge> : <Badge tone="live">From SEC XBRL</Badge>}
                >
                  <CapitalGauge s={stack} target={a.targetCet1} after={stress.cet1RatioAfter} height={170} />
                </Card>
                <div className="grid gap-5 xl:grid-cols-2">
                  <Card title="Ratios vs. requirements">
                    <div className="-mx-5 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-line">
                            <th className={th}>Layer</th>
                            <th className={th}>Amount</th>
                            <th className={th}>Ratio</th>
                            <th className={th}>Minimum + buffer</th>
                            <th className={th}>Cushion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['CET1', i.cet1, i.cet1Ratio, stack.requirement.cet1],
                            ['Tier 1 (CET1 + AT1)', i.tier1, i.tier1Ratio, stack.requirement.tier1],
                            ['Total capital (+ Tier 2)', i.totalCapital, i.totalCapitalRatio, stack.requirement.total],
                          ].map(([k, amt, r, req]) => (
                            <tr key={k as string} className="border-b border-line/40">
                              <td className={`${td} text-ink`}>{k}</td>
                              <td className={td}>{money(amt as number)}</td>
                              <td className={`${td} font-semibold text-ink`}>{pct(r as number, 2)}</td>
                              <td className={td}>{pct(req as number)}</td>
                              <td className={`${td} ${(r as number) - (req as number) >= 0 ? 'text-up' : 'text-down'}`}>{signedPct((r as number) - (req as number), 2)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className={`${td} text-ink`}>Risk-weighted assets</td>
                            <td className={td}>{money(i.rwa)}</td>
                            <td className={td} colSpan={3}>
                              <span className="text-mute">{pct(i.rwa / i.totalAssets, 0)} of total assets</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <Card title="Capital to reach the target" subtitle="What a private-equity buyer or the board would plan around">
                    <dl className="num grid grid-cols-2 gap-4 text-[13px]">
                      <Kv k={`CET1 needed for ${pct(a.targetCet1)}`} v={money(a.targetCet1 * i.rwa)} />
                      {stack.injectionToTarget > 0 ? <Kv k="Capital injection required" v={money(stack.injectionToTarget)} tone="down" /> : <Kv k="Excess CET1 (distributable)" v={money(stack.excessToTarget)} tone="up" />}
                      <Kv k="TCE / tangible assets" v={pct(i.tceRatio, 2)} />
                      <Kv k="Loans / deposits" v={i.ldr !== null ? pct(i.ldr, 0) : '—'} />
                    </dl>
                    <p className="mt-4 text-[11.5px] leading-relaxed text-mute">
                      Large banks also carry a stress capital buffer and, for G-SIBs, a surcharge on top of the {pct(BASEL.cet1Min + BASEL.ccb)} shown; the target slider is where you set that
                      all-in level.
                    </p>
                  </Card>
                </div>
              </>
            )}

            {tab === 'stress' && (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile k="Bond losses from the shock" v={money(stress.afsLoss + stress.htmLoss)} sub={`AFS ${money(stress.afsLoss)} · HTM ${money(stress.htmLoss)}`} tone="down" />
                  <Tile k="CET1 after stress" v={pct(stress.cet1RatioAfter, 2)} sub={`from ${pct(i.cet1Ratio, 2)}`} tone={stress.cet1RatioAfter < stack.requirement.cet1 ? 'down' : 'up'} />
                  <Tile k="Liquidity coverage" v={Number.isFinite(stress.coverage) ? mult(stress.coverage, 2) : '∞'} sub="liquid assets ÷ outflow" tone={stress.coverage < 1 ? 'down' : 'up'} />
                  <Tile k="Economic TCE" v={money(stress.economicTce)} sub={`if every bond were marked · from ${money(i.tce)}`} tone={stress.economicTce < 0 ? 'down' : undefined} />
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <Card title="Deposit run: how the bank pays depositors" subtitle={`${pct(a.outflowPct, 0)} of deposits leave. The bank uses cash first, then sells bonds; selling held-to-maturity bonds turns paper losses into real ones.`}>
                    <LiquidityBars s={stress} />
                    <p className="mt-2 text-[11.5px] text-mute">
                      Losses crystallised by selling: <span className="num text-sub">{money(stress.realizedLoss)}</span> after tax.
                      {stress.shortfall > 0 ? ` A ${money(stress.shortfall)} gap would need Federal Home Loan Bank or Fed discount-window borrowing.` : ' Liquid assets cover the outflow.'}
                    </p>
                  </Card>
                  <Card title="Rate shock: duration gap" subtitle={`+${a.rateShockBps} bps on ${money(i.afs + i.htm)} of securities with a ${a.duration.toFixed(1)}-year duration`}>
                    <dl className="num grid grid-cols-2 gap-4 text-[13px]">
                      <Kv k="Available-for-sale" v={money(i.afs)} sub={`loss ${money(stress.afsLoss)} · hits equity now`} />
                      <Kv k="Held-to-maturity" v={money(i.htm)} sub={`loss ${money(stress.htmLoss)} · hidden until sold`} />
                      <Kv k="HTM losses already today" v={i.htmUnrealized !== null ? money(i.htmUnrealized) : 'not tagged'} />
                      <Kv k="TCE after stress" v={money(stress.tceAfter)} sub={`TCE ratio ${pct(stress.tceRatioAfter, 2)}`} />
                    </dl>
                    <p className="mt-4 text-[11.5px] leading-relaxed text-mute">
                      This is the Silicon Valley Bank mechanism: long-duration bonds lose value when rates rise, and a run forces their sale. Uninsured deposits are not in XBRL; set the
                      outflow from the 10-K&rsquo;s estimated uninsured deposits.
                    </p>
                  </Card>
                </div>
              </>
            )}

            {tab === 'ai' && <BankMemoTab ticker={i.ticker} query={query} />}

            {tab === 'sec' && <SecTable fin={fin} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Group({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">
        {n} · {title}
      </div>
      {children}
    </div>
  );
}

function Legend({ c, label, hollow }: { c: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={hollow ? { border: `1.5px solid ${c}` } : { background: c }} />
      {label}
    </span>
  );
}

function Kv({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'up' | 'down' }) {
  return (
    <div>
      <dt className="font-sans text-[10.5px] uppercase tracking-wider text-mute">{k}</dt>
      <dd className={`mt-0.5 text-[17px] font-semibold ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'}`}>{v}</dd>
      {sub && <dd className="font-sans text-[11px] text-mute">{sub}</dd>}
    </div>
  );
}

function Tile({ k, v, sub, tone }: { k: string; v: string; sub: string; tone?: 'up' | 'down' }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === 'down' ? 'border-down/40 bg-down/5' : tone === 'up' ? 'border-up/30 bg-up/5' : 'border-line bg-panel/80'}`}>
      <div className="text-[10.5px] uppercase tracking-wider text-mute">{k}</div>
      <div className={`num mt-1 text-xl font-semibold ${tone === 'down' ? 'text-down' : tone === 'up' ? 'text-up' : 'text-ink'}`}>{v}</div>
      <div className="mt-0.5 text-[11px] text-mute">{sub}</div>
    </div>
  );
}

const SEC_ROWS: { section: string; keys: BankKey[] }[] = [
  { section: 'Income statement (latest fiscal year)', keys: ['netIncome', 'preferredDividends', 'netIncomeToCommon', 'nii', 'nonInterestIncome', 'nonInterestExpense', 'provision', 'dividendsPerShare'] },
  { section: 'Balance sheet (latest filing)', keys: ['totalAssets', 'loans', 'allowance', 'npl', 'deposits', 'cash', 'afs', 'htm', 'htmFairValue', 'totalEquity', 'preferred', 'commonEquity', 'goodwill', 'intangibles', 'shares'] },
  { section: 'Regulatory capital', keys: ['cet1', 'tier1', 'totalCapital', 'rwa'] },
  { section: 'Prior fiscal year-end (for averages)', keys: ['commonEquityPrior', 'goodwillPrior', 'intangiblesPrior', 'totalAssetsPrior'] },
];

function SecTable({ fin }: { fin: BankFinancials }) {
  const [sel, setSel] = useState<{ item: LineItem; period: string } | null>(null);
  const live = fin.source === 'sec-live';
  return (
    <>
      <Card title="SEC EDGAR XBRL inputs" subtitle="Click any figure for its tag, period, form and accession number. ◆ = estimated because the filing doesn't tag it.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <tbody>
              {SEC_ROWS.map((g) => [
                <tr key={g.section}>
                  <td colSpan={3} className="px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">
                    {g.section}
                  </td>
                </tr>,
                ...g.keys.map((k) => {
                  const it = fin.items[k];
                  const tag = it?.facts[0] ? `${it.facts[0].taxonomy}:${it.facts[0].tag}` : '—';
                  const val = !it ? '—' : k === 'dividendsPerShare' ? price(it.value) : k === 'shares' ? `${(it.value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })}M` : money(it.value);
                  return (
                    <tr key={k} className="border-b border-line/40 hover:bg-raised/40">
                      <td className={`${td} text-ink`}>{BANK_LABELS[k]}</td>
                      <td className={`${td} max-w-[280px] truncate text-left text-[11px] text-mute`} title={it?.formula ?? tag}>
                        {it?.formula ?? tag}
                      </td>
                      <td className={td}>
                        {it ? (
                          <button
                            type="button"
                            disabled={!it.facts.length || k === 'dividendsPerShare'}
                            onClick={() => setSel({ item: { key: k === 'shares' ? 'sharesOutstanding' : 'revenue', label: BANK_LABELS[k], value: it.value, facts: it.facts, formula: it.formula } as LineItem, period: k.endsWith('Prior') ? 'prior year-end' : g.section.startsWith('Income') ? fin.fyLabel : fin.balanceLabel })}
                            className="rounded px-1 py-0.5 text-sub underline decoration-line decoration-dotted underline-offset-4 transition hover:bg-brand/15 hover:text-ink disabled:no-underline"
                          >
                            {val}
                            {it.estimated && <sup className="ml-0.5 text-amber">◆</sup>}
                          </button>
                        ) : (
                          <span className="text-mute/60">not tagged</span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ])}
            </tbody>
          </table>
        </div>
      </Card>
      {sel && <AuditModal cik={fin.cik} live={live} sel={sel} onClose={() => setSel(null)} />}
    </>
  );
}
