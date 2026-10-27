import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { METHODOLOGIES } from '../engine/valuation.ts';
import type { FactEntry, NumberCheck } from './facts.ts';
import { verifyNumbers } from './facts.ts';

// The LLM writes prose; it never does arithmetic. It sees only the engine's fact
// sheet, its output is forced into this Zod schema, and every number it writes is
// checked against the fact sheet before the memo is shown.

export const MODEL = 'claude-opus-5-5';

export const MemoSchema = z.object({
  headline: z.string().describe('One-line takeaway, max ~14 words'),
  summary: z.string().describe('3-4 sentence situation overview and valuation conclusion'),
  keyTakeaways: z.array(z.string()).describe('3-5 bullet takeaways'),
  methodologyCommentary: z
    .array(z.object({ methodology: z.enum(METHODOLOGIES), comment: z.string() }))
    .describe('One short comment per methodology on what drives its range'),
  risks: z.array(z.string()).describe('2-4 valuation risks or model sensitivities'),
  diligenceQuestions: z.array(z.string()).describe('2-4 questions a senior banker would ask next'),
  citedFigures: z.array(z.object({ factId: z.string(), value: z.number() })).describe('Every fact-sheet figure used, by id, with the exact value given'),
});

export type Memo = z.infer<typeof MemoSchema>;

export interface MemoResult {
  memo: Memo;
  mode: 'claude' | 'template';
  model?: string;
  positioning: 'premium' | 'within' | 'discount';
  citations: { factId: string; value: number; ok: boolean; label?: string; expected?: string }[];
  numbers: NumberCheck[];
  note?: string;
}

const SYSTEM = `You are a senior investment banking associate writing the valuation summary page of a pitchbook.

Rules:
- Use ONLY the figures in the fact sheet. Never compute, round differently, or invent a number.
- Write every figure exactly as it appears in the fact sheet's "display" field.
- List every figure you use in citedFigures with its factId and the fact sheet's numeric "value".
- Tone: crisp, factual, banker register. No investment recommendation, price target, or buy/sell language.
- Explain WHY the ranges differ (growth, margins, peer set, leverage capacity, terminal value weight), not just what they are.`;

function positioning(facts: FactEntry[]): MemoResult['positioning'] {
  const v = facts.find((f) => f.id === 'composite_vs_price')?.value ?? 0;
  return v < -0.1 ? 'premium' : v > 0.1 ? 'discount' : 'within';
}

function check(memo: Memo, facts: FactEntry[], mode: MemoResult['mode'], note?: string): MemoResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const citations = memo.citedFigures.map((c) => {
    const f = byId.get(c.factId);
    const ok = !!f && Math.abs(f.value - c.value) <= Math.abs(f.value) * 1e-3 + 1e-9;
    return { ...c, ok, label: f?.label, expected: f?.display };
  });
  const text = [memo.headline, memo.summary, ...memo.keyTakeaways, ...memo.methodologyCommentary.map((m) => m.comment), ...memo.risks, ...memo.diligenceQuestions].join('\n');
  return { memo, mode, model: mode === 'claude' ? MODEL : undefined, positioning: positioning(facts), citations, numbers: verifyNumbers(text, facts), note };
}

