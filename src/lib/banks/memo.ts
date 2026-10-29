import 'server-only';
import { fromSdkUsage, recordAiUsage } from '../db/usage.ts';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { FactEntry, NumberCheck } from '../ai/facts.ts';
import { verifyNumbers } from '../ai/facts.ts';
import { MODEL } from '../ai/memo.ts';

// AI bank analysis (PRD week 4): Claude interprets, the engine owns every number.
// It sees only the fact sheet, answers in a strict Zod schema, and every $, % and x
// it writes is checked against the fact sheet.

export const BankMemoSchema = z.object({
  headline: z.string().describe('One-line takeaway, max ~14 words'),
  summary: z.string().describe('3-4 sentences: returns, valuation vs. peers and DDM, capital position'),
  valuationView: z.array(z.string()).describe('2-4 bullets on P/TBV vs. ROATCE and the DDM'),
  capitalAndCredit: z.array(z.string()).describe('2-4 bullets on CET1, capital stack, asset quality and liquidity'),
  keyRisks: z.array(z.string()).describe('2-4 risks, including the rate / deposit stress result'),
  questions: z.array(z.string()).describe('2-3 questions a FIG banker would ask management'),
  citedFigures: z.array(z.object({ factId: z.string(), value: z.number() })).describe('Every fact-sheet figure used, by id, with its exact value'),
});
export type BankMemo = z.infer<typeof BankMemoSchema>;

export interface BankMemoResult {
  memo: BankMemo;
  mode: 'claude' | 'template';
  model?: string;
  citations: { factId: string; value: number; ok: boolean; label?: string }[];
  numbers: NumberCheck[];
  note?: string;
}

const SYSTEM = `You are a Financial Institutions Group (FIG) investment banking associate writing a one-page bank valuation note.

Rules:
- Use ONLY figures from the fact sheet, written exactly as its "display" field. Never compute or invent a number.
- List every figure you use in citedFigures with its factId and numeric value.
- Banks are valued on P/TBV vs. ROATCE and dividend capacity under CET1 constraints, never EV/EBITDA.
- You may add general knowledge of the bank's franchise, but no numbers outside the fact sheet. No investment recommendation.`;

function check(memo: BankMemo, facts: FactEntry[], mode: BankMemoResult['mode'], note?: string): BankMemoResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const citations = memo.citedFigures.map((c) => {
    const f = byId.get(c.factId);
    return { ...c, ok: !!f && Math.abs(f.value - c.value) <= Math.abs(f.value) * 1e-3 + 1e-9, label: f?.label };
  });
  const text = [memo.headline, memo.summary, ...memo.valuationView, ...memo.capitalAndCredit, ...memo.keyRisks, ...memo.questions].join('\n');
  return { memo, mode, model: mode === 'claude' ? MODEL : undefined, citations, numbers: verifyNumbers(text, facts), note };
}

export async function generateBankMemo(ctx: { ticker: string; name: string; peerBasis: string; facts: FactEntry[] }): Promise<BankMemoResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return check(template(ctx), ctx.facts, 'template', 'ANTHROPIC_API_KEY is not set, so this note was assembled from a deterministic template.');
  }
  const client = new Anthropic();
  const sheet = ctx.facts.map(({ id, label, value, display }) => ({ id, label, value, display }));
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(BankMemoSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Bank: ${ctx.name} (${ctx.ticker}). Peer group: ${ctx.peerBasis}.\n\nFact sheet (JSON):\n${JSON.stringify(sheet, null, 1)}` }],
    });
    await recordAiUsage({ feature: 'bank_memo', subject: ctx.ticker, model: MODEL, usage: fromSdkUsage(response.usage) });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      return check(template(ctx), ctx.facts, 'template', 'The model declined or returned no structured output; showing the template.');
    }
    return check(response.parsed_output, ctx.facts, 'claude');
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : 'Claude API unavailable';
    return check(template(ctx), ctx.facts, 'template', `${msg}; showing the template.`);
  }
}

function template(ctx: { ticker: string; name: string; facts: FactEntry[] }): BankMemo {
  const F = new Map(ctx.facts.map((f) => [f.id, f]));
  const cited = new Set<string>();
  const c = (id: string) => {
    if (F.has(id)) cited.add(id);
    return F.get(id)?.display ?? 'n/a';
  };
  const v = (id: string) => F.get(id)?.value ?? NaN;
  const resid = v('residual');
  const rel = resid > 0.15 ? 'a premium to' : resid < -0.15 ? 'a discount to' : 'in line with';
  return {
    headline: `${ctx.ticker} trades at ${F.get('ptbv')?.display} tangible book on a ${F.get('roatce')?.display} ROATCE`,
    summary: `${ctx.name} earns a ${c('roatce')} return on average tangible common equity and trades at ${c('ptbv')} tangible book (${c('tbvps')} TBVPS), ${rel} the peer regression line. The regression implies ${c('implied_price_reg')} per share and the 3-stage dividend discount model ${c('ddm_value')}, against a share price of ${c('price')}. CET1 stands at ${c('cet1_ratio')} versus a ${c('target_cet1')} target.`,
    valuationView: [
      `Peer line: P/TBV = ${c('reg_alpha')} + ${c('reg_beta')} × ROATCE (R² ${c('reg_r2')}), implying ${c('implied_ptbv')} for ${ctx.ticker}.`,
      `DDM at a ${c('ke')} cost of equity and ${c('loan_growth')} loan growth gives ${c('ddm_value')}, or ${c('ddm_ptbv')} tangible book.`,
    ],
    capitalAndCredit: [
      `CET1 ${c('cet1_ratio')}, Tier 1 ${c('tier1_ratio')}, total capital ${c('total_cap_ratio')}; regulatory floor incl. buffer ${c('cet1_req')}.`,
      F.has('npl_ratio') ? `Nonperforming loans are ${c('npl_ratio')} of loans with reserves at ${c('acl_ratio')}.` : `Loan-to-deposit ratio ${c('ldr')}.`,
    ],
    keyRisks: [
      `Rate and deposit stress: after the shock and outflow, CET1 falls to ${c('stress_cet1_after')}.`,
      'Deposit pricing pressure compresses net interest margin if rates stay high.',
      'Commercial real estate and consumer credit normalisation could raise provisions.',
    ],
    questions: ['How much of the deposit base is uninsured and operational?', 'What is the capital return plan as the CET1 target settles under Basel III endgame?'],
    citedFigures: [...cited].map((id) => ({ factId: id, value: v(id) })),
  };
}
