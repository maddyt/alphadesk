'use client';

import { useEffect, useState } from 'react';
import { ScaleToFit } from '../ScaleToFit';
import type { RiskReport } from '@/lib/agents/room';
import { hasResults, loadRun, roomFromEvents, type RoomState, type SavedRun } from '@/lib/agents/room-state';
import type { VerifiedCite } from '@/lib/agents/verify';
import { money, pct, signedPct } from '@/lib/format';

// AI Deal Room pages for the printable teaser: the latest saved run for the pair
// (this browser first, else the server copy), laid out on US Letter pages.

const W = 816;
const H = 1056;
const NAVY = '#0F1A33';
const CAT: Record<string, string> = { regulatory: '#D97706', integration: '#2563EB', financial: '#DC2626', legal: '#7C3AED', governance: '#059669', market: '#0891B2', people: '#DB2777' };
const RAG = { green: '#16A34A', amber: '#D97706', red: '#DC2626' } as const;

export function DealRoomExport({ acquirer, target, query, backHref, runId }: { acquirer: string; target: string; query: string; backHref: string; runId?: string }) {
  const [state, setState] = useState<{ status: 'loading' } | { status: 'none' } | { status: 'ok'; run: SavedRun; s: RoomState }>({ status: 'loading' });
  useEffect(() => {
    loadRun(acquirer, target, runId).then((run) => setState(run && hasResults(run.events) ? { status: 'ok', run, s: roomFromEvents(run.events) } : { status: 'none' }));
  }, [acquirer, target, runId]);

  if (state.status === 'loading') return <p className="no-print mx-auto mt-6 max-w-[816px] text-center text-sm text-[#3F4A5A]">Loading AI Deal Room findings…</p>;
  if (state.status === 'none')
    return (
      <div className="no-print mx-auto mt-6 max-w-[816px] rounded-xl border border-dashed border-[#9AA6B8] bg-white px-5 py-4 text-sm text-[#3F4A5A]">
        No AI Deal Room run is saved for {acquirer} + {target} yet.{' '}
        <a href={`${backHref}#room`} className="font-semibold text-[#1D4ED8] hover:underline">
          Run the agents on the deal page
        </a>{' '}
        and they&rsquo;ll be added here as pages 2 and 3.
      </div>
    );

  const { run, s } = state;
  const sameScenario = run.query === query.replace(/^\?/, '');
  return (
    <>
      {!sameScenario && (
        <p className="no-print mx-auto mt-6 max-w-[816px] rounded-lg bg-[#FEF3C7] px-4 py-2 text-[12px] text-[#92400E]">
          The AI findings below were run on a different scenario (slider settings) than page 1. Phase-in EPS figures reflect the scenario at the time of the run.
        </p>
      )}
      <div className="mx-auto mt-6 max-w-[816px] print:mt-0">
        <ScaleToFit width={W} height={H}>
          <SynergyPage run={run} s={s} />
        </ScaleToFit>
      </div>
      <div className="mx-auto mt-6 max-w-[816px] print:mt-0">
        <ScaleToFit width={W} height={H}>
          <RiskPage run={run} s={s} />
        </ScaleToFit>
      </div>
    </>
  );
}

