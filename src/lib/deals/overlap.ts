// PRD v2 appendix A (DealPulse): product-line and geographic overlap between the
// acquirer and target, from each company's 10-K segment disaggregation.

import type { SegmentBreakdown } from '../sec/parsers.ts';

const REGIONS: [RegExp, string][] = [
  [/united states|u\.s\.|\bus\b|domestic|north america|americas|canada|latin america|mexico|brazil/i, 'Americas'],
  [/europe|emea|united kingdom|\buk\b|germany|france|ireland|netherlands|middle east|africa/i, 'EMEA'],
  [/china|greater china|taiwan|hong kong|japan|asia|pacific|apac|india|korea|singapore|australia/i, 'Asia Pacific'],
];

const bucket = (label: string) => REGIONS.find(([re]) => re.test(label))?.[1] ?? 'Other';

export function geoMix(b: SegmentBreakdown): Record<string, number> {
  const sum = b.lines.reduce((s, l) => s + l.value, 0);
  const out: Record<string, number> = {};
  for (const l of b.lines) out[bucket(l.label)] = (out[bucket(l.label)] ?? 0) + l.value / sum;
  return out;
}

/** 1 - total-variation distance between the two regional mixes (1 = identical footprint). */
export function geoOverlap(a: SegmentBreakdown | null | undefined, b: SegmentBreakdown | null | undefined): number | null {
  if (!a || !b) return null;
  const ma = geoMix(a);
  const mb = geoMix(b);
  const keys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  let dist = 0;
  for (const k of keys) dist += Math.abs((ma[k] ?? 0) - (mb[k] ?? 0));
  return 1 - dist / 2;
}

const STOP = new Set(['and', 'the', 'of', 'other', 'products', 'product', 'services', 'service', 'segment', 'total', 'revenue', 'net', 'sales', 'all', 'member', 'inc', 'group', 'business', 'solutions', 'related', '&']);
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Share of the target's revenue in lines whose name shares a meaningful word with an acquirer line. */
export function productOverlap(acq: SegmentBreakdown | null | undefined, tgt: SegmentBreakdown | null | undefined): { share: number; matches: string[] } | null {
  if (!acq || !tgt) return null;
  const vocab = new Set(acq.lines.flatMap((l) => words(l.label).map((w) => w.replace(/s$/, ''))));
  const sum = tgt.lines.reduce((s, l) => s + l.value, 0);
  const hits = tgt.lines.filter((l) => words(l.label).some((w) => vocab.has(w.replace(/s$/, ''))));
  return { share: hits.reduce((s, l) => s + l.value, 0) / sum, matches: hits.map((l) => l.label) };
}

export const geoBreakdown = (bs: SegmentBreakdown[] | undefined) => bs?.find((b) => b.axis === 'geography') ?? bs?.find((b) => b.axis === 'business' && b.lines.every((l) => bucket(l.label) !== 'Other'));
export const productBreakdown = (bs: SegmentBreakdown[] | undefined) => bs?.find((b) => b.axis === 'product') ?? bs?.find((b) => b.axis === 'business' && b.lines.some((l) => bucket(l.label) === 'Other'));
