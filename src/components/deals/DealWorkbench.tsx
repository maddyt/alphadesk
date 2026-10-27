'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DealAssumptions, DealCompany, Rag } from '@/lib/deals/engine';
import { gridPremiumStock, gridPremiumSynergies, riskScorecard, runDeal, synergyMax, synergyStep } from '@/lib/deals/engine';
import { dealQuery } from '@/lib/deals/params';
import { money, mult, pct, price, signedPct } from '@/lib/format';
import type { LineItem } from '@/lib/types';
import { Badge, Card, LiveDot, td, th } from '../ui';
import { AuditModal } from '../workbench/FinancialsTab';
import { DealControls } from './DealControls';
import { DealHeatmap, Waterfall } from './DealCharts';
import { DealMemoTab } from './DealMemoTab';
import { waterSteps } from './steps';

const TABS = [
  { id: 'sensitivity', label: 'Sensitivity' },
  { id: 'terms', label: 'Deal terms' },
  { id: 'rationale', label: 'AI rationale' },
  { id: 'sec', label: 'SEC data' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const RAG: Record<Rag, { dot: string; ring: string; text: string; label: string }> = {
  green: { dot: 'bg-up', ring: 'border-up/40 bg-up/5', text: 'text-up', label: 'Low' },
  amber: { dot: 'bg-amber', ring: 'border-amber/40 bg-amber/5', text: 'text-amber', label: 'Medium' },
  red: { dot: 'bg-down', ring: 'border-down/40 bg-down/5', text: 'text-down', label: 'High' },
};

export function DealWorkbench({ A, T, defaults, initial, warnings }: { A: DealCompany; T: DealCompany; defaults: DealAssumptions; initial: DealAssumptions; warnings: string[] }) {
  const [a, setA] = useState<DealAssumptions>(initial);
  const [tab, setTab] = useState<Tab>('sensitivity');
  const [copied, setCopied] = useState(false);
  const [save, setSave] = useState<{ state: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ state: 'idle' });
  const controlsRef = useRef<HTMLDivElement>(null);

  const synMax = useMemo(() => synergyMax(T, A), [A, T]);
  const synStep = synergyStep(synMax);
  const r = useMemo(() => runDeal(A, T, a), [A, T, a]);
  const risk = useMemo(() => riskScorecard(A, T, a, r), [A, T, a, r]);
  const gSyn = useMemo(() => gridPremiumSynergies(A, T, a, synMax), [A, T, a, synMax]);
  const gStock = useMemo(() => gridPremiumStock(A, T, a), [A, T, a]);
  const query = dealQuery(a, defaults);
  const live = A.source === 'sec-live' && T.source === 'sec-live';

  useEffect(() => {
    window.history.replaceState(null, '', `${window.location.pathname}${query}`);
    setSave({ state: 'idle' });
  }, [query]);

  const accretive = r.accretion >= 0;

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function saveDeal() {
    setSave({ state: 'saving' });
    const res = await fetch('/api/deals/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acquirer: A.ticker, target: T.ticker, name: `${A.ticker} + ${T.ticker} @ ${pct(a.premium, 0)} premium`, query, accretion: r.accretion }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setSave(res?.ok ? { state: 'saved' } : { state: 'error', msg: json.error ?? 'Could not save' });
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pb-32 sm:px-6 lg:pb-24">
      {/* ---------------------------------------------------------------- Header */}
      <section className="animate-fadeup pt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
          <span className="font-semibold uppercase tracking-[0.14em] text-[#8DB4FF]">Hypothetical deal teardown</span>
          {live ? (
            <Badge tone="live">
              <LiveDot /> Live SEC EDGAR
            </Badge>
          ) : (
            <Badge tone="snap">Includes offline snapshot data</Badge>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            What if {A.name.replace(/,? Inc\.?$| Corporation$/, '')} bought {T.name.replace(/,? Inc\.?$| Corporation$/, '')}?
          </h1>
          <div className="no-print flex flex-wrap gap-2">
            <button type="button" onClick={copyLink} className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink">
              {copied ? '✓ Link copied' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={saveDeal}
              disabled={save.state === 'saving' || save.state === 'saved'}
              title={save.msg}
              className="rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-medium text-sub transition hover:border-brand/50 hover:text-ink disabled:opacity-60"
            >
              {save.state === 'saved' ? '✓ Saved' : save.state === 'saving' ? 'Saving…' : save.state === 'error' ? 'Save unavailable' : 'Save teardown'}
            </button>
            <Link
              href={`/deals/${A.ticker}/${T.ticker}/teaser${query}`}
              target="_blank"
              className="rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6]"
            >
              Export deal teaser ↗
            </Link>
          </div>
        </div>
        {save.state === 'error' && <p className="mt-2 text-xs text-amber">{save.msg}</p>}

        <div className="mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
          <CompanyCard c={A} role="Acquirer" />
          <div className="flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[#8DB4FF] md:rotate-0">
              <span className="md:hidden">↓</span>
              <span className="hidden md:inline">→</span>
            </div>
          </div>
          <CompanyCard c={T} role="Target" />
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {warnings.map((w) => (
              <div key={w} className="rounded-xl border border-amber/25 bg-amber/5 px-4 py-2 text-[12px] text-amber">
                {w}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside ref={controlsRef} className="order-2 scroll-mt-20 lg:order-1">
          <div className="rounded-2xl border border-line bg-panel/80 p-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Deal controls</h2>
              <span className="text-[10.5px] text-mute">updates instantly</span>
            </div>
            <DealControls
              a={a}
              defaults={defaults}
              synMax={synMax}
              synStep={synStep}
              breakeven={r.breakevenSynergies}
              maxPremium={r.maxPremium}
              acquirerCash={A.cash}
              equityPrice={r.equityPurchasePrice}
              onChange={setA}
              onReset={() => setA(defaults)}
            />
          </div>
        </aside>

        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {/* ------------------------------------------------------- Verdict */}
          <div className={`glow overflow-hidden rounded-2xl bg-panel`}>
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <div className={`p-5 sm:p-6 ${accretive ? 'bg-gradient-to-br from-up/15 to-transparent' : 'bg-gradient-to-br from-down/15 to-transparent'}`}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">Does the deal raise or lower {A.ticker}&rsquo;s earnings per share?</div>
                <div className={`num mt-2 text-5xl font-semibold tracking-tight sm:text-6xl ${accretive ? 'text-up' : 'text-down'}`}>{signedPct(r.accretion)}</div>
                <div className={`mt-1 text-sm font-semibold uppercase tracking-wider ${accretive ? 'text-up' : 'text-down'}`}>{accretive ? 'Accretive' : 'Dilutive'}</div>
                <p className="mt-3 text-[13.5px] leading-relaxed text-sub">
                  Paying <span className="num font-semibold text-ink">{price(r.offerPrice)}</span> a share ({pct(a.premium, 0)} above today&rsquo;s {price(T.price)}), or{' '}
                  <span className="num font-semibold text-ink">{money(r.equityPurchasePrice)}</span> in total, would {accretive ? 'raise' : 'lower'} {A.ticker}&rsquo;s earnings per share from{' '}
                  <span className="num text-ink">{price(r.standaloneEps)}</span> to <span className="num font-semibold text-ink">{price(r.proFormaEps)}</span> in the first year.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:border-l md:border-t-0">
                <Kpi
                  label="Synergies needed to break even"
                  value={money(r.breakevenSynergies, 0)}
                  sub={a.synergies >= r.breakevenSynergies ? `✓ you assume ${money(a.synergies, 0)}` : `✗ you assume ${money(a.synergies, 0)}`}
                  tone={a.synergies >= r.breakevenSynergies ? 'up' : 'down'}
                />
                <Kpi
                  label="Highest premium before dilution"
                  value={r.maxPremium === null ? 'None' : r.maxPremium >= 3 ? '>300%' : pct(r.maxPremium, 0)}
                  sub={r.maxPremium === null ? 'dilutive even at 0%' : `you offer ${pct(a.premium, 0)}`}
                  tone={r.maxPremium !== null && a.premium <= r.maxPremium ? 'up' : 'down'}
                />
                <Kpi label="Price paid vs. earnings" value={mult(r.multiples.evEbitda)} sub={`EV / EBITDA · ${mult(r.multiples.pe)} P/E`} />
                <Kpi label={`${T.ticker} holders end up owning`} value={pct(r.ownershipTarget, 1)} sub="of the combined company" />
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------- Waterfall */}
          <Card title="Where the combined profit comes from" subtitle="Net income bridge: what each piece of the deal adds or takes away (PRD synergy & pro-forma waterfall)">
            <Waterfall steps={waterSteps(A, T, r)} />
            <div className="num mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[12.5px] sm:grid-cols-4">
              <Mini label="Pro-forma net income" value={money(r.proFormaNetIncome)} />
              <Mini label="÷ Pro-forma shares" value={`${(r.proFormaShares / 1e9).toFixed(3)}B`} />
              <Mini label="New shares issued" value={`${(r.newShares / 1e6).toFixed(0)}M`} />
              <Mini label="= Pro-forma EPS" value={price(r.proFormaEps)} strong />
            </div>
          </Card>

          {/* --------------------------------------------------------- Risk */}
          <div>
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Deal risk scorecard</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {risk.map((x) => (
                <div key={x.id} className={`rounded-2xl border p-4 ${RAG[x.rating].ring}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-sub">{x.title}</span>
                    <span className={`flex items-center gap-1.5 text-[11px] font-bold ${RAG[x.rating].text}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${RAG[x.rating].dot}`} />
                      {x.id === 'eps' ? (x.rating === 'green' ? 'Good' : x.rating === 'amber' ? 'Neutral' : 'Weak') : RAG[x.rating].label}
                    </span>
                  </div>
                  <div className="mt-2 text-[13.5px] font-semibold leading-snug text-ink">{x.headline}</div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">{x.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* --------------------------------------------------------- Tabs */}
          <div>
            <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel/60 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium transition ${tab === t.id ? 'bg-raised text-ink ring-1 ring-line' : 'text-mute hover:text-sub'}`}
                >
                  {t.label}
                  {t.id === 'rationale' && <span className="ml-1.5 rounded bg-brand/20 px-1 py-px text-[9.5px] font-bold text-[#8DB4FF]">AI</span>}
                </button>
              ))}
            </div>
            <div key={tab} className="animate-fadeup">
              {tab === 'sensitivity' && (
                <div className="grid gap-5 2xl:grid-cols-2">
                  <Card title="Premium vs. synergies" subtitle="EPS accretion (green) or dilution (red) for each combination. Outlined cell = current scenario.">
                    <DealHeatmap g={gSyn} base={{ row: a.premium, col: a.synergies }} />
                  </Card>
                  <Card title="Premium vs. share of price paid in stock" subtitle="Remaining consideration keeps the current cash/debt split.">
                    <DealHeatmap g={gStock} base={{ row: a.premium, col: a.stockPct }} />
                  </Card>
                </div>
              )}
              {tab === 'terms' && <Terms A={A} T={T} a={a} r={r} />}
              {tab === 'rationale' && <DealMemoTab acquirer={A.ticker} target={T.ticker} query={query} />}
              {tab === 'sec' && <SecData A={A} T={T} />}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: keep the answer visible while dragging sliders further down the page. */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-mute">EPS impact</div>
            <div className={`num text-lg font-semibold ${accretive ? 'text-up' : 'text-down'}`}>
              {signedPct(r.accretion)} <span className="text-xs font-medium">{accretive ? 'accretive' : 'dilutive'}</span>
            </div>
          </div>
          <div className="num text-right text-[11px] text-sub">
            {price(r.standaloneEps)} → <span className="font-semibold text-ink">{price(r.proFormaEps)}</span>
            <div className="text-mute">
              {pct(a.premium, 0)} prem · {money(a.synergies, 0)} syn
            </div>
          </div>
          <button
            type="button"
            onClick={() => controlsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white"
          >
            Adjust
          </button>
        </div>
      </div>
    </div>
  );
}

function CompanyCard({ c, role }: { c: DealCompany; role: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/70 p-4">
      <div className="flex items-center gap-3">
        <div className="num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-gradient-to-br from-brand/30 to-brand/5 text-[13px] font-bold text-white">{c.ticker.slice(0, 4)}</div>
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mute">{role}</div>
          <div className="truncate font-semibold text-ink">{c.name}</div>
          <div className="truncate text-[11px] text-mute">{c.sicDescription ?? '—'}</div>
        </div>
      </div>
      <div className="num mt-3 grid grid-cols-4 gap-2 text-[11px]">
        <Fig k="Price" v={price(c.price)} />
        <Fig k="Mkt cap" v={money(c.marketCap)} />
        <Fig k="Net income" v={money(c.netIncome)} />
        <Fig k="EPS" v={price(c.eps)} />
      </div>
    </div>
  );
}

function Fig({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-sans text-[9.5px] uppercase tracking-wider text-mute">{k}</div>
      <div className="truncate text-[12.5px] font-semibold text-ink">{v}</div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'up' | 'down' }) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <div className="text-[10px] uppercase leading-tight tracking-wider text-mute">{label}</div>
      <div className="num mt-1 text-lg font-semibold text-ink">{value}</div>
      <div className={`mt-0.5 text-[11px] ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-mute'}`}>{sub}</div>
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="font-sans text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold ${strong ? 'text-[#8DB4FF]' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function Terms({ A, T, a, r }: { A: DealCompany; T: DealCompany; a: DealAssumptions; r: ReturnType<typeof runDeal> }) {
  const rows: [string, string, string?][] = [
    ['Offer price per share', price(r.offerPrice), `${pct(a.premium, 0)} premium to ${price(T.price)}`],
    ['Equity purchase price', money(r.equityPurchasePrice), `${T.ticker} market cap × (1 + premium)`],
    ['Plus: target net debt', money(T.netDebt), 'debt − cash − short-term investments'],
    ['Enterprise purchase price', money(r.enterprisePurchasePrice)],
    ['EV / LTM EBITDA', mult(r.multiples.evEbitda), `${T.ticker} trades at ${mult(T.enterpriseValue / T.ebitda)} today`],
    ['EV / LTM revenue', mult(r.multiples.evRevenue)],
    ['Price / earnings', mult(r.multiples.pe)],
  ];
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Transaction summary">
        <table className="w-full">
          <tbody>
            {rows.map(([k, v, note]) => (
              <tr key={k} className="border-b border-line/40">
                <td className={td}>
                  {k}
                  {note && <div className="text-[10.5px] text-mute">{note}</div>}
                </td>
                <td className={`${td} font-semibold text-ink`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Sources of funds">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>Source</th>
              <th className={th}>Mix</th>
              <th className={th}>Amount</th>
              <th className={th}>Year-1 cost</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line/40">
              <td className={td}>Cash on hand</td>
              <td className={td}>{pct(a.cashPct, 0)}</td>
              <td className={td}>{money(r.cashUsed)}</td>
              <td className={td}>{money(r.foregoneInterest)} lost interest</td>
            </tr>
            <tr className="border-b border-line/40">
              <td className={td}>New {A.ticker} shares</td>
              <td className={td}>{pct(a.stockPct, 0)}</td>
              <td className={td}>{money(r.stockIssued)}</td>
              <td className={td}>{(r.newShares / 1e6).toFixed(0)}M shares @ {price(A.price)}</td>
            </tr>
            <tr className="border-b border-line/40">
              <td className={td}>New debt</td>
              <td className={td}>{pct(a.debtPct, 0)}</td>
              <td className={td}>{money(r.newDebt)}</td>
              <td className={td}>{money(r.afterTaxInterest)} after-tax interest</td>
            </tr>
            <tr>
              <td className={`${td} font-semibold text-ink`}>Total</td>
              <td className={td}>100%</td>
              <td className={`${td} font-semibold text-ink`}>{money(r.equityPurchasePrice)}</td>
              <td className={td} />
            </tr>
          </tbody>
        </table>
        <div className="mt-5 grid grid-cols-2 gap-4 text-[12.5px]">
          <Split title="Ownership after the deal" a={r.ownershipAcquirer} labels={[`${A.ticker} holders`, `${T.ticker} holders`]} />
          <Split title="Share of combined earnings" a={r.contributionAcquirer} labels={[A.ticker, T.ticker]} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mute">
          If target holders get a bigger share of the company than they contribute in earnings, the deal tends to be dilutive (and vice versa).
        </p>
      </Card>
    </div>
  );
}

function Split({ title, a, labels }: { title: string; a: number; labels: [string, string] }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-mute">{title}</div>
      <div className="flex h-3 overflow-hidden rounded-full">
        <span className="bg-brand" style={{ width: `${Math.max(0, Math.min(1, a)) * 100}%` }} />
        <span className="flex-1 bg-mark" />
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-sub">
        <span>
          {labels[0]} {pct(a, 0)}
        </span>
        <span>
          {labels[1]} {pct(1 - a, 0)}
        </span>
      </div>
    </div>
  );
}

function SecData({ A, T }: { A: DealCompany; T: DealCompany }) {
  const [sel, setSel] = useState<{ c: DealCompany; item: LineItem; label: string } | null>(null);
  const keys = ['netIncome', 'revenue', 'ebitda', 'cash', 'debt', 'shares'] as const;
  const names: Record<(typeof keys)[number], string> = { netIncome: 'Net income (LTM)', revenue: 'Revenue (LTM)', ebitda: 'EBITDA (LTM)', cash: 'Cash & ST investments', debt: 'Total debt', shares: 'Shares outstanding' };
  return (
    <>
      <Card title="Inputs pulled from SEC EDGAR" subtitle="Click a figure to see its XBRL tag, filing and accession number.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[420px]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Line item</th>
                <th className={th}>{A.ticker}</th>
                <th className={th}>{T.ticker}</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} className="border-b border-line/40">
                  <td className={`${td} text-ink`}>{names[k]}</td>
                  {[A, T].map((c) => {
                    const it = c.audit[k];
                    const v = k === 'shares' ? `${(c.shares / 1e6).toFixed(0)}M` : money(k === 'cash' ? c.cash : k === 'ebitda' ? c.ebitda : (it?.value ?? NaN));
                    return (
                      <td key={c.ticker} className={td}>
                        {it ? (
                          <button
                            type="button"
                            onClick={() => setSel({ c, item: it, label: `${c.ticker} · ${names[k]}` })}
                            className="rounded px-1 py-0.5 text-sub underline decoration-line decoration-dotted underline-offset-4 hover:bg-brand/15 hover:text-ink"
                          >
                            {v}
                          </button>
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-b border-line/40">
                <td className={`${td} text-ink`}>Share price</td>
                <td className={td}>{price(A.price)}</td>
                <td className={td}>{price(T.price)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-mute">
          Prices: {A.priceSource} / {T.priceSource}. Cash includes short-term investments.
        </p>
      </Card>
      {sel && <AuditModal cik={sel.c.cik} live={sel.c.source === 'sec-live'} sel={{ item: sel.item, period: sel.label }} onClose={() => setSel(null)} />}
    </>
  );
}
