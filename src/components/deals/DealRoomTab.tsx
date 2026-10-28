'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AgentId, RiskReport, RoomEvent, SynergyReport } from '@/lib/agents/room';
import type { AuditOut } from '@/lib/agents/schemas';
import type { PhaseRow, VerifiedCite } from '@/lib/agents/verify';
import { freshRoom as fresh, hasResults, loadRun, reduceRoom as reduce, roomFromEvents, saveRunLocal, type RoomState, type RunSummary, type SavedRun } from '@/lib/agents/room-state';
import { money, pct, signedPct } from '@/lib/format';
import { Badge, Card } from '../ui';

type Mode = 'focused' | 'whole';

const AGENTS: { id: AgentId; name: string; does: string }[] = [
  { id: 'audit', name: 'Model Audit', does: 'Checks every XBRL input, period and adjustment behind the EPS math' },
  { id: 'synergy', name: 'Synergy & Market', does: 'Reads both annual reports and sizes cost and revenue synergies' },
  { id: 'risk', name: 'Risk & Governance', does: 'Investigates the target through the SEC EDGAR MCP tools' },
];

export function DealRoomTab({ acquirer, target, query, currentSynergies, onApplySynergies }: { acquirer: string; target: string; query: string; currentSynergies: number; onApplySynergies: (v: number) => void }) {
  const [mode, setMode] = useState<Mode>('focused');
  const [s, setS] = useState<RoomState>(fresh);
  const [saved, setSaved] = useState<SavedRun | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Bring back the last run for this pair (this browser first, else the server copy).
  useEffect(() => {
    let live = true;
    loadRun(acquirer, target).then((run) => {
      if (!live || !run || !hasResults(run.events)) return;
      setSaved(run);
      setMode(run.mode);
      setS((p) => (p.status === 'idle' ? roomFromEvents(run.events) : p));
    });
    return () => {
      live = false;
    };
  }, [acquirer, target]);

  async function run(refresh = false) {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setS({ ...fresh(), status: 'running' });
    const events: RoomEvent[] = [];
    const persist = () => {
      if (!hasResults(events)) return;
      const stored = events.find((e): e is Extract<RoomEvent, { type: 'saved' }> => e.type === 'saved');
      const run: SavedRun = {
        v: 1,
        id: stored?.id ?? undefined,
        acquirer,
        target,
        query: query.replace(/^\?/, ''),
        mode,
        savedAt: stored?.savedAt ?? new Date().toISOString(),
        events: events.filter((e) => e.type !== 'saved'),
      };
      saveRunLocal(run);
      setSaved(run);
    };
    try {
      const res = await fetch('/api/deals/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acquirer, target, query: query.replace(/^\?/, ''), mode, refresh }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const l of lines) {
          if (!l.trim()) continue;
          const e = JSON.parse(l) as RoomEvent;
          events.push(e);
          setS((p) => reduce(p, e));
        }
      }
      setS((p) => (p.status === 'running' ? { ...p, status: 'done' } : p));
      persist();
    } catch (e) {
      persist(); // keep whatever the agents finished before the stream broke
      if ((e as Error).name !== 'AbortError') setS((p) => ({ ...p, status: 'error', message: (e as Error).message }));
    }
  }

  const running = s.status === 'running';
  return (
    <div className="space-y-5">
      <Card
        title={
          <span className="flex items-center gap-2">
            AI Deal Room <span className="rounded bg-brand/20 px-1.5 py-px text-[10px] font-bold text-[#8DB4FF]">3 AGENTS · MCP</span>
          </span>
        }
        subtitle="Three Claude agents work the deal in parallel, straight from the SEC filings. The engine still does every EPS calculation."
        right={s.start?.cached ? <Badge tone="brand">Cached result (24h)</Badge> : undefined}
      >
        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0">
            <p className="max-w-2xl text-[13px] leading-relaxed text-sub">
              Like handing the deal to a junior team: one analyst checks the model, one reads both annual reports to size synergies, and one digs through EDGAR for red flags. Every quote they
              cite is matched against the filing text and shown with its accession number and line, so you can check it in one click.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-xl border border-line bg-raised/50 p-1 text-[12px]" role="radiogroup" aria-label="Reading depth">
                {(
                  [
                    ['focused', 'Focused read', 'Items 1 & 7 + segment note'],
                    ['whole', 'Whole filing', 'Both full annual reports'],
                  ] as const
                ).map(([id, label, sub]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    disabled={running}
                    onClick={() => setMode(id)}
                    className={`rounded-lg px-3 py-1.5 text-left transition ${mode === id ? 'bg-panel text-ink ring-1 ring-line' : 'text-mute hover:text-sub'}`}
                  >
                    <div className="font-semibold">{label}</div>
                    <div className="text-[10.5px] text-mute">{sub}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => run(false)}
                disabled={running}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6] disabled:opacity-60"
              >
                {running ? 'Agents working…' : s.status === 'done' ? 'Run again' : 'Convene the deal team'}
              </button>
              {s.status === 'done' && s.start?.cached && (
                <button type="button" onClick={() => run(true)} className="text-xs text-[#8DB4FF] hover:underline">
                  Force a fresh run
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-mute">
              {mode === 'whole' ? 'Whole-filing mode sends both complete annual reports to Claude: typically $1–2 per run and 2–4 minutes.' : 'Focused mode reads the business, MD&A and segment sections: typically under $1 and 1–2 minutes.'}{' '}
              Results are cached for 24 hours per scenario.
            </p>
          </div>
          <McpCallout />
        </div>
        {saved && !running && <SavedBar run={saved} />}
        {!running && (
          <RunHistory
            acquirer={acquirer}
            target={target}
            current={saved?.id}
            refreshKey={saved?.savedAt}
            onOpen={(run) => {
              setSaved(run);
              setMode(run.mode);
              setS(roomFromEvents(run.events));
            }}
          />
        )}
        {s.status === 'needs_key' && <Notice tone="amber">{s.message}</Notice>}
        {s.status === 'error' && <Notice tone="down">{s.message}</Notice>}
      </Card>

      {s.status !== 'idle' && s.status !== 'needs_key' && (
        <>
          <Progress s={s} />
          {s.audit && <AuditCard a={s.audit} />}
          {s.synergy && <SynergyCards syn={s.synergy.data} phase={s.synergy.phase} current={currentSynergies} onApply={onApplySynergies} />}
          {s.risk && <RiskCards r={s.risk} />}
          {s.usage && (
            <p className="num text-right text-[11px] text-mute">
              {fmtTok(s.usage.usage.input + s.usage.usage.cacheRead + s.usage.usage.cacheWrite)} input + {fmtTok(s.usage.usage.output)} output tokens · est. ${s.usage.costUsd.toFixed(2)} · {s.usage.model}
              {s.ms ? ` · ${(s.ms / 1000).toFixed(0)}s` : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function teaserHref(run: { acquirer: string; target: string; query: string; id?: string }) {
  const q = new URLSearchParams(run.query);
  if (run.id) q.set('room', run.id);
  const qs = q.toString();
  return `/deals/${run.acquirer}/${run.target}/teaser${qs ? `?${qs}` : ''}`;
}

function SavedBar({ run }: { run: SavedRun }) {
  const [copied, setCopied] = useState(false);
  const teaser = teaserHref(run);
  async function share() {
    await navigator.clipboard.writeText(new URL(teaser, window.location.origin).toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  function download() {
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dealpulse-${run.acquirer}-${run.target}-deal-room-${run.savedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-mark/30 bg-mark/5 px-4 py-2.5 text-[12px]">
      <span className="text-mark">
        ✓ Saved {new Date(run.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · included in the deal teaser export
      </span>
      <Link href={teaser} target="_blank" className="font-semibold text-[#8DB4FF] hover:underline">
        Export teaser with AI findings ↗
      </Link>
      {run.id && (
        <button type="button" onClick={share} className="text-[#8DB4FF] hover:underline" title="Anyone with the link can open this run's teaser, on any device">
          {copied ? '✓ Link copied' : 'Copy share link'}
        </button>
      )}
      <button type="button" onClick={download} className="text-[#8DB4FF] hover:underline">
        Download full results (JSON)
      </button>
    </div>
  );
}

/** Earlier runs for this pair, stored in Supabase `deal_room_runs`. Hidden when Supabase is not configured. */
function RunHistory({ acquirer, target, current, refreshKey, onOpen }: { acquirer: string; target: string; current?: string; refreshKey?: string; onOpen: (run: SavedRun) => void }) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/deals/room?acquirer=${encodeURIComponent(acquirer)}&target=${encodeURIComponent(target)}&list=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { runs?: RunSummary[] } | null) => setRuns(j?.runs ?? []))
      .catch(() => setRuns([]));
  }, [acquirer, target, refreshKey]);
  if (runs.length < 2) return null;
  async function open(id: string) {
    setOpening(id);
    const run = await loadRun(acquirer, target, id);
    setOpening(null);
    if (run) onOpen(run);
  }
  return (
    <details className="mt-3 rounded-xl border border-line bg-raised/30 px-4 py-2 text-[12px]">
      <summary className="cursor-pointer text-sub">Run history ({runs.length})</summary>
      <div className="-mx-4 mt-2 overflow-x-auto">
        <table className="num w-full min-w-[520px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-mute">
              <th className="px-4 py-1 font-medium">When</th>
              <th className="py-1 font-medium">Mode</th>
              <th className="py-1 text-right font-medium">Cost synergies</th>
              <th className="py-1 text-right font-medium">HSR</th>
              <th className="py-1 text-right font-medium">Risks</th>
              <th className="py-1 text-right font-medium">Run cost</th>
              <th className="px-4 py-1" />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className={`border-t border-line/50 ${r.id === current ? 'text-ink' : 'text-sub'}`}>
                <td className="px-4 py-1.5 font-sans">
                  {new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  {r.status === 'partial' && <span className="ml-1.5 text-amber">partial</span>}
                </td>
                <td className="py-1.5 font-sans">{r.mode}</td>
                <td className="py-1.5 text-right">{r.cost_synergies != null ? money(Number(r.cost_synergies)) : '—'}</td>
                <td className="py-1.5 text-right">{r.hsr_score ?? '—'}</td>
                <td className="py-1.5 text-right">{r.risk_count ?? '—'}</td>
                <td className="py-1.5 text-right">${Number(r.cost_usd).toFixed(2)}</td>
                <td className="px-4 py-1.5 text-right font-sans">
                  {r.id === current ? (
                    <span className="text-mark">showing</span>
                  ) : (
                    <button type="button" onClick={() => open(r.id)} className="text-[#8DB4FF] hover:underline" disabled={opening === r.id}>
                      {opening === r.id ? 'Opening…' : 'Open'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

function Notice({ tone, children }: { tone: 'amber' | 'down'; children: React.ReactNode }) {
  return <div className={`mt-4 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${tone === 'amber' ? 'border-amber/40 bg-amber/5 text-amber' : 'border-down/40 bg-down/5 text-down'}`}>{children}</div>;
}

function McpCallout() {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-raised/40 p-4 text-[12px] leading-relaxed text-sub">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mark">SEC EDGAR MCP server</div>
      <p className="mt-1.5">The Risk agent&rsquo;s tools are served over the Model Context Protocol at <code className="text-ink">/api/mcp</code>. Plug the same tools into Claude Code or Claude Desktop:</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre rounded-lg bg-black/30 px-3 py-2 text-[11px] text-ink">claude mcp add --transport http sec-edgar {typeof window !== 'undefined' ? window.location.origin : 'https://<app>'}/api/mcp</pre>
    </div>
  );
}

// ------------------------------------------------------------------ Progress

function Progress({ s }: { s: RoomState }) {
  return (
    <Card
      title="Agent activity"
      subtitle={s.start ? `${s.start.acquirer} acquires ${s.start.target} · ${s.start.mode === 'whole' ? 'whole-filing read' : 'focused read'} · est. ${fmtTok(s.start.estimate.inputTokens)} input tokens (~$${s.start.estimate.costUsd.toFixed(2)})` : 'Gathering filings from SEC EDGAR…'}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {AGENTS.map((ag) => {
          const st = s.agents[ag.id];
          return (
            <div key={ag.id} className={`rounded-xl border p-3.5 ${st.status === 'done' ? 'border-up/40 bg-up/5' : st.status === 'error' ? 'border-down/40 bg-down/5' : st.status === 'running' ? 'border-brand/40 bg-brand/5' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{ag.name}</span>
                <span className={`text-[11px] font-medium ${st.status === 'done' ? 'text-up' : st.status === 'error' ? 'text-down' : st.status === 'running' ? 'text-[#8DB4FF]' : 'text-mute'}`}>
                  {st.status === 'done' ? `✓ ${((st.ms ?? 0) / 1000).toFixed(0)}s` : st.status === 'error' ? 'Failed' : st.status === 'running' ? 'Working…' : 'Queued'}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-mute">{ag.does}</p>
              {st.status === 'running' && (
                <div className="mt-2.5 h-1 overflow-hidden rounded bg-line">
                  <div className="h-full w-1/2 animate-scan rounded bg-brand" />
                </div>
              )}
              {st.message && <p className="mt-2 text-[11px] text-down">{st.message}</p>}
            </div>
          );
        })}
      </div>
      {s.start && s.start.docs.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {s.start.docs.map((d) => (
            <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="num rounded-lg border border-line bg-raised/50 px-2.5 py-1 text-[11px] text-sub hover:border-brand/50 hover:text-ink">
              {d.label} · {d.accessionNumber} · {fmtTok(d.chars)} chars ↗
            </a>
          ))}
        </div>
      )}
      {s.tools.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">MCP tool calls · Risk agent</div>
          <ol className="num max-h-56 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-3 text-[11.5px]">
            {s.tools.map((t, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                <span className={t.ok ? 'text-up' : 'text-down'}>{t.ok ? '✓' : '✗'}</span>
                <span className="text-[#8DB4FF]">{t.name}</span>
                <span className="min-w-0 truncate text-mute">{JSON.stringify(t.input)}</span>
                <span className="ml-auto text-mute">
                  {t.chars ? `${fmtTok(t.chars)} chars · ` : ''}
                  {t.ms}ms
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Citations

export function CiteBadge({ c }: { c: VerifiedCite }) {
  const [open, setOpen] = useState(false);
  const src = c.source;
  return (
    <span className="inline-block max-w-full align-top">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`num inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] ${c.verified ? 'border-mark/40 bg-mark/10 text-mark' : 'border-amber/40 bg-amber/10 text-amber'}`}
        title={c.verified ? 'Quote found verbatim in the filing' : 'Quote could not be matched to the filing text'}
      >
        <span>{c.verified ? '✓' : '⚠'}</span>
        <span className="truncate">{c.verified && src ? `${src.label}${src.accessionNumber ? ` · ${src.accessionNumber}` : ''} · line ${c.line}` : 'unverified quote'}</span>
      </button>
      {open && (
        <span className="mt-1.5 block rounded-lg border border-line bg-raised/60 px-3 py-2 text-[11.5px] italic leading-relaxed text-sub">
          &ldquo;{c.quote}&rdquo;
          {src?.url && (
            <a href={src.url} target="_blank" rel="noreferrer" className="ml-1 not-italic text-[#8DB4FF] hover:underline">
              Open filing ↗
            </a>
          )}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ Audit

const SEV = { info: 'text-sub border-line', warning: 'text-amber border-amber/40', critical: 'text-down border-down/40' } as const;

function AuditCard({ a }: { a: AuditOut }) {
  const v = { clean: ['Clean', 'live'], minor_issues: ['Minor issues', 'snap'], material_issues: ['Material issues', 'snap'] } as const;
  return (
    <Card title="Model Audit" subtitle={a.summary} right={<Badge tone={v[a.verdict][1]}>{v[a.verdict][0]}</Badge>}>
      {a.findings.length === 0 ? (
        <p className="text-[13px] text-sub">No findings.</p>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2">
          {a.findings.map((f, i) => (
            <li key={i} className={`rounded-xl border px-3.5 py-2.5 ${SEV[f.severity]}`}>
              <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
                {f.title}
                <span className="text-[10px] uppercase tracking-wider">{f.severity}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-sub">{f.detail}</p>
              {f.factIds.length > 0 && <div className="num mt-1.5 text-[10.5px] text-mute">{f.factIds.join(' · ')}</div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ Synergy

function SynergyCards({ syn, phase, current, onApply }: { syn: SynergyReport; phase: PhaseRow[]; current: number; onApply: (v: number) => void }) {
  const max = Math.max(...syn.costSynergies.map((c) => c.runRateUsd), 1);
  const applied = Math.abs(current - syn.totalCost) < 1;
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Synergy & Market"
          subtitle={syn.overlapSummary}
          right={
            <button
              type="button"
              disabled={applied || syn.totalCost <= 0}
              onClick={() => onApply(syn.totalCost)}
              className="rounded-lg border border-brand/50 bg-brand/10 px-3 py-1.5 text-[11.5px] font-semibold text-[#8DB4FF] hover:bg-brand/20 disabled:opacity-50"
            >
              {applied ? '✓ Using agent estimate' : `Use ${money(syn.totalCost)} in the model`}
            </button>
          }
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Kpi label="Cost synergies (run-rate)" value={money(syn.totalCost)} />
            <Kpi label="Revenue synergies" value={money(syn.totalRevenue)} />
            <Kpi label="Confidence" value={`${syn.confidence}/100`} />
          </div>
          <ul className="space-y-3">
            {syn.costSynergies.map((c, i) => (
              <li key={i}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="font-medium text-ink">{c.area}</span>
                  <span className="num text-sub">{money(c.runRateUsd)}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-line/60">
                  <div className="h-full rounded bg-gradient-to-r from-brand to-mark" style={{ width: `${(c.runRateUsd / max) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-mute">{c.rationale}</p>
                <CiteBadge c={c.cite} />
              </li>
            ))}
          </ul>
          {syn.revenueSynergies.length > 0 && (
            <div className="mt-5 border-t border-line/60 pt-4">
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">Revenue synergies (not in EPS math)</div>
              <ul className="space-y-2">
                {syn.revenueSynergies.map((r, i) => (
                  <li key={i} className="text-[12px] text-sub">
                    <span className="font-medium text-ink">{r.area}</span> · <span className="num">{money(r.runRateUsd)}</span> — {r.rationale} <CiteBadge c={r.cite} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-mute">
            <span className="font-semibold text-sub">Method:</span> {syn.methodology}
          </p>
        </Card>
        <div className="min-w-0 space-y-5">
          <Card title="Synergy phase-in → EPS" subtitle="Engine re-run for years 1–3 with synergies ramping as the agent expects.">
            <PhaseChart rows={phase} />
          </Card>
          <Card title="Antitrust & regional overlap" right={<HsrGauge score={syn.hsrRisk.score} />}>
            <p className="text-[12px] leading-relaxed text-sub">{syn.hsrRisk.rationale}</p>
            {syn.regionalOverlap.length > 0 && <RegionGrid rows={syn.regionalOverlap} />}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-raised/40 px-3 py-2">
      <div className="truncate text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className="num mt-0.5 text-[16px] font-semibold text-ink">{value}</div>
    </div>
  );
}

function PhaseChart({ rows }: { rows: PhaseRow[] }) {
  const W = 360;
  const H = 190;
  const pad = { l: 44, r: 12, t: 14, b: 34 };
  const vals = rows.flatMap((r) => [r.agentAccretion, r.sliderAccretion, 0]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 0.01;
  const y = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const bw = (W - pad.l - pad.r) / rows.length;
  const x = (i: number) => pad.l + bw * i + bw / 2;
  const line = (k: 'agentAccretion' | 'sliderAccretion') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r[k])}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="EPS accretion by year as synergies phase in">
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="rgb(var(--line))" />
        <text x={pad.l - 6} y={y(0) + 3} textAnchor="end" className="fill-mute text-[9px]">0%</text>
        {[hi, lo].filter((v) => Math.abs(v) > span * 0.12).map((v) => (
          <text key={v} x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="num fill-mute text-[9px]">{signedPct(v, 1)}</text>
        ))}
        {rows.map((r, i) => {
          const v = r.agentAccretion;
          return (
            <g key={r.year}>
              <rect x={x(i) - bw * 0.22} width={bw * 0.44} y={Math.min(y(v), y(0))} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={3} className={v >= 0 ? 'fill-up/70' : 'fill-down/70'} />
              <text x={x(i)} y={H - pad.b + 14} textAnchor="middle" className="fill-sub text-[10px]">Year {r.year}</text>
              <text x={x(i)} y={H - pad.b + 26} textAnchor="middle" className="num fill-mute text-[9px]">{pct(r.phase, 0)} of run-rate</text>
              <text x={x(i)} y={(v >= 0 ? y(v) - 5 : y(v) + 12)} textAnchor="middle" className="num fill-ink text-[10px] font-semibold">{signedPct(v, 1)}</text>
            </g>
          );
        })}
        <path d={line('sliderAccretion')} fill="none" stroke="rgb(var(--brand))" strokeWidth={2} strokeDasharray="4 3" />
        {rows.map((r, i) => (
          <circle key={r.year} cx={x(i)} cy={y(r.sliderAccretion)} r={3} className="fill-brand" />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-mute">
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-up/70" />Agent synergies, phased</span>
        <span><span className="mr-1 inline-block h-0 w-4 border-t-2 border-dashed border-brand align-middle" />Your slider synergies, same phasing</span>
      </div>
    </div>
  );
}

function HsrGauge({ score }: { score: number }) {
  const tone = score >= 4 ? 'bg-down' : score >= 3 ? 'bg-amber' : 'bg-up';
  return (
    <div className="flex items-center gap-2" title="HSR / antitrust risk, 1 (low) to 5 (high)">
      <span className="text-[10.5px] uppercase tracking-wider text-mute">HSR risk</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-3 w-2.5 rounded-sm ${i <= score ? tone : 'bg-line'}`} />
        ))}
      </span>
      <span className="num text-[12px] font-semibold text-ink">{score}/5</span>
    </div>
  );
}

const LEVEL = { none: 0, low: 1, medium: 2, high: 3 } as const;

function RegionGrid({ rows }: { rows: SynergyReport['regionalOverlap'] }) {
  return (
    <table className="mt-3 w-full text-[11.5px]">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-mute">
          <th className="py-1 text-left font-medium">Region</th>
          <th className="py-1 text-left font-medium">Acquirer</th>
          <th className="py-1 text-left font-medium">Target</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.region} className="border-t border-line/50">
            <td className="py-1.5 text-sub">{r.region}</td>
            {[r.acquirerPresence, r.targetPresence].map((p, i) => (
              <td key={i} className="py-1.5">
                <span className="flex gap-0.5" title={p}>
                  {[1, 2, 3].map((k) => (
                    <span key={k} className={`h-2 w-4 rounded-sm ${k <= LEVEL[p] ? (i ? 'bg-mark' : 'bg-brand') : 'bg-line'}`} />
                  ))}
                </span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ------------------------------------------------------------------ Risk

const CAT_COLOR: Record<string, string> = {
  regulatory: '#F59E0B',
  integration: '#60A5FA',
  financial: '#F87171',
  legal: '#C084FC',
  governance: '#34D399',
  market: '#22D3EE',
  people: '#F472B6',
};

function RiskCards({ r }: { r: RiskReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const RAGC = { green: 'bg-up', amber: 'bg-amber', red: 'bg-down' } as const;
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
      <Card title="Risk matrix" subtitle="Likelihood × impact. Hover a dot to find the risk.">
        <RiskMatrix risks={r.risks} hover={hover} setHover={setHover} />
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-mute">
          {[...new Set(r.risks.map((x) => x.category))].map((c) => (
            <span key={c}>
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: CAT_COLOR[c] }} />
              {c}
            </span>
          ))}
        </div>
        {r.governance.length > 0 && (
          <div className="mt-5 border-t border-line/60 pt-4">
            <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">Governance · insiders {r.insiderSentiment}</div>
            <ul className="space-y-1.5">
              {r.governance.map((g, i) => (
                <li key={i} className="flex gap-2 text-[12px]">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RAGC[g.rag]}`} />
                  <span>
                    <span className="font-medium text-ink">{g.item}:</span> <span className="text-sub">{g.assessment}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <Card title="Risk & Governance" subtitle={r.summary}>
        <ol className="space-y-3">
          {r.risks.map((x, i) => (
            <li
              key={i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={`rounded-xl border px-3.5 py-2.5 transition ${hover === i ? 'border-brand/60 bg-brand/5' : 'border-line'}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="num flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-black" style={{ background: CAT_COLOR[x.category] }}>
                  {i + 1}
                </span>
                <span className="font-semibold text-ink">{x.title}</span>
                <span className="num ml-auto text-[10.5px] text-mute">
                  L{x.likelihood} × I{x.impact}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-sub">{x.detail}</p>
              <CiteBadge c={x.cite} />
            </li>
          ))}
        </ol>
        {r.antitrustNotes && (
          <p className="mt-4 text-[11.5px] leading-relaxed text-mute">
            <span className="font-semibold text-sub">Antitrust:</span> {r.antitrustNotes}
          </p>
        )}
        {r.parachutes?.status === 'ok' && (
          <p className="num mt-2 text-[11.5px] text-mute">
            Golden parachutes (verified in DEF 14A): {money(r.parachutes.verifiedTotal)} across {r.parachutes.executives.length} executives.
          </p>
        )}
      </Card>
    </div>
  );
}

function RiskMatrix({ risks, hover, setHover }: { risks: RiskReport['risks']; hover: number | null; setHover: (i: number | null) => void }) {
  const S = 300;
  const pad = 30;
  const cell = (S - pad) / 5;
  const heat = (l: number, i: number) => {
    const s = l * i;
    return s >= 15 ? 'rgb(var(--down) / 0.28)' : s >= 8 ? 'rgb(var(--amber) / 0.2)' : 'rgb(var(--up) / 0.12)';
  };
  // Spread dots that share a cell.
  const seen = new Map<string, number>();
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="mx-auto w-full max-w-[360px]" role="img" aria-label="Risk matrix">
      {[1, 2, 3, 4, 5].map((l) =>
        [1, 2, 3, 4, 5].map((im) => <rect key={`${l}-${im}`} x={pad + (im - 1) * cell + 1} y={(5 - l) * cell + 1} width={cell - 2} height={cell - 2} rx={4} fill={heat(l, im)} />),
      )}
      <text x={pad + (S - pad) / 2} y={S - 4} textAnchor="middle" className="fill-mute text-[10px]">Impact →</text>
      <text x={10} y={(S - pad) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(S - pad) / 2})`} className="fill-mute text-[10px]">Likelihood →</text>
      {risks.map((r, i) => {
        const k = `${r.likelihood}-${r.impact}`;
        const n = seen.get(k) ?? 0;
        seen.set(k, n + 1);
        const cx = pad + (r.impact - 0.5) * cell + ((n % 3) - 1) * 14;
        const cy = (5 - r.likelihood + 0.5) * cell + (Math.floor(n / 3) * 14 - (n >= 3 ? 7 : 0));
        return (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
            <circle cx={cx} cy={cy} r={hover === i ? 11 : 9} fill={CAT_COLOR[r.category]} stroke={hover === i ? 'white' : 'none'} strokeWidth={2} />
            <text x={cx} y={cy + 3.5} textAnchor="middle" className="num fill-black text-[10px] font-bold">
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
