// Offline snapshot for BankVal AI: 13 large US banks, figures rounded from FY2024
// 10-K filings (USD billions; shares in millions), prices approximate as of the
// snapshot date. Used for DATA_MODE=snapshot and as a fallback when SEC EDGAR is
// unreachable. Accession numbers are null on purpose: the audit trail only shows
// accession IDs that came from a live SEC response. Live mode replaces all of this.

import type { Fact } from '../types.ts';
import type { BankFinancials, BankItem, BankKey, BankMarket } from './types.ts';
import { FLOW_TAGS, INSTANT_TAGS } from './xbrl.ts';

export const BANK_SNAPSHOT_AS_OF = '2024-12-31';

interface Spec {
  name: string;
  cik: string;
  sic: string;
  m: [price: number, beta: number, low52: number, high52: number];
  // $B unless noted
  ce: number; // common equity
  ceP: number; // prior year-end common equity
  pref: number;
  gw: number;
  int: number;
  ni: number;
  pd: number; // preferred dividends
  nii: number;
  nonII: number;
  nonIE: number;
  prov: number;
  dps: number; // $ per share
  ta: number;
  taP: number;
  loans: number;
  dep: number;
  acl: number;
  npl: number;
  cash: number;
  afs: number;
  htm: number;
  htmFv: number | null;
  cet1R: number;
  t1R: number;
  tcR: number;
  rwa: number;
  sh: number; // millions
}

