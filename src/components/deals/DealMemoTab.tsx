'use client';

import { useState } from 'react';
import type { DealMemoResult } from '@/lib/deals/memo';
import { Badge, Card } from '../ui';
import { Highlight, Section } from '../workbench/MemoTab';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; result: DealMemoResult };

export function DealMemoTab({ acquirer, target, query }: { acquirer: string; target: string; query: string }) {
  const [state, setState] = useState<State>({ status: 'idle' });

  async function run() {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/deals/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acquirer, target, query: query.replace(/^\?/, '') }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setState({ status: 'done', result: json });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    }
  }

  if (state.status !== 'done') {
    return (
      <Card title="AI deal rationale" subtitle="Why might this deal make sense? The AI writes the story; the engine owns every number.">
        <p className="max-w-2xl text-[13px] leading-relaxed text-sub">
          Claude drafts the strategic rationale, synergy sources and risks for the current scenario. It sees only the engine&rsquo;s figures and must return a strict schema, and every $, % and x it
          writes is checked against the engine before you see it.
        </p>
        <button
          type="button"
          onClick={run}
          disabled={state.status === 'loading'}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6] disabled:opacity-60"
        >
          {state.status === 'loading' ? 'Writing rationale…' : 'Generate deal rationale'}
        </button>
        {state.status === 'loading' && (
          <div className="mt-3 h-1.5 w-40 overflow-hidden rounded bg-line">
            <div className="h-full w-1/2 animate-scan rounded bg-brand" />
          </div>
        )}
        {state.status === 'error' && <p className="mt-3 text-sm text-down">{state.message}</p>}
      </Card>
    );
  }

  const { result } = state;
  const m = result.memo;
  const ok = result.numbers.filter((n) => n.verified).length;
  const allOk = ok === result.numbers.length && result.citations.every((c) => c.ok);
  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card
        title={<span className="text-base">{m.headline}</span>}
        subtitle="Hypothetical transaction"
        right={
          <div className="flex items-center gap-2">
            <Badge tone={result.mode === 'claude' ? 'brand' : 'snap'}>{result.mode === 'claude' ? `Claude · ${result.model}` : 'Template mode'}</Badge>
            <button type="button" onClick={run} className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-sub hover:text-ink">
              Regenerate
            </button>
          </div>
        }
      >
        {result.note && <p className="mb-4 rounded-lg border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-amber">{result.note}</p>}
        <div className="space-y-5 text-[13.5px] leading-relaxed text-sub">
          <p className="text-ink">
            <Highlight text={m.summary} checks={result.numbers} />
          </p>
          <Section title="Strategic rationale">
            <ul className="space-y-1.5">
              {m.strategicRationale.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span>
                    <Highlight text={t} checks={result.numbers} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Where the synergies could come from">
            <div className="grid gap-2 sm:grid-cols-2">
              {m.synergySources.map((s) => (
                <div key={s.area} className="rounded-xl border border-line bg-raised/40 px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8DB4FF]">{s.area}</div>
                  <div className="mt-1">
                    <Highlight text={s.description} checks={result.numbers} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Key risks">
              <ul className="list-disc space-y-1.5 pl-4">
                {m.keyRisks.map((r, i) => (
                  <li key={i}>
                    <Highlight text={r} checks={result.numbers} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Next diligence questions">
              <ul className="list-disc space-y-1.5 pl-4">
                {m.diligenceQuestions.map((r, i) => (
                  <li key={i}>
                    <Highlight text={r} checks={result.numbers} />
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      </Card>
      <Card title="Numerical guardrail" subtitle="Every figure in the text, matched against the engine">
        <div className={`mb-4 rounded-xl border px-4 py-3 ${allOk ? 'border-mark/40 bg-mark/10' : 'border-down/40 bg-down/10'}`}>
          <div className={`num text-2xl font-semibold ${allOk ? 'text-mark' : 'text-down'}`}>
            {ok}/{result.numbers.length}
          </div>
          <div className="text-xs text-sub">figures traced to the deterministic engine</div>
        </div>
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {result.numbers.map((n, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-[12px] hover:bg-raised/50">
              <span className={`num font-semibold ${n.verified ? 'text-ink' : 'text-down'}`}>{n.token}</span>
              <span className={`truncate text-right ${n.verified ? 'text-mute' : 'text-down'}`}>{n.verified ? n.matched : 'not in fact sheet'}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
