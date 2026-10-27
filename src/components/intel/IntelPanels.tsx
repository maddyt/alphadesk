'use client';

import { useEffect, useState } from 'react';
import type { Intel } from '@/lib/types';
import type { ProxyResult } from '@/lib/ai/proxy';
import type { SegmentBreakdown, YieldCurve } from '@/lib/sec/parsers';
import { filingUrl } from '@/lib/sec/links';
import { date, money, pct } from '@/lib/format';
import { Badge, Card } from '../ui';
import { useWidth } from '../charts/useWidth';

/** Extended SEC feeds load after the page so they never slow down the first render. */
export function useIntel(ticker: string) {
  const [intel, setIntel] = useState<Intel | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`/api/intel/${encodeURIComponent(ticker)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && setIntel(j))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [ticker]);
  return { intel, loading };
}

export const RAG_STYLE = {
  green: { dot: 'bg-up', text: 'text-up', ring: 'border-up/40 bg-up/5' },
  amber: { dot: 'bg-amber', text: 'text-amber', ring: 'border-amber/40 bg-amber/5' },
  red: { dot: 'bg-down', text: 'text-down', ring: 'border-down/40 bg-down/5' },
} as const;

const AXIS_NAME: Record<SegmentBreakdown['axis'], string> = { product: 'Product / service', business: 'Business segment', geography: 'Geography' };
export const axisName = (a: SegmentBreakdown['axis']) => AXIS_NAME[a];

const SEG_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#A78BFA', '#F472B6', '#22D3EE', '#94A3B8'];

/** One horizontal 100% bar per breakdown plus a legend table. */
export function SegmentMix({ b, title }: { b: SegmentBreakdown; title?: string }) {
  const sum = b.lines.reduce((s, l) => s + l.value, 0);
  const lines = b.lines.length > 7 ? [...b.lines.slice(0, 6), { member: 'other', label: 'Other', value: b.lines.slice(6).reduce((s, l) => s + l.value, 0) }] : b.lines;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-sub">{title ?? axisName(b.axis)}</span>
        <span className="num text-[11px] text-mute">{money(sum)}</span>
      </div>
      <div className="flex h-4 overflow-hidden rounded-full ring-1 ring-line">
        {lines.map((l, i) => (
          <span key={l.member} title={`${l.label}: ${money(l.value)}`} style={{ width: `${(l.value / sum) * 100}%`, background: SEG_COLORS[i % SEG_COLORS.length] }} />
        ))}
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {lines.map((l, i) => (
          <div key={l.member} className="flex items-center justify-between gap-2 text-[12px]">
            <span className="flex min-w-0 items-center gap-1.5 text-sub">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SEG_COLORS[i % SEG_COLORS.length] }} />
              <span className="truncate">{l.label}</span>
            </span>
            <span className="num shrink-0 text-ink">
              {pct(l.value / sum, 0)} <span className="text-mute">· {money(l.value)}</span>
            </span>
          </div>
        ))}
      </div>
      {!b.reconciles && <p className="mt-1 text-[10.5px] text-amber">Lines do not sum exactly to reported revenue (eliminations or untagged items).</p>}
    </div>
  );
}

export function InsiderPanel({ intel }: { intel: Intel }) {
  const s = intel.insiders;
  if (!s) return <Empty title="Insider trades (Form 4)" note={intel.fpi ? 'Foreign private issuers are exempt from Section 16, so executives do not file Form 4.' : intel.source === 'snapshot' ? 'Live SEC access needed.' : 'Not available.'} />;
  const tone = s.signal === 'buying' ? 'green' : s.signal === 'selling' ? 'amber' : 'green';
  return (
    <Card title="Insider trades · Form 4, last 12 months" subtitle={`${s.filings} filings scanned. Open-market buys (code P) and sales (code S) only; grants and option exercises excluded.`}>
      <div className="grid grid-cols-3 gap-3">
        <Mini label="Open-market buys" value={money(s.buys)} sub={`${s.buyers} insiders`} tone="up" />
        <Mini label="Open-market sales" value={money(s.sells)} sub={`${s.sellers} insiders`} tone="down" />
        <div className={`rounded-xl border px-3 py-2 ${RAG_STYLE[tone].ring}`}>
          <div className="text-[10px] uppercase tracking-wider text-mute">C-suite signal</div>
          <div className={`mt-1 text-sm font-semibold capitalize ${RAG_STYLE[tone].text}`}>{s.signal === 'neutral' ? 'No clear signal' : `Net ${s.signal}`}</div>
        </div>
      </div>
      {s.trades.length > 0 && (
        <div className="-mx-5 mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-[12px]">
            <tbody>
              {s.trades.slice(0, 8).map((t, i) => (
                <tr key={i} className="border-b border-line/40">
                  <td className="px-5 py-1.5 text-ink">
                    {t.owner}
                    <div className="text-[10.5px] text-mute">{t.title}</div>
                  </td>
                  <td className="num px-2 text-mute">{t.date}</td>
                  <td className={`px-2 font-semibold ${t.code === 'P' ? 'text-up' : 'text-down'}`}>{t.code === 'P' ? 'Buy' : 'Sell'}</td>
                  <td className="num px-5 text-right text-ink">{money(t.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function OwnershipPanel({ intel }: { intel: Intel }) {
  const o = intel.ownership;
  if (!o) return <Empty title="Large holders (13D / 13G)" note={intel.source === 'snapshot' ? 'Live SEC access needed.' : 'Not available.'} />;
  const activists = o.filter((f) => f.activist);
  return (
    <Card
      title="Large holders · Schedule 13D / 13G, last 24 months"
      subtitle="Filed by anyone crossing 5% ownership. 13D means the holder may seek to influence control (activist); 13G is passive."
      right={activists.length ? <Badge tone="snap">⚠ {activists.length} activist (13D)</Badge> : <Badge tone="live">No activist filings</Badge>}
    >
      {o.length === 0 ? (
        <p className="text-[13px] text-sub">No 5%+ ownership filings in the last 24 months.</p>
      ) : (
        <div className="space-y-1.5">
          {o.map((f) => (
            <div key={f.accessionNumber} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 pb-1.5 text-[12.5px]">
              <span className="min-w-0 text-ink">
                {f.activist && <span className="mr-1.5 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber">ACTIVIST</span>}
                {f.filer}
              </span>
              <span className="num text-[11px] text-mute">
                {f.form} · {f.filingDate} ·{' '}
                <a className="text-mark hover:underline" href={filingUrl(intel.cik, f.accessionNumber)} target="_blank" rel="noreferrer">
                  filing ↗
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-mute">
        Quarterly 13F institutional holdings are reported by each fund, not by the company, so they can&rsquo;t be looked up per ticker from SEC EDGAR without a licensed aggregator.
      </p>
    </Card>
  );
}

export function GovernancePanel({ intel }: { intel: Intel }) {
  const g = intel.governance;
  if (!g) return <Empty title="Accounting & governance (8-K)" note={intel.source === 'snapshot' ? 'Live SEC access needed.' : 'Not available.'} />;
  const st = RAG_STYLE[g.rating];
  const serious = g.flags.filter((f) => f.severity !== 'info');
  return (
    <Card
      title={`Accounting audit scorecard · ${intel.fpi ? '20-F amendments and late filings' : '8-K and amendments'}, last ${g.months} months`}
      subtitle="Item 4.02 (restatement / non-reliance) is a red flag; Item 4.01 (auditor change), amended reports and late filings are amber."
      right={
        <span className={`flex items-center gap-1.5 text-xs font-bold ${st.text}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
          {g.rating === 'green' ? 'Clean' : g.rating === 'amber' ? 'Watch' : 'Red flag: valuation penalty risk'}
        </span>
      }
    >
      {g.flags.length === 0 ? (
        <p className="text-[13px] text-sub">No auditor changes, restatements, amended reports or late filings.</p>
      ) : (
        <div className="space-y-1.5">
          {[...serious, ...g.flags.filter((f) => f.severity === 'info').slice(0, 4)].map((f) => (
            <div key={f.accessionNumber + f.code} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/40 pb-1.5 text-[12.5px]">
              <span className="flex items-center gap-2 text-ink">
                <span className={`h-2 w-2 rounded-full ${f.severity === 'red' ? 'bg-down' : f.severity === 'amber' ? 'bg-amber' : 'bg-mute'}`} />
                {f.title}
              </span>
              <span className="num text-[11px] text-mute">
                {f.code} · {f.filingDate} ·{' '}
                <a className="text-mark hover:underline" href={filingUrl(intel.cik, f.accessionNumber)} target="_blank" rel="noreferrer">
                  filing ↗
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Appendix C: golden-parachute extraction, run on demand because it reads a large proxy with Claude. */
export function ParachutePanel({ ticker, intel, applied, onApply }: { ticker: string; intel: Intel; applied: number; onApply?: (total: number) => void }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' } | { status: 'done'; r: ProxyResult }>({ status: 'idle' });
  async function run() {
    setState({ status: 'loading' });
    const r = await fetch(`/api/proxy/${encodeURIComponent(ticker)}`, { method: 'POST' })
      .then((x) => x.json())
      .catch(() => ({ status: 'error', message: 'Request failed', executives: [], verifiedTotal: 0 }));
    setState({ status: 'done', r });
  }
  const r = state.status === 'done' ? state.r : null;
  return (
    <Card
      title="Change-of-control payouts · DEF 14A proxy"
      subtitle="Golden-parachute severance and accelerated equity for named executives if the company is acquired."
      right={intel.proxy ? <a className="text-xs text-[#8DB4FF] hover:underline" href={intel.proxy.url} target="_blank" rel="noreferrer">Proxy filed {date(intel.proxy.filingDate)} ↗</a> : undefined}
    >
      {!r && (
        <div>
          <p className="text-[13px] leading-relaxed text-sub">
            Claude reads the proxy&rsquo;s &ldquo;potential payments upon termination or change in control&rdquo; table and returns it in a strict schema. Every dollar figure must appear verbatim in
            the filing or it is excluded.
          </p>
          <button
            type="button"
            onClick={run}
            disabled={state.status === 'loading' || !intel.proxy}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {state.status === 'loading' ? 'Reading proxy statement…' : intel.proxy ? 'Extract golden parachutes' : intel.fpi ? 'Not applicable (foreign filer)' : 'No proxy available'}
          </button>
        </div>
      )}
      {r && r.status !== 'ok' && <p className="text-[13px] text-amber">{r.message}</p>}
      {r && r.status === 'ok' && (
        <div>
          <div className="text-[11px] text-mute">Scenario: {r.scenario}</div>
          <div className="-mx-5 mt-2 overflow-x-auto">
            <table className="w-full min-w-[460px] text-[12px]">
              <thead>
                <tr className="border-b border-line text-right text-[10px] uppercase tracking-wider text-mute">
                  <th className="px-5 py-1 text-left font-medium">Executive</th>
                  <th className="px-2 font-medium">Cash</th>
                  <th className="px-2 font-medium">Equity</th>
                  <th className="px-5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.executives.map((e) => (
                  <tr key={e.name} className="num border-b border-line/40 text-right">
                    <td className="px-5 py-1.5 text-left font-sans text-ink">
                      {e.name}
                      <div className="text-[10.5px] text-mute">{e.title}</div>
                    </td>
                    <td className="px-2 text-sub">{money(e.cashSeverance)}</td>
                    <td className="px-2 text-sub">{money(e.equityAcceleration)}</td>
                    <td className={`px-5 font-semibold ${e.verified ? 'text-ink' : 'text-down line-through'}`} title={e.verified ? 'Found verbatim in the filing' : 'Not found in the filing text: excluded'}>
                      {money(e.total)} {e.verified ? '✓' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="num text-sm text-ink">
              Verified total <span className="font-semibold">{money(r.verifiedTotal)}</span>
            </div>
            {onApply && (
              <button
                type="button"
                onClick={() => onApply(applied > 0 ? 0 : r.verifiedTotal)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${applied > 0 ? 'border border-line text-sub' : 'bg-mark text-black'}`}
              >
                {applied > 0 ? 'Remove from valuation' : 'Apply as transaction cost'}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export function YieldCurveChart({ curve }: { curve: YieldCurve }) {
  const [ref, width] = useWidth<HTMLDivElement>(320);
  const pts = curve.points;
  if (pts.length < 3) return null;
  const h = 110;
  const pad = 22;
  const lo = Math.min(...pts.map((p) => p.rate)) - 0.002;
  const hi = Math.max(...pts.map((p) => p.rate)) + 0.002;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (width - 2 * pad);
  const y = (r: number) => 10 + (1 - (r - lo) / (hi - lo)) * (h - 34);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.rate)}`).join('');
  const ten = pts.findIndex((p) => p.tenor === '10Y');
  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="U.S. Treasury yield curve">
        <path d={d} fill="none" stroke="#3B82F6" strokeWidth={2} />
        {pts.map((p, i) => (
          <g key={p.tenor}>
            <circle cx={x(i)} cy={y(p.rate)} r={i === ten ? 4.5 : 2.5} fill={i === ten ? '#10B981' : '#3B82F6'} />
            {(i % 2 === 0 || i === ten) && (
              <text x={x(i)} y={h - 6} textAnchor="middle" fontSize={9.5} fill={i === ten ? '#10B981' : '#6B7689'}>
                {p.tenor}
              </text>
            )}
          </g>
        ))}
        {ten >= 0 && (
          <text x={x(ten)} y={y(pts[ten].rate) - 8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#10B981">
            {pct(pts[ten].rate, 2)}
          </text>
        )}
      </svg>
    </div>
  );
}

function Mini({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-line bg-raised/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`num mt-1 text-sm font-semibold ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'}`}>{value}</div>
      <div className="text-[10.5px] text-mute">{sub}</div>
    </div>
  );
}

function Empty({ title, note }: { title: string; note: string }) {
  return (
    <Card title={title}>
      <p className="text-[13px] text-mute">{note}</p>
    </Card>
  );
}
