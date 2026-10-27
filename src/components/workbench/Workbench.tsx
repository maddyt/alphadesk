'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dataset } from '@/lib/types';
import type { AssumptionKey, Assumptions } from '@/lib/engine/model';
import { buildBaseInputs, defaultAssumptions, evToPrice, sliderRanges, waccBuild } from '@/lib/engine/model';
import { resolveAssumptions, toQuery } from '@/lib/engine/params';
import { runValuation, sensitivityWaccExit, sensitivityWaccGrowth } from '@/lib/engine/valuation';
import { date, money, mult, pct, price, signedPct } from '@/lib/format';
import { FootballField } from '../charts/FootballField';
import { Sparkline } from '../charts/Charts';
import { Badge, LiveDot, Stat } from '../ui';
import { Sliders } from './Sliders';
import { DcfTab } from './DcfTab';
import { SensitivityTab } from './SensitivityTab';
import { CompsTab } from './CompsTab';
import { LboTab } from './LboTab';
import { FinancialsTab } from './FinancialsTab';
import { MemoTab } from './MemoTab';

const TABS = [
  { id: 'dcf', label: 'DCF' },
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'comps', label: 'Comps & Precedents' },
  { id: 'lbo', label: 'LBO' },
  { id: 'financials', label: 'SEC Financials' },
  { id: 'memo', label: 'AI Memo' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const METHOD_TAB: Record<string, TabId> = {
  '52-Week Range': 'financials',
  'Public Comps (EV/EBITDA)': 'comps',
  'Precedent Transactions': 'comps',
  'Discounted Cash Flow': 'dcf',
  'LBO Floor Valuation': 'lbo',
};

export function Workbench({ ds, overrides }: { ds: Dataset; overrides: Partial<Assumptions> }) {
  const b = useMemo(() => buildBaseInputs(ds), [ds]);
  const defaults = useMemo(() => defaultAssumptions(b), [b]);
  const ranges = useMemo(() => sliderRanges(defaults), [defaults]);
  const [a, setA] = useState<Assumptions>(() => resolveAssumptions(defaults, ranges, overrides));
  const [mode, setMode] = useState<'price' | 'ev'>('price');
  const [tab, setTab] = useState<TabId>('dcf');
  const [copied, setCopied] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  const run = useMemo(() => runValuation(b, a), [b, a]);
  const wacc = useMemo(() => waccBuild(b, a.riskFree, a.erp, a.taxRate), [b, a.riskFree, a.erp, a.taxRate]);
  const sensG = useMemo(() => sensitivityWaccGrowth(b, a), [b, a]);
  const sensX = useMemo(() => sensitivityWaccExit(b, a), [b, a]);
  const query = toQuery(a, defaults);

  // Keep the URL in sync so any scenario is a shareable link.
  useEffect(() => {
    const url = `${window.location.pathname}${query}`;
    window.history.replaceState(null, '', url);
  }, [query]);

  const onChange = useCallback((k: AssumptionKey, v: number) => setA((prev) => ({ ...prev, [k]: v })), []);

  const conv = mode === 'price' ? (ev: number) => evToPrice(b, ev) : (ev: number) => ev;
  const rows = run.ranges.map((r) => ({ range: r, min: conv(r.min), p25: conv(r.p25), median: conv(r.median), p75: conv(r.p75), max: conv(r.max) }));
  const current = mode === 'price' ? b.price : b.currentEV;
  const fmt = mode === 'price' ? (v: number) => price(v) : (v: number) => money(v);
  const axisFmt = mode === 'price' ? (v: number) => `$${v.toFixed(0)}` : (v: number) => money(v, 0);
  const altFmt = (row: (typeof rows)[number], v: number) => {
    // Recover EV for the statistic from the displayed value.
    const ev = mode === 'price' ? v * b.shares + b.netDebt : v;
    return mode === 'price' ? money(ev) : price(evToPrice(b, ev));
  };

  const upside = run.compositePrice / b.price - 1;
  const live = ds.source === 'sec-live';

  function downloadSvg() {
    const svg = document.getElementById('football-field');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGElement;
    clone.removeAttribute('class');
    clone.querySelectorAll('[style]').forEach((el) => (el as SVGElement).style.removeProperty('animation'));
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', '#0D121A');
    clone.insertBefore(bg, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${b.ticker}-football-field.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function selectMethod(m: string) {
    setTab(METHOD_TAB[m] ?? 'dcf');
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const pos52 = (b.price - b.market52.low) / (b.market52.high - b.market52.low || 1);

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-32 sm:px-6 lg:pb-24">
      {/* ---------------------------------------------------------- Ticker header */}
      <section className="animate-fadeup pt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="num flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/30 to-brand/5 text-base font-bold text-white">
              {b.ticker.slice(0, 4)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-ink">{b.name}</h1>
                {live ? (
                  <Badge tone="live">
                    <LiveDot /> Live SEC EDGAR
                  </Badge>
                ) : (
                  <Badge tone="snap">Offline snapshot</Badge>
                )}
              </div>
              <div className="mt-1 text-[13px] text-mute">
                <span className="num text-sub">NYSE/NASDAQ: {b.ticker}</span>
                {ds.company.sicDescription && <> · {ds.company.sicDescription}</>}
                {' · '}CIK {ds.company.cik} · XBRL as of {date(ds.company.balance.end)} · Price {ds.market.source}
              </div>
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={copyLink} className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink">
              {copied ? '✓ Link copied' : 'Copy scenario link'}
            </button>
            <button type="button" onClick={downloadSvg} className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink">
              Download chart SVG
            </button>
            <Link
              href={`/t/${b.ticker}/tearsheet${query}`}
              target="_blank"
              className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6]"
            >
              Export pitchbook tear sheet ↗
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-2xl border border-line bg-panel/70 px-5 py-4 sm:grid-cols-4 lg:grid-cols-8">
          <Stat label="Share price" value={price(b.price)} sub={ds.market.source.startsWith('Snapshot') ? `as of ${ds.market.asOf}` : 'last close / live'} />
          <Stat label="Market cap" value={money(b.marketCap)} sub={`${(b.shares / 1e9).toFixed(2)}B shares`} />
          <Stat label="Net debt" value={money(b.netDebt)} sub={b.netDebt < 0 ? 'net cash' : 'debt − cash − ST inv.'} />
          <Stat label="Enterprise value" value={money(b.currentEV)} sub="market cap + net debt" />
          <Stat label={`${b.ltmLabel} revenue`} value={money(b.ltmRevenue)} sub={`${pct(b.histGrowth)} blended growth`} />
          <Stat label={`${b.ltmLabel} EBITDA`} value={money(b.ltmEbitda)} sub={`${pct(b.ltmEbitda / b.ltmRevenue)} margin`} />
          <Stat label="EV / LTM EBITDA" value={mult(b.currentEV / b.ltmEbitda)} sub={`Beta ${b.beta.toFixed(2)}`} />
          <div className="min-w-0">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-mute">52-week range</div>
            {ds.market.closes.length > 1 ? (
              <Sparkline values={ds.market.closes} width={128} height={26} color="auto" />
            ) : (
              <div className="relative mt-3 h-1.5 rounded bg-line">
                <span className="absolute -top-1 h-3.5 w-1 rounded bg-mark" style={{ left: `${Math.max(0, Math.min(1, pos52)) * 100}%` }} />
              </div>
            )}
            <div className="num mt-1 flex justify-between text-[11px] text-mute">
              <span>{price(b.market52.low)}</span>
              <span>{price(b.market52.high)}</span>
            </div>
          </div>
        </div>

        {ds.warnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {ds.warnings.map((w) => (
              <div key={w} className="rounded-xl border border-amber/25 bg-amber/5 px-4 py-2 text-[12px] leading-relaxed text-amber">
                {w}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- Controls + football field */}
      <section className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside ref={asideRef} className="order-2 scroll-mt-20 lg:order-1">
          <div className="rounded-2xl border border-line bg-panel/80 p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">What-if controls</h2>
              <span className="text-[10.5px] text-mute">chart updates instantly</span>
            </div>
            <Sliders a={a} defaults={defaults} ranges={ranges} onChange={onChange} onReset={() => setA(defaults)} />
          </div>
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          <div className="glow overflow-hidden rounded-2xl bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-ink">What is {b.name} worth? Five ways to answer</h2>
                <p className="mt-0.5 text-xs text-mute">The &ldquo;football field&rdquo; chart bankers use to put several valuations side by side.</p>
              </div>
              <div className="flex rounded-xl border border-line bg-bg/60 p-1 text-xs">
                {(
                  [
                    ['price', 'Per share'],
                    ['ev', 'Whole company (EV)'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-lg px-3 py-1.5 font-medium transition ${mode === k ? 'bg-brand text-white' : 'text-sub hover:text-ink'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Verdict
              name={b.name}
              price={price(b.price)}
              above={rows.filter((r) => r.median < current).length}
              total={rows.length}
              composite={price(run.compositePrice)}
              upside={upside}
            />
            <ReadingKey priceMode={mode === 'price'} />
            <div className="px-1 py-3">
              <FootballField
                rows={rows}
                current={current}
                currentLabel={mode === 'price' ? 'Current' : 'Current EV'}
                composite={conv(run.compositeEV)}
                format={fmt}
                axisFormat={axisFmt}
                alt={altFmt}
                altLabel={mode === 'price' ? 'EV' : 'Per share'}
                onSelect={selectMethod}
              />
            </div>
            <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
              <Summary label="Middle-of-the-road value" value={price(run.compositePrice)} sub="median of the five methods (amber line)" accent />
              <Summary label="vs. today's price" value={signedPct(upside)} sub={upside >= 0 ? 'stock looks cheap vs. the methods' : 'stock looks expensive vs. the methods'} tone={upside >= 0 ? 'up' : 'down'} />
              <Summary label="Cash-flow (DCF) value" value={price(evToPrice(b, run.ranges.find((r) => r.methodology === 'Discounted Cash Flow')!.median))} sub={`WACC ${pct(a.wacc, 2)} · g ${pct(a.terminalGrowth, 2)}`} />
              <Summary
                label="Buyout-fund floor"
                value={run.lbo ? price(evToPrice(b, run.lbo.entryEv)) : '—'}
                sub={run.lbo ? `${mult(run.lbo.entryMultiple)} entry · ${pct(a.lboTargetIrr, 0)} IRR` : 'not solvable'}
              />
            </div>
          </div>

          {/* --------------------------------------------------------------- Tabs */}
          <div ref={tabsRef} className="scroll-mt-20">
            <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel/60 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition ${tab === t.id ? 'bg-raised text-ink shadow-inner ring-1 ring-line' : 'text-mute hover:text-sub'}`}
                >
                  {t.label}
                  {t.id === 'memo' && <span className="ml-1.5 rounded bg-brand/20 px-1 py-px text-[9.5px] font-bold text-[#8DB4FF]">AI</span>}
                </button>
              ))}
            </div>
            <div key={tab} className="animate-fadeup">
              {tab === 'dcf' && <DcfTab b={b} a={a} run={run} wacc={wacc} />}
              {tab === 'sensitivity' && <SensitivityTab growth={sensG} exit={sensX} current={b.price} />}
              {tab === 'comps' && <CompsTab b={b} a={a} peers={ds.peers} peerBasis={ds.peerBasis} />}
              {tab === 'lbo' && <LboTab b={b} a={a} lbo={run.lbo} />}
              {tab === 'financials' && <FinancialsTab company={ds.company} />}
              {tab === 'memo' && <MemoTab ticker={b.ticker} a={a} />}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: keep the answer visible while dragging sliders further down the page. */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-mute">Middle-of-the-road value</div>
            <div className="num text-lg font-semibold text-[#8DB4FF]">
              {price(run.compositePrice)} <span className={`text-xs font-medium ${upside >= 0 ? 'text-up' : 'text-down'}`}>{signedPct(upside)}</span>
            </div>
          </div>
          <div className="num text-right text-[11px] text-sub">
            Price {price(b.price)}
            <div className="text-mute">WACC {pct(a.wacc, 2)}</div>
          </div>
          <button type="button" onClick={() => asideRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">
            Adjust
          </button>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value, sub, accent, tone }: { label: string; value: string; sub: string; accent?: boolean; tone?: 'up' | 'down' }) {
  return (
    <div className="bg-panel px-5 py-3.5">
      <div className="text-[10.5px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`num mt-1 text-xl font-semibold ${accent ? 'text-[#8DB4FF]' : tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-mute">{sub}</div>
    </div>
  );
}

function Verdict({ name, price: px, above, total, composite, upside }: { name: string; price: string; above: number; total: number; composite: string; upside: number }) {
  const rich = upside < -0.1;
  const cheap = upside > 0.1;
  return (
    <div className={`mx-5 mt-4 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed ${rich ? 'border-down/30 bg-down/5' : cheap ? 'border-up/30 bg-up/5' : 'border-line bg-raised/40'}`}>
      <span className="font-semibold text-ink">The short answer: </span>
      <span className="text-sub">
        {name} trades at <span className="num font-semibold text-ink">{px}</span>.{' '}
        {above === total
          ? 'All five methods put its value below that price'
          : above === 0
            ? 'All five methods put its value above that price'
            : `${above} of ${total} methods put its value below that price`}
        , and the middle-of-the-road estimate is <span className="num font-semibold text-ink">{composite}</span>
        {rich ? ', so the stock looks expensive on these assumptions: the market expects more growth or profit than the model does.' : cheap ? ', so the stock looks cheap on these assumptions.' : ', roughly in line with the market.'}{' '}
        Move the sliders on the left to test what you would have to believe to justify today&rsquo;s price.
      </span>
    </div>
  );
}

function ReadingKey({ priceMode }: { priceMode: boolean }) {
  const item = 'flex items-center gap-2';
  return (
    <div className="mx-5 mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-sub">
      <span className={item}>
        <span className="h-3 w-7 rounded bg-brand" /> Most likely range
      </span>
      <span className={item}>
        <span className="relative h-3 w-9">
          <span className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#64748B]" />
          <span className="absolute left-0 top-0 h-3 w-0.5 bg-[#64748B]" />
          <span className="absolute right-0 top-0 h-3 w-0.5 bg-[#64748B]" />
        </span>
        Full range (low to high)
      </span>
      <span className={item}>
        <span className="h-3 w-0.5 bg-white" /> Midpoint
      </span>
      <span className={item}>
        <span className="h-3.5 border-l-2 border-dashed border-mark" /> Today&rsquo;s {priceMode ? 'stock price' : 'market value'}
      </span>
      <span className={item}>
        <span className="h-3.5 border-l-2 border-dotted border-amber" /> Middle of all five
      </span>
      <span className="text-mute">Bars left of the green line say &ldquo;worth less than the price&rdquo;; bars to the right say &ldquo;worth more&rdquo;. Hover a bar for details, click it for the full math.</span>
    </div>
  );
}
