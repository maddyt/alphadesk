'use client';

import { useState } from 'react';
import type { Assumptions } from '@/lib/engine/model';
import type { MemoResult } from '@/lib/ai/memo';
import { Badge, Card } from '../ui';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; result: MemoResult };

const STEPS = ['Recomputing valuation server-side', 'Building the verified fact sheet', 'Drafting with Claude under a Zod schema', 'Checking every figure against the engine'];

export function MemoTab({ ticker, a }: { ticker: string; a: Assumptions }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [step, setStep] = useState(0);

  async function run() {
    setState({ status: 'loading' });
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2200);
    try {
      const res = await fetch('/api/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker, assumptions: a }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setState({ status: 'done', result: json });
    } catch (e) {
      setState({ status: 'error', message: (e as Error).message });
    } finally {
      clearInterval(timer);
    }
  }

  if (state.status !== 'done') {
    return (
      <Card title="AI analyst memo" subtitle="Narrative only: the model never does arithmetic.">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3 text-[13px] leading-relaxed text-sub">
            <p>
              Generic LLMs predict tokens rather than calculate, which is how numbers get hallucinated. Here the valuation engine computes every figure deterministically; Claude
              receives only that fact sheet and must return JSON matching a strict Zod schema, citing each figure by id.
            </p>
            <p>Before the memo is shown, a verifier scans the prose for every $, %, and x figure and matches it against the engine output. Anything unmatched is flagged in red.</p>
            <button
              type="button"
              onClick={run}
              disabled={state.status === 'loading'}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6] disabled:opacity-60"
            >
              {state.status === 'loading' ? 'Generating…' : 'Generate memo for the current scenario'}
            </button>
            {state.status === 'error' && <p className="text-down">{state.message}</p>}
          </div>
          <ol className="space-y-2.5">
            {STEPS.map((s, i) => {
              const active = state.status === 'loading' && i === step;
              const done = state.status === 'loading' && i < step;
              return (
                <li key={s} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] transition ${active ? 'border-brand/60 bg-brand/10 text-ink' : done ? 'border-mark/30 text-sub' : 'border-line text-mute'}`}>
                  <span className={`num flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${done ? 'bg-mark text-black' : active ? 'bg-brand text-white' : 'bg-raised'}`}>{done ? '✓' : i + 1}</span>
                  {s}
                  {active && <span className="ml-auto h-1.5 w-12 overflow-hidden rounded bg-line"><span className="block h-full w-1/2 animate-scan rounded bg-brand" /></span>}
                </li>
              );
            })}
          </ol>
        </div>
      </Card>
    );
  }

  const { result } = state;
  const m = result.memo;
  const verified = result.numbers.filter((n) => n.verified).length;
  const citedOk = result.citations.filter((c) => c.ok).length;
  const allOk = verified === result.numbers.length && citedOk === result.citations.length;
  const pos = { premium: 'Trading at a premium to the intrinsic range', within: 'Trading within the intrinsic range', discount: 'Trading at a discount to the intrinsic range' }[result.positioning];

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
      <Card
        title={<span className="text-base">{m.headline}</span>}
        subtitle={pos}
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
          <Section title="Key takeaways">
            <ul className="space-y-1.5">
              {m.keyTakeaways.map((t, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                  <span>
                    <Highlight text={t} checks={result.numbers} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="By methodology">
            <div className="space-y-2">
              {m.methodologyCommentary.map((c) => (
                <div key={c.methodology} className="rounded-xl border border-line bg-raised/40 px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8DB4FF]">{c.methodology}</div>
                  <div className="mt-1">
                    <Highlight text={c.comment} checks={result.numbers} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Risks & sensitivities">
              <ul className="list-disc space-y-1.5 pl-4">
                {m.risks.map((r, i) => (
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

      <div className="space-y-5">
        <Card title="Numerical guardrail" subtitle="Every figure in the prose, matched against the engine">
          <div className={`mb-4 rounded-xl border px-4 py-3 ${allOk ? 'border-mark/40 bg-mark/10' : 'border-down/40 bg-down/10'}`}>
            <div className={`num text-2xl font-semibold ${allOk ? 'text-mark' : 'text-down'}`}>
              {verified}/{result.numbers.length}
            </div>
            <div className="text-xs text-sub">figures traced to deterministic engine output</div>
            <div className="num mt-1 text-xs text-sub">
              {citedOk}/{result.citations.length} schema citations exact
            </div>
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
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">{title}</div>
      {children}
    </div>
  );
}

/** Underlines verified figures in green and unverified ones in red. */
function Highlight({ text, checks }: { text: string; checks: { token: string; verified: boolean }[] }) {
  const tokens = [...new Set(checks.map((c) => c.token))].sort((a, b) => b.length - a.length);
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const status = new Map(checks.map((c) => [c.token, c.verified]));
  return (
    <>
      {text.split(re).map((part, i) =>
        status.has(part) ? (
          <span key={i} className={`num rounded px-0.5 font-semibold ${status.get(part) ? 'bg-mark/10 text-mark' : 'bg-down/15 text-down'}`}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