function Page({ run, s, title, n, children }: { run: SavedRun; s: RoomState; title: string; n: number; children: React.ReactNode }) {
  const docs = s.start?.docs ?? [];
  return (
    <section className="page flex flex-col overflow-hidden bg-white text-[#0B1220] shadow-xl" style={{ width: W, height: H }}>
      <header className="px-10 pb-4 pt-5 text-white" style={{ background: NAVY }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#9DB7F5]">AI Deal Room · {title}</div>
            <h1 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight">
              {run.acquirer} <span className="text-[#9DB7F5]">+</span> {run.target}: agent findings
            </h1>
          </div>
          <div className="text-right text-[10px] leading-relaxed text-[#9DB7F5]">
            Run {new Date(run.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            <br />
            {run.mode === 'whole' ? 'Whole-filing read' : 'Focused read'} · {s.usage?.model ?? 'Claude'}
            <br />
            Page {n} of 3
          </div>
        </div>
        {docs.length > 0 && (
          <div className="num mt-2.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[9.5px] text-[#C7D5F5]">
            {docs.map((d) => (
              <span key={d.id}>
                {d.label} filed {d.filingDate} · {d.accessionNumber}
              </span>
            ))}
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-10 pt-5">{children}</div>
      <footer className="border-t border-[#DFE4EB] px-10 py-2.5 text-[8.5px] leading-relaxed text-[#6B7689]">
        AI-generated analysis by Claude agents reading SEC EDGAR filings. Quotes marked ✓ were matched word-for-word against the cited filing (accession number and line shown); ⚠ marks a quote that
        could not be matched. EPS figures come from the deterministic DealPulse engine, not the model.
        {s.usage ? ` Run cost ≈ $${s.usage.costUsd.toFixed(2)}.` : ''} Hypothetical transaction for educational purposes; not investment advice.
      </footer>
    </section>
  );
}

function H2({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 flex items-baseline justify-between border-b-2 pb-1 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: NAVY, color: NAVY }}>
      {children}
      {right && <span className="text-[10px] font-semibold normal-case tracking-normal text-[#3F4A5A]">{right}</span>}
    </h3>
  );
}

function Src({ c }: { c: VerifiedCite }) {
  return c.verified ? (
    <span className="num text-[9.5px] text-[#047857]">
      ✓ {c.source?.label}
      {c.source?.accessionNumber ? ` · ${c.source.accessionNumber}` : ''} · line {c.line}
    </span>
  ) : (
    <span className="text-[9.5px] text-[#B45309]">⚠ quote not matched</span>
  );
}

function Missing({ what, s, id }: { what: string; s: RoomState; id: 'audit' | 'synergy' | 'risk' }) {
  const a = s.agents[id];
  return <p className="text-[11px] italic text-[#6B7689]">{what} did not finish in this run{a.message ? `: ${a.message}` : '.'}</p>;
}

// ------------------------------------------------------------------ Page 2

function SynergyPage({ run, s }: { run: SavedRun; s: RoomState }) {
  const syn = s.synergy?.data;
  const phase = s.synergy?.phase ?? [];
  const audit = s.audit;
  return (
    <Page run={run} s={s} title="Synergies & model audit" n={2}>
      {syn ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              ['Cost synergies (run-rate)', money(syn.totalCost)],
              ['Revenue synergies', money(syn.totalRevenue)],
              ['Agent confidence', `${syn.confidence}/100`],
              ['HSR / antitrust risk', `${syn.hsrRisk.score}/5`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-[#DFE4EB] px-3 py-2">
                <div className="text-[9px] uppercase tracking-wider text-[#6B7689]">{k}</div>
                <div className="num mt-0.5 text-[17px] font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <p className="line-clamp-2 text-[11px] leading-snug text-[#3F4A5A]">{syn.overlapSummary}</p>

          <div>
            <H2>Cost synergies by source</H2>
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-[#6B7689]">
                  <th className="py-1 text-left font-semibold">Area &amp; evidence</th>
                  <th className="py-1 text-right font-semibold">Run-rate</th>
                  <th className="py-1 text-right font-semibold">Y1 / Y2 / Y3</th>
                </tr>
              </thead>
              <tbody>
                {syn.costSynergies.slice(0, 6).map((c, i) => (
                  <tr key={i} className="border-t border-[#E3E7ED] align-top">
                    <td className="py-1.5 pr-3">
                      <div className="font-semibold">{c.area}</div>
                      <div className="line-clamp-1 text-[#3F4A5A]">{c.rationale}</div>
                      <div className="line-clamp-1 italic text-[#6B7689]">&ldquo;{c.cite.quote}&rdquo;</div>
                      <Src c={c.cite} />
                    </td>
                    <td className="num py-1.5 text-right font-semibold">{money(c.runRateUsd)}</td>
                    <td className="num whitespace-nowrap py-1.5 text-right text-[#3F4A5A]">
                      {pct(c.phaseIn.year1, 0)} / {pct(c.phaseIn.year2, 0)} / {pct(c.phaseIn.year3, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {syn.revenueSynergies.length > 0 && (
              <p className="mt-1 line-clamp-2 text-[10px] text-[#3F4A5A]">
                <span className="font-semibold">Revenue synergies (not in EPS):</span> {syn.revenueSynergies.map((r) => `${r.area} ${money(r.runRateUsd)}`).join(' · ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-[1.1fr_1fr] gap-6">
            <div>
              <H2>Synergy phase-in → EPS (engine re-run)</H2>
              <table className="num w-full text-[10.5px]">
                <thead>
                  <tr className="text-right text-[9px] uppercase tracking-wider text-[#6B7689]">
                    <th className="py-1 text-left font-semibold">Year</th>
                    <th className="py-1 font-semibold">Realised</th>
                    <th className="py-1 font-semibold">Synergies</th>
                    <th className="py-1 font-semibold">EPS impact</th>
                  </tr>
                </thead>
                <tbody>
                  {phase.map((r) => (
                    <tr key={r.year} className="border-t border-[#E3E7ED] text-right">
                      <td className="py-1 text-left font-sans">Year {r.year}</td>
                      <td className="py-1">{pct(r.phase, 0)}</td>
                      <td className="py-1">{money(r.agentSynergies)}</td>
                      <td className="py-1 font-semibold" style={{ color: r.agentAccretion >= 0 ? '#16A34A' : '#DC2626' }}>
                        {signedPct(r.agentAccretion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 line-clamp-3 text-[9.5px] leading-snug text-[#6B7689]">
                <span className="font-semibold">Method:</span> {syn.methodology}
              </p>
            </div>
            <div>
              <H2>Antitrust &amp; regional overlap</H2>
              <p className="line-clamp-3 text-[10.5px] leading-snug text-[#3F4A5A]">{syn.hsrRisk.rationale}</p>
              {syn.regionalOverlap.length > 0 && (
                <table className="mt-1.5 w-full text-[10px]">
                  <tbody>
                    {syn.regionalOverlap.slice(0, 5).map((r) => (
                      <tr key={r.region} className="border-t border-[#E3E7ED]">
                        <td className="py-0.5">{r.region}</td>
                        <td className="py-0.5 text-right text-[#3F4A5A]">
                          {run.acquirer} {r.acquirerPresence} · {run.target} {r.targetPresence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        <Missing what="The Synergy & Market agent" s={s} id="synergy" />
      )}

      <div className="min-h-0">
        <H2 right={audit ? audit.verdict.replace('_', ' ') : undefined}>Model audit</H2>
        {audit ? (
          <>
            <p className="line-clamp-2 text-[10.5px] text-[#3F4A5A]">{audit.summary}</p>
            <div className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-1">
              {audit.findings.slice(0, 6).map((f, i) => (
                <div key={i} className="text-[10px]">
                  <span className="font-semibold" style={{ color: f.severity === 'critical' ? '#DC2626' : f.severity === 'warning' ? '#B45309' : '#3F4A5A' }}>
                    {f.severity === 'info' ? '•' : '▲'} {f.title}
                  </span>
                  <span className="line-clamp-2 text-[#3F4A5A]">{f.detail}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Missing what="The Model Audit agent" s={s} id="audit" />
        )}
      </div>
    </Page>
  );
}

// ------------------------------------------------------------------ Page 3

function RiskPage({ run, s }: { run: SavedRun; s: RoomState }) {
  const r = s.risk;
  return (
    <Page run={run} s={s} title="Risk & governance" n={3}>
      {r ? (
        <>
          <p className="line-clamp-2 text-[11px] text-[#3F4A5A]">{r.summary}</p>
          <div className="grid grid-cols-[250px_1fr] gap-6">
            <div>
              <H2>Risk matrix</H2>
              <Matrix risks={r.risks.slice(0, 8)} />
              <div className="mt-1 flex flex-wrap gap-x-2.5 text-[9px] text-[#6B7689]">
                {[...new Set(r.risks.map((x) => x.category))].map((c) => (
                  <span key={c}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: CAT[c] }} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <H2>Governance · insiders {r.insiderSentiment}</H2>
              <div className="space-y-1">
                {r.governance.slice(0, 5).map((g, i) => (
                  <div key={i} className="flex gap-2 text-[10.5px]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: RAG[g.rag] }} />
                    <span className="line-clamp-2">
                      <span className="font-semibold">{g.item}:</span> <span className="text-[#3F4A5A]">{g.assessment}</span>
                    </span>
                  </div>
                ))}
              </div>
              {r.antitrustNotes && (
                <p className="mt-2 line-clamp-3 text-[10px] text-[#3F4A5A]">
                  <span className="font-semibold">Antitrust:</span> {r.antitrustNotes}
                </p>
              )}
              {r.parachutes?.status === 'ok' && (
                <p className="num mt-1 text-[10px] text-[#3F4A5A]">
                  <span className="font-sans font-semibold">Golden parachutes (DEF 14A, verified):</span> {money(r.parachutes.verifiedTotal)} across {r.parachutes.executives.length} executives
                </p>
              )}
            </div>
          </div>
          <div className="min-h-0">
            <H2>Risk register</H2>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-[#6B7689]">
                  <th className="w-6 py-1 text-left font-semibold">#</th>
                  <th className="py-1 text-left font-semibold">Risk &amp; evidence</th>
                  <th className="w-12 py-1 text-right font-semibold">L × I</th>
                </tr>
              </thead>
              <tbody>
                {r.risks.slice(0, 8).map((x, i) => (
                  <tr key={i} className="border-t border-[#E3E7ED] align-top">
                    <td className="py-1">
                      <span className="num inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: CAT[x.category] }}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-1 pr-2">
                      <span className="font-semibold">{x.title}</span> <span className="text-[#6B7689]">({x.category})</span>
                      <div className="line-clamp-1 text-[#3F4A5A]">{x.detail}</div>
                      <Src c={x.cite} />
                    </td>
                    <td className="num py-1 text-right font-semibold">
                      {x.likelihood} × {x.impact}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Missing what="The Risk & Governance agent" s={s} id="risk" />
      )}
      {s.tools.length > 0 && (
        <div className="mt-auto pb-3">
          <H2>SEC EDGAR MCP tool calls ({s.tools.length})</H2>
          <p className="num line-clamp-3 text-[9.5px] leading-relaxed text-[#3F4A5A]">
            {s.tools.map((t) => `${t.ok ? '✓' : '✗'} ${t.name}(${Object.values((t.input ?? {}) as Record<string, unknown>).join(', ')})`).join('  ·  ')}
          </p>
        </div>
      )}
    </Page>
  );
}

function Matrix({ risks }: { risks: RiskReport['risks'] }) {
  const S = 250;
  const pad = 22;
  const cell = (S - pad) / 5;
  const seen = new Map<string, number>();
  const heat = (l: number, i: number) => (l * i >= 15 ? '#FDE2E2' : l * i >= 8 ? '#FEF3C7' : '#E8F7EE');
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
      {[1, 2, 3, 4, 5].map((l) => [1, 2, 3, 4, 5].map((im) => <rect key={`${l}-${im}`} x={pad + (im - 1) * cell + 1} y={(5 - l) * cell + 1} width={cell - 2} height={cell - 2} rx={3} fill={heat(l, im)} />))}
      <text x={pad + (S - pad) / 2} y={S - 5} textAnchor="middle" fontSize={9} fill="#6B7689">
        Impact →
      </text>
      <text x={8} y={(S - pad) / 2} textAnchor="middle" fontSize={9} fill="#6B7689" transform={`rotate(-90 8 ${(S - pad) / 2})`}>
        Likelihood →
      </text>
      {risks.map((r, i) => {
        const k = `${r.likelihood}-${r.impact}`;
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        const cx = pad + (r.impact - 0.5) * cell + ((n % 3) - 1) * 12;
        const cy = (5 - r.likelihood + 0.5) * cell + (n >= 3 ? 10 : 0);
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={8} fill={CAT[r.category]} />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize={9} fontWeight={700} fill="white">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
