// Pure parsers for the extended SEC feeds (PRD v2 appendix): submissions index,
// 8-K items, Form 4 insider trades, Schedule 13D/G headers, segment revenue from
// a 10-K XBRL instance, and the XBRL label linkbase. No I/O, so they are unit-tested.

export interface FilingRef {
  form: string;
  filingDate: string;
  accessionNumber: string;
  primaryDocument: string;
  items: string;
  reportDate: string;
}

export interface SubmissionsJson {
  cik?: string;
  name?: string;
  sic?: string;
  sicDescription?: string;
  filings?: { recent?: Record<string, (string | number)[]> };
}

export function recentFilings(s: SubmissionsJson): FilingRef[] {
  const r = s.filings?.recent;
  if (!r || !Array.isArray(r.form)) return [];
  return r.form.map((_, i) => ({
    form: String(r.form[i] ?? ''),
    filingDate: String(r.filingDate?.[i] ?? ''),
    accessionNumber: String(r.accessionNumber?.[i] ?? ''),
    primaryDocument: String(r.primaryDocument?.[i] ?? ''),
    items: String(r.items?.[i] ?? ''),
    reportDate: String(r.reportDate?.[i] ?? ''),
  }));
}

const monthsAgo = (iso: string, now: Date) => (now.getTime() - Date.parse(iso)) / (30.44 * 86400_000);

/* ------------------------------------------------------------ 8-K scorecard */

export type Severity = 'red' | 'amber' | 'info';

export interface GovernanceFlag {
  severity: Severity;
  code: string;
  title: string;
  filingDate: string;
  form: string;
  accessionNumber: string;
}

const ITEM_FLAGS: Record<string, { severity: Severity; title: string }> = {
  '4.02': { severity: 'red', title: 'Non-reliance on previously issued financial statements (restatement)' },
  '4.01': { severity: 'amber', title: 'Change in certifying accountant' },
  '1.03': { severity: 'red', title: 'Bankruptcy or receivership' },
  '2.06': { severity: 'amber', title: 'Material impairment' },
  '3.01': { severity: 'amber', title: 'Delisting notice or failure to meet listing standards' },
  '5.02': { severity: 'info', title: 'Director or officer departure / appointment' },
};

/** Scan the last `months` of filings for accounting and governance red flags. */
export function governanceFlags(filings: FilingRef[], now = new Date(), months = 24): GovernanceFlag[] {
  const out: GovernanceFlag[] = [];
  for (const f of filings) {
    if (!f.filingDate || monthsAgo(f.filingDate, now) > months) continue;
    if (f.form === '8-K' || f.form === '8-K/A') {
      for (const item of f.items.split(',').map((x) => x.trim())) {
        const flag = ITEM_FLAGS[item];
        if (flag) out.push({ severity: flag.severity, code: `8-K Item ${item}`, title: flag.title, filingDate: f.filingDate, form: f.form, accessionNumber: f.accessionNumber });
      }
    } else if (f.form === '10-K/A' || f.form === '10-Q/A') {
      out.push({ severity: 'amber', code: f.form, title: 'Amended periodic report', filingDate: f.filingDate, form: f.form, accessionNumber: f.accessionNumber });
    } else if (f.form === 'NT 10-K' || f.form === 'NT 10-Q') {
      out.push({ severity: 'amber', code: f.form, title: 'Late filing notice', filingDate: f.filingDate, form: f.form, accessionNumber: f.accessionNumber });
    }
  }
  return out;
}

export function governanceRating(flags: GovernanceFlag[]): 'green' | 'amber' | 'red' {
  if (flags.some((f) => f.severity === 'red')) return 'red';
  if (flags.some((f) => f.severity === 'amber')) return 'amber';
  return 'green';
}

/* --------------------------------------------------------------- Form 4 */