const S: Record<string, Spec> = {
  JPM: { name: 'JPMorgan Chase & Co.', cik: '0000019617', sic: '6021', m: [240, 1.08, 179, 254], ce: 324.7, ceP: 300.5, pref: 20.1, gw: 52.6, int: 1.4, ni: 58.5, pd: 1.0, nii: 92.6, nonII: 85.0, nonIE: 91.8, prov: 10.7, dps: 4.8, ta: 4003, taP: 3875, loans: 1348, dep: 2406, acl: 24.3, npl: 7.9, cash: 468, afs: 406, htm: 274, htmFv: null, cet1R: 0.157, t1R: 0.168, tcR: 0.185, rwa: 1758, sh: 2797 },
  BAC: { name: 'Bank of America Corporation', cik: '0000070858', sic: '6021', m: [44, 1.33, 32.4, 48.1], ce: 267.2, ceP: 263.2, pref: 28.4, gw: 69.0, int: 2.0, ni: 27.1, pd: 1.6, nii: 56.1, nonII: 45.8, nonIE: 66.8, prov: 5.8, dps: 1.0, ta: 3261, taP: 3180, loans: 1096, dep: 1965, acl: 13.2, npl: 5.6, cash: 290, afs: 300, htm: 575, htmFv: 470, cet1R: 0.119, t1R: 0.135, tcR: 0.154, rwa: 1690, sh: 7610 },
  WFC: { name: 'Wells Fargo & Company', cik: '0000072971', sic: '6021', m: [70, 1.12, 50, 81], ce: 160.6, ceP: 162.9, pref: 16.6, gw: 25.2, int: 0.1, ni: 19.7, pd: 1.1, nii: 47.7, nonII: 34.6, nonIE: 54.6, prov: 4.3, dps: 1.5, ta: 1930, taP: 1932, loans: 912, dep: 1372, acl: 14.6, npl: 8.0, cash: 200, afs: 175, htm: 234, htmFv: 200, cet1R: 0.111, t1R: 0.126, tcR: 0.15, rwa: 1231, sh: 3290 },
  C: { name: 'Citigroup Inc.', cik: '0000831001', sic: '6021', m: [70, 1.4, 50, 74], ce: 190.7, ceP: 187.9, pref: 17.6, gw: 19.3, int: 3.7, ni: 12.7, pd: 1.1, nii: 54.1, nonII: 27.0, nonIE: 53.6, prov: 10.1, dps: 2.18, ta: 2353, taP: 2412, loans: 694, dep: 1284, acl: 18.6, npl: 2.9, cash: 300, afs: 250, htm: 235, htmFv: 215, cet1R: 0.136, t1R: 0.153, tcR: 0.159, rwa: 1143, sh: 1891 },
  USB: { name: 'U.S. Bancorp', cik: '0000036104', sic: '6021', m: [48, 1.0, 37.8, 53.9], ce: 51.8, ceP: 49.4, pref: 6.8, gw: 12.6, int: 2.4, ni: 6.3, pd: 0.4, nii: 16.3, nonII: 11.3, nonIE: 17.2, prov: 2.2, dps: 1.98, ta: 678, taP: 663, loans: 379, dep: 519, acl: 7.9, npl: 1.6, cash: 56, afs: 70, htm: 80, htmFv: 70, cet1R: 0.106, t1R: 0.122, tcR: 0.141, rwa: 465, sh: 1560 },
  PNC: { name: 'The PNC Financial Services Group, Inc.', cik: '0000713676', sic: '6021', m: [195, 1.1, 140, 216], ce: 47.9, ceP: 44.9, pref: 6.5, gw: 10.9, int: 0.8, ni: 5.95, pd: 0.36, nii: 13.5, nonII: 7.9, nonIE: 13.6, prov: 0.75, dps: 6.3, ta: 561, taP: 562, loans: 316, dep: 427, acl: 5.2, npl: 2.3, cash: 39, afs: 70, htm: 70, htmFv: 64, cet1R: 0.105, t1R: 0.119, tcR: 0.136, rwa: 436, sh: 396 },
  TFC: { name: 'Truist Financial Corporation', cik: '0000092230', sic: '6021', m: [43, 1.1, 34, 49], ce: 57.0, ceP: 52.4, pref: 6.7, gw: 17.1, int: 1.6, ni: 4.8, pd: 0.3, nii: 14.3, nonII: -1.1, nonIE: 11.7, prov: 1.9, dps: 2.08, ta: 531, taP: 535, loans: 309, dep: 391, acl: 4.9, npl: 1.5, cash: 30, afs: 64, htm: 49, htmFv: 41, cet1R: 0.115, t1R: 0.132, tcR: 0.154, rwa: 410, sh: 1326 },
  MTB: { name: 'M&T Bank Corporation', cik: '0000036270', sic: '6022', m: [190, 0.75, 128, 225], ce: 26.9, ceP: 25.0, pref: 2.0, gw: 8.5, int: 0.1, ni: 2.59, pd: 0.11, nii: 6.9, nonII: 2.5, nonIE: 5.3, prov: 0.6, dps: 5.35, ta: 208, taP: 213, loans: 136, dep: 161, acl: 2.2, npl: 2.2, cash: 32, afs: 11, htm: 23, htmFv: 21, cet1R: 0.11, t1R: 0.124, tcR: 0.14, rwa: 157, sh: 166 },
  FITB: { name: 'Fifth Third Bancorp', cik: '0000035527', sic: '6021', m: [42, 1.2, 33, 49], ce: 17.5, ceP: 16.9, pref: 2.1, gw: 4.9, int: 0.1, ni: 2.31, pd: 0.15, nii: 5.6, nonII: 2.9, nonIE: 4.9, prov: 0.5, dps: 1.44, ta: 213, taP: 215, loans: 123, dep: 167, acl: 2.4, npl: 0.85, cash: 34, afs: 48, htm: 0, htmFv: null, cet1R: 0.106, t1R: 0.12, tcR: 0.139, rwa: 170, sh: 670 },
  HBAN: { name: 'Huntington Bancshares Incorporated', cik: '0000049196', sic: '6021', m: [16.3, 1.1, 12, 18.4], ce: 17.5, ceP: 17.0, pref: 2.2, gw: 5.6, int: 0.1, ni: 1.94, pd: 0.15, nii: 5.4, nonII: 1.9, nonIE: 4.5, prov: 0.4, dps: 0.62, ta: 204, taP: 189, loans: 130, dep: 162, acl: 2.4, npl: 0.8, cash: 12, afs: 28, htm: 16, htmFv: 14, cet1R: 0.105, t1R: 0.119, tcR: 0.14, rwa: 150, sh: 1453 },
  KEY: { name: 'KeyCorp', cik: '0000091576', sic: '6021', m: [17.1, 1.25, 12.7, 20], ce: 15.7, ceP: 12.1, pref: 2.5, gw: 2.75, int: 0.03, ni: -0.16, pd: 0.14, nii: 3.8, nonII: 0.6, nonIE: 4.6, prov: 0.4, dps: 0.82, ta: 187, taP: 188, loans: 104, dep: 149, acl: 1.8, npl: 0.7, cash: 18, afs: 39, htm: 8, htmFv: 7.3, cet1R: 0.12, t1R: 0.138, tcR: 0.159, rwa: 150, sh: 991 },
  CFG: { name: 'Citizens Financial Group, Inc.', cik: '0000759944', sic: '6021', m: [44, 1.2, 30, 49], ce: 22.2, ceP: 22.3, pref: 2.1, gw: 8.2, int: 0.1, ni: 1.51, pd: 0.13, nii: 5.6, nonII: 2.0, nonIE: 4.9, prov: 0.7, dps: 1.68, ta: 218, taP: 222, loans: 141, dep: 175, acl: 2.2, npl: 1.6, cash: 12, afs: 29, htm: 9.5, htmFv: 8.6, cet1R: 0.108, t1R: 0.122, tcR: 0.14, rwa: 174, sh: 440 },
  ZION: { name: 'Zions Bancorporation, N.A.', cik: '0000109380', sic: '6021', m: [54, 1.1, 39, 62], ce: 5.7, ceP: 5.3, pref: 0.44, gw: 1.06, int: 0.01, ni: 0.68, pd: 0.03, nii: 2.5, nonII: 0.68, nonIE: 1.9, prov: 0.06, dps: 1.68, ta: 89, taP: 87, loans: 59, dep: 76, acl: 0.73, npl: 0.26, cash: 3.3, afs: 10, htm: 10.5, htmFv: 9.0, cet1R: 0.109, t1R: 0.115, tcR: 0.133, rwa: 69, sh: 148 },
};

