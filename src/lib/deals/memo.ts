import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FactEntry, NumberCheck } from '../ai/facts.ts';
import { verifyNumbers } from '../ai/facts.ts';
import { MODEL } from '../ai/memo.ts';

// Strategic rationale is the one place an LLM adds value to a teardown; it never
// does the math. It sees the engine's fact sheet, must answer in this schema, and
// every figure it writes is checked against the fact sheet.

export const DealMemoSchema = z.object({
  headline: z.string().describe('One-line deal takeaway, max ~14 words'),
  summary: z.string().describe('3-4 sentences: what is being bought, at what price, and the EPS outcome'),
  strategicRationale: z.array(z.string()).describe('3-4 bullets on why the combination could make sense'),
  synergySources: z.array(z.object({ area: z.string(), description: z.string() })).describe('2-4 plausible sources of cost synergies'),
  keyRisks: z.array(z.string()).describe('2-4 deal risks'),
  diligenceQuestions: z.array(z.string()).describe('2-4 questions the deal team should answer next'),
  citedFigures: z.array(z.object({ factId: z.string(), value: z.number() })).describe('Every fact-sheet figure used, by id, with its exact value'),
});

export type DealMemo = z.infer<typeof DealMemoSchema>;

export interface DealMemoResult {
  memo: DealMemo;
  mode: 'claude' | 'template';
  model?: string;
  citations: { factId: string; value: number; ok: boolean; label?: string }[];
  numbers: NumberCheck[];
  note?: string;
}

const SYSTEM = `You are an M&A associate at an investment bank writing the strategic-rationale page of a deal teaser for a hypothetical combination.

Rules:
- Use ONLY figures from the fact sheet, written exactly as its "display" field. Never compute or invent a number.
- List every figure you use in citedFigures with its factId and numeric value.
- Strategic rationale and synergy sources may draw on general knowledge of the two businesses, but must not state numbers that are not in the fact sheet.
- Make clear this is a hypothetical transaction. No investment recommendation.`;

function check(memo: DealMemo, facts: FactEntry[], mode: DealMemoResult['mode'], note?: string): DealMemoResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const citations = memo.citedFigures.map((c) => {
    const f = byId.get(c.factId);
    return { ...c, ok: !!f && Math.abs(f.value - c.value) <= Math.abs(f.value) * 1e-3 + 1e-9, label: f?.label };
  });
  const text = [memo.headline, memo.summary, ...memo.strategicRationale, ...memo.synergySources.map((s) => `${s.area} ${s.description}`), ...memo.keyRisks, ...memo.diligenceQuestions].join('\n');
  return { memo, mode, model: mode === 'claude' ? MODEL : undefined, citations, numbers: verifyNumbers(text, facts), note };
}

interface Ctx {
  acquirer: { ticker: string; name: string; industry: string | null };
  target: { ticker: string; name: string; industry: string | null };
  facts: FactEntry[];
}

export async function generateDealMemo(ctx: Ctx): Promise<DealMemoResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return check(template(ctx), ctx.facts, 'template', 'ANTHROPIC_API_KEY is not set, so this rationale was assembled from a deterministic template.');
  }
  const client = new Anthropic();
  const sheet = ctx.facts.map(({ id, label, value, display }) => ({ id, label, value, display }));
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(DealMemoSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Hypothetical deal: ${ctx.acquirer.name} (${ctx.acquirer.ticker}, ${ctx.acquirer.industry ?? 'n/a'}) acquires ${ctx.target.name} (${ctx.target.ticker}, ${ctx.target.industry ?? 'n/a'}).\n\nFact sheet (JSON):\n${JSON.stringify(sheet, null, 1)}`,
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return check(template(ctx), ctx.facts, 'template', 'The model declined or returned no structured output; showing the template.');
    }
    return check(response.parsed_output, ctx.facts, 'claude');
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : 'Claude API unavailable';
    return check(template(ctx), ctx.facts, 'template', `${msg}; showing the template.`);
  }
}

function template(ctx: Ctx): DealMemo {
  const F = new Map(ctx.facts.map((f) => [f.id, f]));
  const cited = new Set<string>();
  const c = (id: string) => {
    if (F.has(id)) cited.add(id);
    return F.get(id)?.display ?? 'n/a';
  };
  const v = (id: string) => F.get(id)?.value ?? NaN;
  const A = ctx.acquirer;
  const T = ctx.target;
  const acc = v('accretion');
  const same = !!A.industry && A.industry === T.industry;
  return {
    headline: `${A.ticker} / ${T.ticker}: ${acc >= 0 ? 'accretive' : 'dilutive'} at a ${F.get('premium')?.display} premium`,
    summary: `${A.name} would pay ${c('offer_price')} per ${T.ticker} share, a ${c('premium')} premium, for an equity value of ${c('equity_price')} (${c('ev_ebitda')} EBITDA). Funded ${c('cash_mix')} cash, ${c('stock_mix')} stock and ${c('debt_mix')} new debt, the deal is ${acc >= 0 ? 'accretive' : 'dilutive'} to ${A.ticker}'s EPS by ${c('accretion')} in year one, with pro-forma EPS of ${c('eps_pf')} versus ${c('eps_sa')} standalone.`,
    strategicRationale: [
      same
        ? `Horizontal combination in ${T.industry}: scale in shared functions and a broader product portfolio.`
        : `Diversification into ${T.industry ?? 'a new segment'}, adding a revenue stream of ${c('tgt_rev')}.`,
      `${T.ticker} adds ${c('tgt_ni')} of net income against ${c('acq_ni')} at ${A.ticker}.`,
      `${T.ticker} shareholders would own ${c('own_tgt')} of the combined company, so they share in the upside.`,
    ],
    synergySources: [
      { area: 'Corporate overhead', description: 'Consolidate public-company costs, finance, legal and IT.' },
      { area: 'Procurement & distribution', description: 'Combined purchasing scale and shared go-to-market channels.' },
      { area: 'Technology & R&D', description: 'Rationalise overlapping platforms and development spend.' },
    ],
    keyRisks: [
      `Synergy delivery: the deal needs ${c('breakeven_syn')} of pre-tax synergies just to break even on EPS.`,
      `Leverage moves to ${c('lev_pf')} debt/EBITDA from ${c('lev_sa')}, which matters for the credit rating.`,
      same ? 'Antitrust review is likely to focus on overlapping products.' : 'Integration across different industries tends to be slower than planned.',
    ],
    diligenceQuestions: [
      'Which cost lines overlap, and how quickly can synergies be realised?',
      'Would the target board engage at this premium, and is there a competing bidder?',
      'How would rating agencies treat the new debt?',
    ],
    citedFigures: [...cited].map((id) => ({ factId: id, value: v(id) })),
  };
}
