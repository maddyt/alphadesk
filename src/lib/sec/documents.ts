import 'server-only';
import { resolveCik, secFetch, secText } from './client.ts';
import { recentFilings, type SubmissionsJson } from './parsers.ts';
import { htmlToText } from '../ai/proxy.ts';
import { normalizeTicker } from '../data/dataset.ts';
import { supabase } from '../supabase.ts';

// Full-text filings for the agentic Deal Room and the SEC EDGAR MCP server:
// the latest annual report (10-K / 20-F / 40-F) and proxy (DEF 14A), as plain text.
// Text is held in memory per instance and, when Supabase is configured, in `filing_docs` by accession number.

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
  // Filings are immutable: a stored copy for this accession number is good forever.
  const stored = await fromDb(f.accessionNumber);
  if (stored) return { ...stored, ticker };
  const url = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${f.accessionNumber.replace(/-/g, '')}/${f.primaryDocument}`;
  const html = await secText(url, 60_000);
  const doc: FilingDoc = { ticker, cik, kind, form: f.form, accessionNumber: f.accessionNumber, filingDate: f.filingDate, url, text: htmlToText(html) };
  await toDb(doc);
  return doc;
}

async function fromDb(accession: string): Promise<FilingDoc | null> {
  const db = supabase();
  if (!db) return null;
  const { data } = await db.from('filing_docs').select('ticker, cik, kind, form, filing_date, url, text, accession_number').eq('accession_number', accession).maybeSingle();
  return data
    ? { ticker: data.ticker, cik: data.cik, kind: data.kind, form: data.form, accessionNumber: data.accession_number, filingDate: String(data.filing_date), url: data.url, text: data.text }
    : null;
}

async function toDb(d: FilingDoc): Promise<void> {
  const db = supabase();
  if (!db) return;
  await db
    .from('filing_docs')
    .upsert({ accession_number: d.accessionNumber, ticker: d.ticker, cik: d.cik, kind: d.kind, form: d.form, filing_date: d.filingDate, url: d.url, text: d.text })
    .then(
      () => undefined,
      () => undefined,
    );
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