export const BANK_SNAPSHOT_TICKERS = Object.keys(S);

const B = 1e9;
const FY_END = '2024-12-31';
const PRIOR_END = '2023-12-31';

function fact(key: BankKey, value: number, end: string, flow: boolean): Fact {
  const spec = (flow ? FLOW_TAGS : INSTANT_TAGS)[key]?.[0] ?? { tag: key };
  return { value, tag: spec.tag, taxonomy: spec.taxonomy ?? 'us-gaap', unit: spec.unit ?? 'USD', accn: null, form: '10-K', filed: null, fy: 2024, fp: 'FY', start: flow ? '2024-01-01' : null, end };
}

export function snapshotBank(ticker: string): BankFinancials | null {
  const s = S[ticker];
  if (!s) return null;
  const items: BankFinancials['items'] = {};
  const put = (k: BankKey, value: number, opts: { flow?: boolean; end?: string; formula?: string; estimated?: boolean; tagFrom?: BankKey } = {}) => {
    const f = fact(opts.tagFrom ?? k, value, opts.end ?? FY_END, !!opts.flow);
    items[k] = { value, facts: [f], formula: opts.formula, estimated: opts.estimated } satisfies BankItem;
  };
  put('netIncome', s.ni * B, { flow: true });
  put('preferredDividends', s.pd * B, { flow: true });
  put('netIncomeToCommon', (s.ni - s.pd) * B, { flow: true, formula: 'NetIncomeLoss − preferred dividends' });
  put('nii', s.nii * B, { flow: true });
  put('nonInterestIncome', s.nonII * B, { flow: true });
  put('nonInterestExpense', s.nonIE * B, { flow: true });
  put('provision', s.prov * B, { flow: true });
  put('dividendsPerShare', s.dps, { flow: true });
  put('totalAssets', s.ta * B);
  put('totalEquity', (s.ce + s.pref) * B);
  put('preferred', s.pref * B);
  put('commonEquity', s.ce * B, { formula: 'StockholdersEquity − PreferredStockValue' });
  put('goodwill', s.gw * B);
  put('intangibles', s.int * B);
  put('loans', s.loans * B);
  put('deposits', s.dep * B);
  put('allowance', s.acl * B);
  put('npl', s.npl * B);
  put('cash', s.cash * B);
  put('afs', s.afs * B);
  put('htm', s.htm * B);
  if (s.htmFv !== null) put('htmFairValue', s.htmFv * B);
  put('shares', s.sh * 1e6);
  put('rwa', s.rwa * B, { formula: 'CET1 capital ÷ CET1 ratio' });
  put('cet1', s.cet1R * s.rwa * B);
  put('tier1', s.t1R * s.rwa * B);
  put('totalCapital', s.tcR * s.rwa * B);
  put('commonEquityPrior', s.ceP * B, { end: PRIOR_END, tagFrom: 'commonEquity', formula: 'StockholdersEquity − PreferredStockValue' });
  put('goodwillPrior', s.gw * B, { end: PRIOR_END, tagFrom: 'goodwill' });
  put('intangiblesPrior', s.int * B, { end: PRIOR_END, tagFrom: 'intangibles' });
  put('totalAssetsPrior', s.taP * B, { end: PRIOR_END, tagFrom: 'totalAssets' });
  return {
    ticker,
    name: s.name,
    cik: s.cik,
    sic: s.sic,
    source: 'snapshot',
    fetchedAt: BANK_SNAPSHOT_AS_OF,
    fyEnd: FY_END,
    fyLabel: 'FY2024',
    balanceEnd: FY_END,
    balanceLabel: 'Dec-24',
    items,
    warnings: [],
  };
}

export function snapshotBankMarket(ticker: string): BankMarket | null {
  const s = S[ticker];
  return s ? { price: s.m[0], beta: s.m[1], low52: s.m[2], high52: s.m[3], asOf: BANK_SNAPSHOT_AS_OF, source: 'Approximate snapshot price' } : null;
}