export interface InsiderTrade {
  owner: string;
  title: string;
  date: string;
  code: string; // P open-market buy, S open-market sale, etc.
  shares: number;
  price: number;
  value: number;
  acquired: boolean;
  accessionNumber: string;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`))?.[1] ?? '';
const valueOf = (xml: string, name: string) => tag(tag(xml, name) || '', 'value') || tag(xml, name);
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();

/** Non-derivative transactions from a Form 4 XML document. */
export function parseForm4(xml: string, accessionNumber: string): InsiderTrade[] {
  const owner = decode(tag(tag(xml, 'reportingOwnerId'), 'rptOwnerName'));
  const rel = tag(xml, 'reportingOwnerRelationship');
  const title =
    decode(tag(rel, 'officerTitle')) ||
    (/(1|true)/.test(tag(rel, 'isDirector')) ? 'Director' : /(1|true)/.test(tag(rel, 'isTenPercentOwner')) ? '10% owner' : 'Insider');
  const out: InsiderTrade[] = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)) {
    const t = m[1];
    const shares = Number(valueOf(t, 'transactionShares'));
    const price = Number(valueOf(t, 'transactionPricePerShare')) || 0;
    const code = tag(tag(t, 'transactionCoding'), 'transactionCode');
    if (!Number.isFinite(shares) || !code) continue;
    out.push({
      owner,
      title,
      date: valueOf(t, 'transactionDate').slice(0, 10),
      code,
      shares,
      price,
      value: shares * price,
      acquired: valueOf(t, 'transactionAcquiredDisposedCode') === 'A',
      accessionNumber,
    });
  }
  return out;
}

export interface InsiderSummary {
  buys: number; // open-market purchase value (code P)
  sells: number; // open-market sale value (code S)
  buyers: number;
  sellers: number;
  filings: number;
  trades: InsiderTrade[];
  signal: 'buying' | 'selling' | 'neutral';
}

export function summarizeInsiders(trades: InsiderTrade[], filings: number): InsiderSummary {
  const p = trades.filter((t) => t.code === 'P');
  const s = trades.filter((t) => t.code === 'S');
  const buys = p.reduce((a, t) => a + t.value, 0);
  const sells = s.reduce((a, t) => a + t.value, 0);
  const signal = buys > sells * 0.5 && buys > 0 ? 'buying' : sells > 0 && sells > buys * 4 ? 'selling' : 'neutral';
  return {
    buys,
    sells,
    buyers: new Set(p.map((t) => t.owner)).size,
    sellers: new Set(s.map((t) => t.owner)).size,
    filings,
    trades: [...p, ...s].sort((a, b) => b.value - a.value),
    signal,
  };
}

/** Form 4 primary documents are listed as the XSL-rendered path; the raw XML sits one level up. */
export function rawForm4Path(primaryDocument: string): string {
  return primaryDocument.replace(/^xslF345X\d+\//, '');
}

/* ----------------------------------------------------------- Schedule 13D/G */

export interface OwnershipFiling {
  form: string;
  filingDate: string;
  accessionNumber: string;
  filer: string;
  activist: boolean; // 13D = intent to influence control
}

export const OWNERSHIP_FORMS = ['SC 13D', 'SC 13D/A', 'SC 13G', 'SC 13G/A', 'SCHEDULE 13D', 'SCHEDULE 13D/A', 'SCHEDULE 13G', 'SCHEDULE 13G/A'];

/** Filer name from an EDGAR .hdr.sgml header ("FILED BY:" block). */
export function filerFromHeader(sgml: string): string {
  const block = sgml.split(/FILED BY:/i)[1] ?? '';
  return decode(block.match(/COMPANY CONFORMED NAME:\s*(.+)/i)?.[1] ?? '') || 'Unknown filer';
}

/* ------------------------------------------------- Segment revenue (10-K XBRL) */

export interface SegmentLine {
  member: string; // QName, e.g. aapl:IPhoneMember
  label: string;
  value: number;
}

export interface SegmentBreakdown {
  axis: 'product' | 'business' | 'geography';
  axisQName: string;
  lines: SegmentLine[];
  total: number;
  reconciles: boolean; // lines sum to reported total within 2%
}

const AXES: Record<string, SegmentBreakdown['axis']> = {
  'srt:ProductOrServiceAxis': 'product',
  'us-gaap:StatementBusinessSegmentsAxis': 'business',
  'srt:StatementGeographicalAxis': 'geography',
};

const REVENUE_TAGS = ['us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap:Revenues', 'us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax'];

interface Ctx {
  start: string;
  end: string;
  members: [string, string][]; // [dimension, member]
}

function parseContexts(xml: string): Map<string, Ctx> {
  const out = new Map<string, Ctx>();
  for (const m of xml.matchAll(/<(?:xbrli:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:xbrli:)?context>/g)) {
    const body = m[2];
    const start = body.match(/<(?:xbrli:)?startDate>([^<]+)</)?.[1] ?? '';
    const end = body.match(/<(?:xbrli:)?endDate>([^<]+)</)?.[1] ?? body.match(/<(?:xbrli:)?instant>([^<]+)</)?.[1] ?? '';
    const members: [string, string][] = [];
    for (const e of body.matchAll(/<xbrldi:explicitMember[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)) members.push([e[1], e[2]]);
    if (body.includes('typedMember')) members.push(['typed', 'typed']);
    out.set(m[1], { start: start.trim(), end: end.trim(), members });
  }
  return out;
}

/** "aapl:WearablesHomeandAccessoriesMember" -> "Wearables Homeand Accessories" (fallback when no label linkbase). */
export function prettifyMember(qname: string): string {
  const local = qname.split(':').pop() ?? qname;
  return local
    .replace(/Member$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/** Drop members that are subtotals of other members (e.g. "Products" alongside iPhone + Mac + iPad). */
export function dropSubtotals(lines: SegmentLine[], total?: number): SegmentLine[] {
  let cur = [...lines].sort((a, b) => b.value - a.value); // subtotals are the large values, test them first
  const ties = () => total !== undefined && Math.abs(cur.reduce((s, l) => s + l.value, 0) - total) <= Math.abs(total) * 0.02;
  for (let pass = 0; pass < 3; pass++) {
    if (ties()) break;
    const subtotal = cur.find((l) => {
      const others = cur.filter((o) => o !== l && o.value < l.value);
      if (others.length < 2 || others.length > 14) return false;
      for (let mask = 3; mask < 1 << others.length; mask++) {
        if ((mask & (mask - 1)) === 0) continue; // need at least two parts
        let s = 0;
        for (let i = 0; i < others.length; i++) if (mask & (1 << i)) s += others[i].value;
        if (Math.abs(s - l.value) <= Math.abs(l.value) * 0.002) return true;
      }
      return false;
    });
    if (!subtotal) break;
    cur = cur.filter((l) => l !== subtotal);
  }
  return cur;
}

/**
 * Revenue by product/business segment and by geography for the fiscal year ending `fyEnd`.
 * Uses single-dimension contexts only, so intersections (segment x geography) are ignored.
 */
export function parseSegments(instanceXml: string, fyEnd: string, labels: Map<string, string> = new Map()): SegmentBreakdown[] {
  const ctx = parseContexts(instanceXml);
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) <= 10 * 86400_000;
  const yearLong = (c: Ctx) => c.start && (Date.parse(c.end) - Date.parse(c.start)) / 86400_000 > 340;

  for (const revTag of REVENUE_TAGS) {
    const re = new RegExp(`<${revTag.replace(':', ':')}\\b[^>]*contextRef="([^"]+)"[^>]*>([^<]+)</${revTag}>`, 'g');
    let total: number | undefined;
    const byAxis = new Map<string, Map<string, number>>();
    for (const m of instanceXml.matchAll(re)) {
      const c = ctx.get(m[1]);
      const v = Number(m[2]);
      if (!c || !Number.isFinite(v) || !yearLong(c) || !near(c.end, fyEnd)) continue;
      if (c.members.length === 0) total = v;
      else if (c.members.length === 1 && AXES[c.members[0][0]]) {
        const [dim, mem] = c.members[0];
        if (!byAxis.has(dim)) byAxis.set(dim, new Map());
        byAxis.get(dim)!.set(mem, v);
      }
    }
    if (byAxis.size === 0) continue;
    const out: SegmentBreakdown[] = [];
    for (const [dim, mems] of byAxis) {
      let lines = [...mems].map(([member, value]) => ({ member, value, label: labels.get(member) ?? prettifyMember(member) }));
      lines = dropSubtotals(lines, total).filter((l) => l.value > 0);
      if (lines.length < 2) continue;
      const sum = lines.reduce((s, l) => s + l.value, 0);
      const t = total ?? sum;
      out.push({ axis: AXES[dim], axisQName: dim, lines: lines.sort((a, b) => b.value - a.value), total: t, reconciles: Math.abs(sum - t) <= Math.abs(t) * 0.02 });
    }
    if (out.length) return out.sort((a, b) => ['product', 'business', 'geography'].indexOf(a.axis) - ['product', 'business', 'geography'].indexOf(b.axis));
  }
  return [];
}

