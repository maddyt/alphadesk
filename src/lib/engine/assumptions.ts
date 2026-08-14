import type { Assumptions, CompanyMeta } from './types.ts';

/** Engine defaults. Every value is user-overridable per scenario. */
export function defaultAssumptions(meta: Pick<CompanyMeta, 'beta'>, env?: Partial<{ rf: number; erp: number; terminalGrowth: number }>): Assumptions {
  return {
    revenue: { growthMin: -0.15, growthMax: 0.40, longTermGrowth: 0.035, decayOverride: null },
    margin: { stability: 0.7, trendDamp: 0.3, mode: 'auto', sectorBlend: 0.25 },
    capex: { override: null },
    interest: { borrowRateOverride: null, yieldRateOverride: null, otherRatioOverride: null },
    debt: { method: 'current', nbRevRatio: 0.15, decayToZero: true, legacyClamp: 0.20 },
    dcf: {
      rf: env?.rf ?? 0.046,
      erp: env?.erp ?? 0.0446,
      beta: meta.beta ?? 1.0,
      minCoE: 0.06, maxCoE: 0.16,
      terminalGrowth: env?.terminalGrowth ?? 0.025,
      nbOcfCap: 0.5, midYear: true,
    },
    flags: { sharesLink: true, sbcDeduct: true },
  };
}

/** Deep-merge a partial override (from the scenario builder) onto the defaults. */
export function withOverrides(base: Assumptions, o?: DeepPartial<Assumptions>): Assumptions {
  if (!o) return base;
  return {
    revenue: { ...base.revenue, ...o.revenue },
    margin: { ...base.margin, ...o.margin },
    capex: { ...base.capex, ...o.capex },
    interest: { ...base.interest, ...o.interest },
    debt: { ...base.debt, ...o.debt },
    dcf: { ...base.dcf, ...o.dcf },
    flags: { ...base.flags, ...o.flags },
  } as Assumptions;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };

export const SECTOR_MEDIAN_BLEND_DEFAULT = 0.25;
export const PROJECTION_YEARS = 5;
