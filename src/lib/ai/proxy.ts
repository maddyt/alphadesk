import 'server-only';
import { fromSdkUsage, recordAiUsage } from '../db/usage.ts';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { secText } from '../sec/client.ts';
import { MODEL } from './memo.ts';

// PRD v2 appendix C: change-of-control ("golden parachute") payouts from the DEF 14A
// proxy. Proxy tables are free-form HTML, so this is a structured-extraction job for
// Claude, constrained by a Zod schema. Every dollar figure it returns must appear
// verbatim in the filing text, or it is marked unverified and excluded from totals.

const ExtractSchema = z.object({
  found: z.boolean().describe('True only if the text contains a change-in-control / termination payments table'),
  scenario: z.string().describe('Name of the scenario column used, e.g. "Termination following a change in control"'),
  executives: z.array(
    z.object({
      name: z.string(),
      title: z.string(),
      cashSeverance: z.number().describe('USD, exactly as printed (0 if none)'),
      equityAcceleration: z.number().describe('USD, exactly as printed (0 if none)'),
      total: z.number().describe('USD total for this executive in the chosen scenario, exactly as printed'),
    }),
  ),
});

export interface ParachuteExec {
  name: string;
  title: string;
  cashSeverance: number;
  equityAcceleration: number;
  total: number;
  verified: boolean;
}

export interface ProxyResult {
  status: 'ok' | 'not_found' | 'needs_key' | 'error';
  message?: string;
  filingDate?: string;
  url?: string;
  scenario?: string;
  executives: ParachuteExec[];
  verifiedTotal: number;
  model?: string;
}

/** Flatten proxy HTML to text, keeping table rows on their own lines with cells separated by " | ". */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<\/(tr|p|div|h\d|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8212;|&mdash;|&#8211;|&ndash;/g, '-')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

/** The part of the proxy most likely to hold the change-in-control payments table. */
export function parachuteWindow(text: string, max = 60_000): string | null {
  const markers = [/potential payments upon (a )?termination or (a )?change[- ]in[- ]control/gi, /change[- ]in[- ]control (payments|benefits|severance)/gi, /golden parachute/gi];
  for (const re of markers) {
    const hits = [...text.matchAll(re)].map((m) => m.index ?? 0);
    // The table usually follows the last heading mention rather than the table-of-contents entry.
    const start = hits.length > 1 ? hits[1] : hits[0];
    if (start !== undefined) return text.slice(Math.max(0, start - 2_000), start + max);
  }
  return null;
}

/** A figure is verified if it appears in the source with thousands separators, as printed. */
export function appearsInText(value: number, text: string): boolean {
  if (!value) return true;
  const whole = Math.round(value).toLocaleString('en-US');
  if (text.includes(whole)) return true;
  // Some proxies print in thousands or millions.
  const k = Math.round(value / 1e3).toLocaleString('en-US');
  const m = (value / 1e6).toFixed(1);
  return value >= 1e5 && (text.includes(k) || text.includes(m));
}

export async function extractParachutes(proxy: { url: string; filingDate: string }): Promise<ProxyResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: 'needs_key', message: 'Set ANTHROPIC_API_KEY to extract change-of-control payouts from the proxy statement.', url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };
  }
  const html = await secText(proxy.url, 40_000);
  const text = htmlToText(html);
  const window = parachuteWindow(text);
  if (!window) return { status: 'not_found', message: 'No change-in-control payments section found in the latest DEF 14A.', url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(ExtractSchema) },
      system:
        'You extract data from SEC proxy statements. Copy numbers exactly as printed (convert to plain USD numbers, no rounding). Use the scenario for termination without cause or for good reason following a change in control; if absent, use the change-in-control column. Do not invent executives or amounts.',
      messages: [{ role: 'user', content: `Extract each named executive officer's payouts from this proxy excerpt:\n\n${window}` }],
    });
    await recordAiUsage({ feature: 'proxy', subject: proxy.url, model: MODEL, usage: fromSdkUsage(response.usage) });
    const out = response.parsed_output;
    if (response.stop_reason === 'refusal' || !out) return { status: 'error', message: 'The model returned no structured output.', url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };
    if (!out.found || out.executives.length === 0) return { status: 'not_found', message: 'The proxy excerpt has no change-in-control payments table.', url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };
    const executives = out.executives.map((e) => ({ ...e, verified: appearsInText(e.total, window) }));
    return {
      status: 'ok',
      filingDate: proxy.filingDate,
      url: proxy.url,
      scenario: out.scenario,
      executives,
      verifiedTotal: executives.filter((e) => e.verified).reduce((s, e) => s + e.total, 0),
      model: MODEL,
    };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Claude API error ${e.status}` : (e as Error).message;
    return { status: 'error', message: msg, url: proxy.url, filingDate: proxy.filingDate, executives: [], verifiedTotal: 0 };
  }
}