/** Member QName -> human label from an XBRL label linkbase (_lab.xml). */
export function parseLabels(labXml: string): Map<string, string> {
  const locs = new Map<string, string>(); // loc label -> qname
  for (const m of labXml.matchAll(/<link:loc\b[^>]*xlink:href="[^"#]*#([^"]+)"[^>]*xlink:label="([^"]+)"[^>]*\/?>/g)) locs.set(m[2], m[1]);
  for (const m of labXml.matchAll(/<link:loc\b[^>]*xlink:label="([^"]+)"[^>]*xlink:href="[^"#]*#([^"]+)"[^>]*\/?>/g)) locs.set(m[1], m[2]);
  const arcs = new Map<string, string>(); // label resource -> loc label
  for (const m of labXml.matchAll(/<link:labelArc\b([^>]*)\/?>/g)) {
    const from = m[1].match(/xlink:from="([^"]+)"/)?.[1];
    const to = m[1].match(/xlink:to="([^"]+)"/)?.[1];
    if (from && to) arcs.set(to, from);
  }
  const out = new Map<string, string>();
  const rank = (role: string) => (role.endsWith('/terseLabel') ? 0 : role.endsWith('/label') ? 1 : 2);
  const best = new Map<string, number>();
  for (const m of labXml.matchAll(/<link:label\b([^>]*)>([\s\S]*?)<\/link:label>/g)) {
    const attrs = m[1];
    const resLabel = attrs.match(/xlink:label="([^"]+)"/)?.[1];
    const role = attrs.match(/xlink:role="([^"]+)"/)?.[1] ?? '';
    if (!resLabel || rank(role) > 1) continue;
    const loc = arcs.get(resLabel);
    const id = loc ? locs.get(loc) : undefined;
    if (!id) continue;
    const qname = id.replace(/_/, ':'); // aapl_IPhoneMember -> aapl:IPhoneMember
    if (!qname.endsWith('Member')) continue;
    const r = rank(role);
    if ((best.get(qname) ?? 9) <= r) continue;
    best.set(qname, r);
    out.set(qname, decode(m[2].replace(/\s*\[Member\]\s*$/, '')));
  }
  return out;
}

