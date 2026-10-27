import 'server-only';
import { resolveCik, secFetch, secText } from './client.ts';
import { recentFilings, type SubmissionsJson } from './parsers.ts';
import { htmlToText } from '../ai/proxy.ts';
import { normalizeTicker } from '../data/dataset.ts';

// Full-text filings for the agentic Deal Room and the SEC EDGAR MCP server:
// the latest annual report (10-K / 20-F / 40-F) and proxy (DEF 14A), as plain text.
// Text is held in memory per accession number; it is too large for the database cache.

export interface FilingDoc {
  ticker: string;
  cik: string;
  kind: 'annual_report' | 'proxy';
  form: string;
  accessionNumber: string;
  filingDate: string;
  url: string;
  text: string;
}

const docs = new Map<string, Promise<FilingDoc | null>>();

async function load(ticker: string, kind: FilingDoc['kind']): Promise<FilingDoc | null> {
  const cik = await resolveCik(ticker);
  const subs = await secFetch<SubmissionsJson>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const forms = kind === 'annual_report' ? ['10-K', '20-F', '40-F'] : ['DEF 14A'];
  const f = recentFilings(subs).find((x) => forms.includes(x.form));
  if (!f) return null;
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accessionNumber.replace(/-/g, '')}/${f.primaryDocument}`;
  const html = await secText(url, 60_000);
  return { ticker, cik, kind, form: f.form, accessionNumber: f.accessionNumber, filingDate: f.filingDate, url, text: htmlToText(html) };
}

export function getFilingDoc(raw: string, kind: FilingDoc['kind']): Promise<FilingDoc | null> {
  const ticker = normalizeTicker(raw);
  if (process.env.DATA_MODE === 'snapshot') return Promise.resolve(null);
  const key = `${ticker}:${kind}`;
  let p = docs.get(key);
  if (!p) {
    p = load(ticker, kind).catch((e) => {
      docs.delete(key);
      throw e;
    });
    docs.set(key, p);
    // Keep memory bounded on long-lived instances.
    if (docs.size > 24) docs.delete(docs.keys().next().value!);
  }
  return p;
}
