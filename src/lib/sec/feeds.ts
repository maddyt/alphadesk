import 'server-only';
import type { Intel } from '../types.ts';
import { resolveCik, secFetch, secText } from './client.ts';
import {
  filerFromHeader,
  governanceFlags,
  governanceRating,
  OWNERSHIP_FORMS,
  parseForm4,
  parseLabels,
  parseSegments,
  rawForm4Path,
  recentFilings,
  summarizeInsiders,
  type FilingRef,
  type OwnershipFiling,
  type SubmissionsJson,
} from './parsers.ts';

// PRD v2 appendix A, B, C, D: extended SEC feeds pulled straight from EDGAR.
// Every section is fetched independently, so one failure never blanks the others.

const archive = (cik: string, accn: string) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn.replace(/-/g, '')}`;
const within = (iso: string, months: number) => Date.now() - Date.parse(iso) <= months * 30.44 * 86400_000;

async function segments(cik: string, filings: FilingRef[]): Promise<Intel['segments']> {
  const tenK = filings.find((f) => f.form === '10-K');
  if (!tenK) return null;
  const base = archive(cik, tenK.accessionNumber);
  const index = await secFetch<{ directory: { item: { name: string; size?: string }[] } }>(`${base}/index.json`);
  const files = index.directory.item.map((i) => i.name);
  const instance = files.find((n) => /_htm\.xml$/i.test(n)) ?? files.find((n) => /\.xml$/i.test(n) && !/FilingSummary|_(cal|def|lab|pre)\.xml$/i.test(n));
  if (!instance) return null;
  const lab = files.find((n) => /_lab\.xml$/i.test(n));
  const [xml, labXml] = await Promise.all([secText(`${base}/${instance}`, 40_000), lab ? secText(`${base}/${lab}`, 30_000).catch(() => '') : Promise.resolve('')]);
  const fyEnd = tenK.reportDate || tenK.filingDate;
  const breakdowns = parseSegments(xml, fyEnd, labXml ? parseLabels(labXml) : new Map());
  return { breakdowns, accessionNumber: tenK.accessionNumber, filingDate: tenK.filingDate, fyEnd };
}

async function insiders(cik: string, filings: FilingRef[]) {
  const f4 = filings.filter((f) => f.form === '4' && within(f.filingDate, 12)).slice(0, 25);
  const docs = await Promise.all(
    f4.map((f) =>
      secText(`${archive(cik, f.accessionNumber)}/${rawForm4Path(f.primaryDocument)}`)
        .then((xml) => parseForm4(xml, f.accessionNumber))
        .catch(() => []),
    ),
  );
  return summarizeInsiders(docs.flat(), f4.length);
}

async function ownership(cik: string, filings: FilingRef[]): Promise<OwnershipFiling[]> {
  const list = filings.filter((f) => OWNERSHIP_FORMS.includes(f.form) && within(f.filingDate, 24)).slice(0, 10);
  return Promise.all(
    list.map(async (f) => {
      const filer = await secText(`${archive(cik, f.accessionNumber)}/${f.accessionNumber}.hdr.sgml`)
        .then(filerFromHeader)
        .catch(() => 'Unknown filer');
      return { form: f.form, filingDate: f.filingDate, accessionNumber: f.accessionNumber, filer, activist: /13D/.test(f.form) };
    }),
  );
}

export async function fetchIntel(ticker: string): Promise<Intel> {
  const cik = await resolveCik(ticker);
  const subs = await secFetch<SubmissionsJson>(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const filings = recentFilings(subs);
  const notes: string[] = [];
  const settle = async <T,>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (e) {
      notes.push(`${label} unavailable: ${(e as Error).message}`);
      return null;
    }
  };
  const [seg, ins, own] = await Promise.all([settle('Segment revenue', segments(cik, filings)), settle('Form 4 insider trades', insiders(cik, filings)), settle('Schedule 13D/G filings', ownership(cik, filings))]);
  const flags = governanceFlags(filings);
  const def14a = filings.find((f) => f.form === 'DEF 14A');
  if (seg && seg.breakdowns.length === 0) notes.push('The latest 10-K does not tag revenue by segment or geography in a way that could be parsed.');
  return {
    ticker,
    cik,
    source: 'sec-live',
    segments: seg && seg.breakdowns.length ? seg : null,
    insiders: ins,
    ownership: own,
    governance: { flags, rating: governanceRating(flags), months: 24 },
    proxy: def14a ? { accessionNumber: def14a.accessionNumber, filingDate: def14a.filingDate, url: `${archive(cik, def14a.accessionNumber)}/${def14a.primaryDocument}` } : null,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}
