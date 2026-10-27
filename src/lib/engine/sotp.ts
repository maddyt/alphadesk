// Default sum-of-the-parts set-up (PRD v2 appendix A): pick the product/business
// breakdown and give each line an EV/revenue multiple, tilted up for recurring,
// high-margin lines (services, software, advertising) and down for hardware and
// physical retail. Users override every multiple in the UI.

import type { SegmentBreakdown } from '../sec/parsers.ts';
import type { SotpInput } from './valuation.ts';

const UP = /service|software|subscription|cloud|advertis|licens|platform|digital|data|payment|content|streaming|gaming|game|saas|azure|aws/i;
const DOWN = /hardware|device|iphone|ipad|mac\b|wearable|accessor|product|equipment|automotive|retail|store|grocery|fuel|parks|experience|consumer products/i;

export function segmentTilt(label: string): number {
  if (UP.test(label)) return 1.5;
  if (DOWN.test(label)) return 0.75;
  return 1;
}

export function pickBreakdown(bs: SegmentBreakdown[]): SegmentBreakdown | null {
  return bs.find((b) => b.axis === 'product') ?? bs.find((b) => b.axis === 'business') ?? null;
}

export function defaultSotp(bs: SegmentBreakdown[], baseMultiple: number, fyLabel: string): SotpInput | null {
  const b = pickBreakdown(bs);
  if (!b || !(baseMultiple > 0)) return null;
  return {
    axisLabel: b.axis === 'product' ? 'product / service' : 'business segment',
    fyLabel,
    lines: b.lines.map((l) => ({ label: l.label, revenue: l.value, multiple: Math.round(baseMultiple * segmentTilt(l.label) * 4) / 4 })),
  };
}
