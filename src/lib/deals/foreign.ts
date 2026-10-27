// Foreign private issuers in DealPulse: currency conversion and ADR share ratios.
// Pure functions, unit-tested.

import type { CompanyFinancials, LineItems, Period } from '../types.ts';

/**
 * Ordinary shares represented by one US-listed ADR/ADS. SEC cover pages report
 * ordinary shares, while the US price is per ADR, so market value = ADR price x
 * (ordinary shares / ratio). 1 means the US line trades 1:1 (or is the ordinary share).
 */
export const ADR_RATIOS: Record<string, number> = {
  TSM: 5, TM: 10, SONY: 1, ASML: 1, SAP: 1, NVO: 1, NVS: 1, UL: 1, BP: 6, SHEL: 2, AZN: 0.5, GSK: 2, SNY: 0.5, HSBC: 5,
  BABA: 8, BIDU: 8, NTES: 5, JD: 2, PDD: 4, INFY: 1, ARM: 1, SPOT: 1, DEO: 4, BUD: 1, TTE: 1, RIO: 1, BHP: 2, HMC: 1,
  MUFG: 1, SMFG: 0.2, NMR: 1, ERIC: 1, NOK: 1, STLA: 1, RELX: 1, LYG: 4, BCS: 4, ING: 1, SAN: 1, BBVA: 1, ABEV: 1, VALE: 1, PBR: 2,
};

export function adrRatio(ticker: string): { ratio: number; known: boolean } {
  const r = ADR_RATIOS[ticker.toUpperCase()];
  return r ? { ratio: r, known: true } : { ratio: 1, known: false };
}

const SHARE_KEYS = new Set(['sharesOutstanding', 'sharesDiluted']);

function convertItems(items: LineItems, rate: number): LineItems {
  const out: LineItems = {};
  for (const [k, it] of Object.entries(items)) {
    if (!it) continue;
    // Facts keep the as-reported currency for the audit trail; the engine value is in USD.
    (out as Record<string, unknown>)[k] = SHARE_KEYS.has(k) ? it : { ...it, value: it.value * rate };
  }
  return out;
}

const convertPeriod = (p: Period, rate: number): Period => ({ ...p, items: convertItems(p.items, rate) });

/** Statements in USD at a single spot rate (a simplification: flows strictly use period-average rates). */
export function toUsd(c: CompanyFinancials, fx: { rate: number; asOf: string; source: string }): CompanyFinancials {
  const acc = c.accounting;
  if (!acc || acc.currency === 'USD') return c;
  return {
    ...c,
    years: c.years.map((y) => convertPeriod(y, fx.rate)),
    ltm: convertPeriod(c.ltm, fx.rate),
    balance: convertPeriod(c.balance, fx.rate),
    accounting: { ...acc, fx },
  };
}

/** Convert ordinary-share counts into ADR-equivalents so they pair with the US price. */
export function toAdrShares(c: CompanyFinancials, ratio: number): CompanyFinancials {
  if (ratio === 1) return c;
  const adj = (items: LineItems): LineItems => {
    const out = { ...items };
    for (const k of SHARE_KEYS) {
      const it = out[k as 'sharesOutstanding'];
      if (it) (out as Record<string, unknown>)[k] = { ...it, value: it.value / ratio, formula: `${it.formula ? it.formula + '; ' : ''}ordinary shares ÷ ${ratio} per ADR` };
    }
    return out;
  };
  return { ...c, years: c.years.map((y) => ({ ...y, items: adj(y.items) })), ltm: { ...c.ltm, items: adj(c.ltm.items) }, balance: { ...c.balance, items: adj(c.balance.items) } };
}