export async function generateMemo(ctx: { ticker: string; name: string; peerBasis: string; facts: FactEntry[] }): Promise<MemoResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return check(templateMemo(ctx), ctx.facts, 'template', 'ANTHROPIC_API_KEY is not set, so this memo was assembled from a deterministic template.');
  }
  const client = new Anthropic();
  const sheet = ctx.facts.map(({ id, label, value, display }) => ({ id, label, value, display }));
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(MemoSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Company: ${ctx.name} (${ctx.ticker}). Peer set: ${ctx.peerBasis}.\n\nFact sheet (JSON):\n${JSON.stringify(sheet, null, 1)}\n\nWrite the valuation summary.`,
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return check(templateMemo(ctx), ctx.facts, 'template', 'The model declined or returned no structured output; showing the template memo.');
    }
    return check(response.parsed_output, ctx.facts, 'claude');
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : 'Claude API unavailable';
    return check(templateMemo(ctx), ctx.facts, 'template', `${msg}; showing the template memo.`);
  }
}

/** Deterministic fallback so the demo works with no API key. Built only from fact-sheet displays. */
function templateMemo(ctx: { ticker: string; name: string; peerBasis: string; facts: FactEntry[] }): Memo {
  const F = new Map(ctx.facts.map((f) => [f.id, f]));
  const d = (id: string) => F.get(id)?.display ?? 'n/a';
  const v = (id: string) => F.get(id)?.value ?? NaN;
  const cited = new Set<string>();
  const c = (id: string) => {
    if (F.has(id)) cited.add(id);
    return d(id);
  };
  const gap = v('composite_vs_price');
  const where = gap < -0.1 ? 'above' : gap > 0.1 ? 'below' : 'in line with';
  const methods = [
    ['w52', '52-Week Range'],
    ['comps', 'Public Comps (EV/EBITDA & EV/Revenue)'],
    ['precedents', 'Precedent Transactions'],
    ['dcf', 'Discounted Cash Flow'],
    ['lbo', 'LBO Floor Valuation'],
  ] as const;
  const present = methods.filter(([s]) => F.has(`${s}_median_price`));
  const top = [...present].sort((x, y) => v(`${y[0]}_median_price`) - v(`${x[0]}_median_price`))[0];
  const bottom = [...present].sort((x, y) => v(`${x[0]}_median_price`) - v(`${y[0]}_median_price`))[0];

  const commentary: Record<string, string> = {
    w52: `Trading range of ${c('w52_min_price')}-${c('w52_max_price')} per share frames where the market has cleared over the past year.`,
    comps: `Peers trade between ${c('peer_min_multiple')} and ${c('peer_max_multiple')} EV/EBITDA versus ${ctx.ticker} at ${c('current_ev_ebitda')}; the median peer multiple implies ${c('comps_median_price')} per share.`,
    precedents: `A ${c('control_premium')} control premium on trading multiples lifts the median to ${c('precedents_median_price')} per share, the ceiling a strategic acquirer might underwrite.`,
    dcf: `At a ${c('wacc')} WACC and ${c('terminal_growth')} perpetuity growth the DCF median is ${c('dcf_median_price')}; terminal value is ${c('dcf_tv_share')} of EV, so the result leans heavily on long-run assumptions.`,
    lbo: `A sponsor at ${c('lbo_leverage')} leverage targeting a ${c('lbo_target_irr')} IRR could pay up to ${c('lbo_entry_multiple')} EBITDA, a floor of ${c('lbo_median_price')} per share.`,
  };

  return {
    headline: `${ctx.ticker} trades ${where} the composite intrinsic value of ${d('composite_price')}`,
    summary: `${ctx.name} trades at ${c('price')} per share, an enterprise value of ${c('current_ev')} or ${c('current_ev_ebitda')} LTM EBITDA of ${c('ltm_ebitda')}. Across five methodologies the median of medians is ${c('composite_price')} per share (${c('composite_vs_price')} versus the current price). ${top ? `${top[1]} produces the highest median at ${c(`${top[0]}_median_price`)}` : ''}${bottom ? `, while ${bottom[1]} is lowest at ${c(`${bottom[0]}_median_price`)}.` : '.'}`,
    keyTakeaways: [
      `Composite implied value of ${d('composite_price')} per share versus ${d('price')} today (${d('composite_vs_price')}).`,
      `The market price capitalizes ${c('current_ev_ebitda')} LTM EBITDA against a peer range of ${d('peer_min_multiple')}-${d('peer_max_multiple')}.`,
      `DCF is most sensitive to the discount rate: computed WACC is ${c('wacc_computed')} on a beta of ${c('beta')}.`,
      `Operating case assumes ${c('revenue_growth_y1')} year-1 growth fading to ${d('terminal_growth')} and a ${c('ebit_margin')} EBIT margin.`,
    ],
    methodologyCommentary: present.map(([s, m]) => ({ methodology: m, comment: commentary[s] })),
    risks: [
      `Terminal value is ${d('dcf_tv_share')} of DCF enterprise value; a 50 bp move in WACC shifts the DCF materially (see the sensitivity tab).`,
      `Peer selection (${ctx.peerBasis}) drives both comps and precedents; the multiple dispersion is wide.`,
      'XBRL figures are as reported (GAAP); non-recurring items other than tagged restructuring and impairment are not normalized.',
    ],
    diligenceQuestions: [
      'What revenue growth and margin trajectory does management guidance support versus the operating case?',
      'Which peers are true comparables on growth and margin, and does the premium or discount to them persist?',
      'How much incremental leverage would rating agencies tolerate, and what does that imply for a sponsor bid?',
    ],
    citedFigures: [...cited].map((id) => ({ factId: id, value: v(id) })),
  };
}
