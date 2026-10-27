import 'server-only';
import type { Intel } from '../types.ts';
import { fetchIntel } from '../sec/feeds.ts';
import type { SegmentBreakdown } from '../sec/parsers.ts';
import { normalizeTicker } from './dataset.ts';
import { cached } from './cache.ts';
import { snapshotCompany } from './snapshot.ts';

const TTL = 12 * 3600_000;

const seg = (axis: SegmentBreakdown['axis'], axisQName: string, rows: [string, number][]): SegmentBreakdown => {
  const lines = rows.map(([label, v]) => ({ member: label, label, value: v * 1e6 }));
  const total = lines.reduce((s, l) => s + l.value, 0);
  return { axis, axisQName, lines, total, reconciles: true };
};

// Offline snapshot: segment revenue as reported in the FY2024 10-K notes (USD millions).
const SNAPSHOT_SEGMENTS: Record<string, { breakdowns: SegmentBreakdown[]; fyEnd: string }> = {
  AAPL: {
    fyEnd: '2024-09-28',
    breakdowns: [
      seg('product', 'srt:ProductOrServiceAxis', [['iPhone', 201183], ['Services', 96169], ['Wearables, Home and Accessories', 37005], ['Mac', 29984], ['iPad', 26694]]),
      seg('business', 'us-gaap:StatementBusinessSegmentsAxis', [['Americas', 167045], ['Europe', 101328], ['Greater China', 66952], ['Rest of Asia Pacific', 30658], ['Japan', 25052]]),
    ],
  },
  DIS: {
    fyEnd: '2024-09-28',
    breakdowns: [seg('business', 'us-gaap:StatementBusinessSegmentsAxis', [['Entertainment', 41186], ['Experiences', 34151], ['Sports', 17619]])],
  },
};

function snapshotIntel(ticker: string, reason: string): Intel {
  const s = SNAPSHOT_SEGMENTS[ticker];
  return {
    ticker,
    cik: '',
    source: 'snapshot',
    segments: s ? { breakdowns: s.breakdowns, accessionNumber: null, filingDate: null, fyEnd: s.fyEnd } : null,
    insiders: null,
    ownership: null,
    governance: null,
    proxy: null,
    fpi: !!snapshotCompany(ticker)?.accounting && snapshotCompany(ticker)!.accounting!.annualForm !== '10-K',
    notes: [reason],
    fetchedAt: new Date().toISOString(),
  };
}

export async function getIntel(raw: string): Promise<Intel> {
  const ticker = normalizeTicker(raw);
  if (process.env.DATA_MODE === 'snapshot') return snapshotIntel(ticker, 'Offline snapshot mode: insider, ownership and 8-K feeds need live SEC access.');
  try {
    return await cached(`intel:${ticker}`, TTL, () => fetchIntel(ticker));
  } catch (e) {
    return snapshotIntel(ticker, `Live SEC feeds failed (${(e as Error).message}).`);
  }
}
