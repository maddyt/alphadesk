import 'server-only';
import { z } from 'zod';
import { getFinancials, normalizeTicker } from '../data/dataset.ts';
import { getIntel } from '../data/intel.ts';
import { getFilingDoc } from '../sec/documents.ts';
import { resolveCik, secFetch } from '../sec/client.ts';
import { recentFilings, type SubmissionsJson } from '../sec/parsers.ts';
import { extractItem, extractSegmentNote, lineAt, searchText } from '../agents/filing-text.ts';
import { parachuteWindow } from '../ai/proxy.ts';

// The SEC EDGAR tool set, defined once and served two ways:
//  - over MCP at /api/mcp (any MCP client: Claude Desktop, Claude Code, ...), and
//  - in-process to the Deal Room's Claude agents via the SDK tool runner.
// Every tool is read-only over public SEC data.

export interface SecTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<string>;
}

const tickerArg = z.string().describe('US-listed ticker, e.g. AAPL or ASML');
const json = (v: unknown) => JSON.stringify(v, null, 1);
const archive = (cik: string, accn: string) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, '')}/`;

const noDoc = (ticker: string, kind: 'annual_report' | 'proxy') =>
  process.env.DATA_MODE === 'snapshot'
    ? 'Filing text is not available in offline snapshot mode (DATA_MODE=snapshot).'
    : `No ${kind === 'proxy' ? 'DEF 14A proxy' : 'annual report'} on file for ${ticker}${kind === 'proxy' ? ' (foreign private issuers are exempt from proxy rules)' : ''}.`;

function tool<S extends z.ZodType>(t: SecTool<S>): SecTool<S> {
  return t;
}

export const SEC_TOOLS = [
  tool({
    name: 'get_company_financials',
    description: 'Key XBRL financial statement lines (latest fiscal year, LTM and latest balance sheet) with their us-gaap/ifrs-full tags and accession numbers.',
    schema: z.object({ ticker: tickerArg }),
    run: async ({ ticker }) => {
      const f = await getFinancials(normalizeTicker(ticker));
      const pick = (items: Record<string, { value: number; facts: { tag: string; accn: string | null; end: string }[] } | undefined>) =>
        Object.fromEntries(Object.entries(items).filter(([, v]) => v).map(([k, v]) => [k, { value: v!.value, tag: v!.facts[0]?.tag, accession: v!.facts[0]?.accn, periodEnd: v!.facts[0]?.end }]));
      return json({ ticker: f.ticker, cik: f.cik, name: f.name, accounting: f.accounting, ltm: { label: f.ltm.label, ...pick(f.ltm.items as never) }, balance: { label: f.balance.label, ...pick(f.balance.items as never) } });
    },
  }),
  tool({
    name: 'list_filings',
    description: 'Recent SEC filings for a company (form, date, accession number, URL, 8-K item numbers). Optionally filter by form type.',
    schema: z.object({ ticker: tickerArg, form: z.string().optional().describe('e.g. 10-K, 8-K, DEF 14A, 4, 20-F'), limit: z.number().int().optional() }),
    run: async ({ ticker, form, limit }) => {
      const cik = await resolveCik(normalizeTicker(ticker));
      const subs = await secFetch<SubmissionsJson>(`https://data.sec.gov/submissions/CIK${cik}.json`);
      const rows = recentFilings(subs)
        .filter((f) => !form || f.form === form)
        .slice(0, Math.min(limit ?? 15, 40))
        .map((f) => ({ form: f.form, filingDate: f.filingDate, accessionNumber: f.accessionNumber, items: f.items || undefined, url: archive(cik, f.accessionNumber) + f.primaryDocument }));
      return json(rows);
    },
  }),
  tool({
    name: 'read_filing_section',
    description:
      'Read a section of the latest annual report (10-K / 20-F) or proxy (DEF 14A) as plain text with starting line number and accession. Sections: business, risk_factors, mdna, segments (annual report); change_in_control (proxy). Use offset to page through long sections.',
    schema: z.object({
      ticker: tickerArg,
      section: z.enum(['business', 'risk_factors', 'mdna', 'segments', 'change_in_control']),
      offset: z.number().int().optional().describe('Character offset within the section (for paging)'),
      max_chars: z.number().int().optional().describe('Default 20000, max 40000'),
    }),
    run: async ({ ticker, section, offset, max_chars }) => {
      const kind = section === 'change_in_control' ? 'proxy' : 'annual_report';
      const doc = await getFilingDoc(ticker, kind);
      if (!doc) return noDoc(ticker, kind);
      let span: { start: number; end: number; text: string } | null;
      if (section === 'change_in_control') {
        const w = parachuteWindow(doc.text, 60_000);
        span = w ? { start: doc.text.indexOf(w), end: doc.text.indexOf(w) + w.length, text: w } : null;
      } else if (section === 'segments') span = extractSegmentNote(doc.text);
      else span = extractItem(doc.text, doc.form, section);
      if (!span) return `Section "${section}" not found in ${doc.form} ${doc.accessionNumber}. Try search_filing instead.`;
      const max = Math.min(max_chars ?? 20_000, 40_000);
      const from = Math.max(0, offset ?? 0);
      const slice = span.text.slice(from, from + max);
      return [
        `SOURCE: ${doc.form} filed ${doc.filingDate}, accession ${doc.accessionNumber}, ${doc.url}`,
        `SECTION: ${section}, characters ${from}-${from + slice.length} of ${span.text.length}, starts at line ${lineAt(doc.text, span.start + from)}`,
        '---',
        slice,
        from + slice.length < span.text.length ? `--- (more: call again with offset=${from + slice.length})` : '--- (end of section)',
      ].join('\n');
    },
  }),
  tool({
    name: 'search_filing',
    description: 'Keyword search across the full text of the latest annual report or proxy. Returns passages with line numbers and the accession number.',
    schema: z.object({ ticker: tickerArg, document: z.enum(['annual_report', 'proxy']), query: z.string() }),
    run: async ({ ticker, document, query }) => {
      const doc = await getFilingDoc(ticker, document);
      if (!doc) return noDoc(ticker, document);
      const hits = searchText(doc.text, query, 8);
      return json({ source: { form: doc.form, accessionNumber: doc.accessionNumber, filingDate: doc.filingDate, url: doc.url }, hits });
    },
  }),
  tool({
    name: 'get_governance_flags',
    description: 'Accounting and governance red flags from the last 24 months: 8-K Item 4.02 restatements, Item 4.01 auditor changes, amended or late periodic reports.',
    schema: z.object({ ticker: tickerArg }),
    run: async ({ ticker }) => {
      const i = await getIntel(ticker);
      return json({ foreignPrivateIssuer: !!i.fpi, governance: i.governance, notes: i.notes });
    },
  }),
  tool({
    name: 'get_insider_activity',
    description: 'Form 4 open-market insider purchases and sales over the last 12 months, by executive.',
    schema: z.object({ ticker: tickerArg }),
    run: async ({ ticker }) => {
      const i = await getIntel(ticker);
      return json(i.insiders ? { ...i.insiders, trades: i.insiders.trades.slice(0, 15) } : { unavailable: true, foreignPrivateIssuer: !!i.fpi, notes: i.notes });
    },
  }),
  tool({
    name: 'get_ownership_filings',
    description: 'Schedule 13D (activist) and 13G (passive) 5%+ ownership filings on the company over the last 24 months, with filer names.',
    schema: z.object({ ticker: tickerArg }),
    run: async ({ ticker }) => json((await getIntel(ticker)).ownership ?? { unavailable: true }),
  }),
  tool({
    name: 'get_segment_revenue',
    description: 'Revenue by product/service, business segment and geography parsed from the dimensional XBRL in the latest annual report.',
    schema: z.object({ ticker: tickerArg }),
    run: async ({ ticker }) => json((await getIntel(ticker)).segments ?? { unavailable: true }),
  }),
] as const;

export type SecToolName = (typeof SEC_TOOLS)[number]['name'];

export function findTool(name: string): SecTool | undefined {
  return (SEC_TOOLS as readonly SecTool[]).find((t) => t.name === name);
}