/* -------------------------------------------------------- Treasury yield curve */

export interface YieldCurve {
  date: string;
  points: { tenor: string; years: number; rate: number }[];
  tenYear: number;
  source: string;
}

const TENORS: [RegExp, string, number][] = [
  [/^1 Mo/, '1M', 1 / 12],
  [/^2 Mo/, '2M', 2 / 12],
  [/^3 Mo/, '3M', 0.25],
  [/^4 Mo/, '4M', 4 / 12],
  [/^6 Mo/, '6M', 0.5],
  [/^1 Yr/, '1Y', 1],
  [/^2 Yr/, '2Y', 2],
  [/^3 Yr/, '3Y', 3],
  [/^5 Yr/, '5Y', 5],
  [/^7 Yr/, '7Y', 7],
  [/^10 Yr/, '10Y', 10],
  [/^20 Yr/, '20Y', 20],
  [/^30 Yr/, '30Y', 30],
];

/** Latest row of the Treasury "daily par yield curve" CSV (rates in percent). */
export function parseTreasuryCsv(csv: string): YieldCurve | null {
  const rows = csv.trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/^"|"$/g, '').trim()));
  if (rows.length < 2) return null;
  const head = rows[0];
  const latest = rows.slice(1).sort((a, b) => Date.parse(b[0]) - Date.parse(a[0]))[0];
  const points: YieldCurve['points'] = [];
  head.forEach((h, i) => {
    const t = TENORS.find(([re]) => re.test(h));
    const v = Number(latest[i]);
    if (t && Number.isFinite(v) && latest[i] !== '') points.push({ tenor: t[1], years: t[2], rate: v / 100 });
  });
  const ten = points.find((p) => p.tenor === '10Y');
  if (!ten) return null;
  const d = new Date(latest[0]);
  return { date: Number.isNaN(d.getTime()) ? latest[0] : d.toISOString().slice(0, 10), points, tenYear: ten.rate, source: 'U.S. Treasury daily par yield curve' };
}

/** FRED fallback (fredgraph.csv?id=DGS10): last non-empty observation. */
export function parseFredCsv(csv: string): { date: string; rate: number } | null {
  const rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = Number(rows[i][1]);
    if (rows[i][1] && rows[i][1] !== '.' && Number.isFinite(v)) return { date: rows[i][0], rate: v / 100 };
  }
  return null;
}
