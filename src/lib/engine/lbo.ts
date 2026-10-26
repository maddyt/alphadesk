// LBO floor: the highest entry price a financial sponsor could pay and still earn
// its hurdle IRR, given a leverage package and an exit multiple. Debt is serviced
// from free cash flow with a 100% cash sweep.

import type { Assumptions, BaseInputs } from './model.ts';
import { projectOperations } from './model.ts';
import { bisect } from './stats.ts';

export const LBO_FEES_PCT = 0.02; // transaction + financing fees, % of entry EV
export const LBO_MAX_LTV = 0.75; // debt capped at 75% of purchase price
export const LBO_HOLD_YEARS = 5;

export interface LboYear {
  label: string;
  ebitda: number;
  interest: number;
  taxes: number;
  capex: number;
  dNwc: number;
  fcf: number;
  paydown: number;
  endingDebt: number;
  cash: number;
}

export interface LboResult {
  entryMultiple: number;
  entryEv: number;
  fees: number;
  debt: number;
  sponsorEquity: number;
  leverage: number;
  exitMultiple: number;
  exitEv: number;
  exitEquity: number;
  moic: number;
  irr: number;
  years: LboYear[];
}

export function runLbo(b: BaseInputs, a: Assumptions, entryMultiple: number, leverage = a.lboLeverage, exitMultiple = a.exitMultiple): LboResult {
  const ebitda0 = b.ltmEbitda;
  const entryEv = entryMultiple * ebitda0;
  const fees = entryEv * LBO_FEES_PCT;
  const debt0 = Math.min(leverage * ebitda0, entryEv * LBO_MAX_LTV);
  const sponsorEquity = entryEv + fees - debt0;

  const ops = projectOperations(b, a);
  let debt = debt0;
  let cash = 0;
  const years: LboYear[] = ops.slice(0, LBO_HOLD_YEARS).map((y) => {
    const interest = debt * a.lboInterestRate;
    const taxes = Math.max(0, y.ebit - interest) * a.taxRate;
    const fcf = y.ebitda - interest - taxes - y.capex - y.dNwc;
    const paydown = Math.min(debt, Math.max(0, fcf));
    debt -= paydown;
    cash += fcf - paydown;
    return { label: y.label, ebitda: y.ebitda, interest, taxes, capex: y.capex, dNwc: y.dNwc, fcf, paydown, endingDebt: debt, cash };
  });

  const exitEbitda = years[years.length - 1].ebitda;
  const exitEv = exitMultiple * exitEbitda;
  const exitEquity = exitEv - debt + cash;
  const moic = exitEquity / sponsorEquity;
  const irr = moic > 0 ? moic ** (1 / LBO_HOLD_YEARS) - 1 : -1;
  return { entryMultiple, entryEv, fees, debt: debt0, sponsorEquity, leverage, exitMultiple, exitEv, exitEquity, moic, irr, years };
}

/** Solve for the entry EV/EBITDA multiple that yields exactly the target IRR. */
export function solveLboFloor(b: BaseInputs, a: Assumptions, leverage = a.lboLeverage, exitMultiple = a.exitMultiple, targetIrr = a.lboTargetIrr): LboResult | null {
  if (!(b.ltmEbitda > 0)) return null;
  const x = bisect((m) => runLbo(b, a, m, leverage, exitMultiple).irr - targetIrr, 1, 80, 1e-6);
  if (!Number.isFinite(x)) return null;
  return runLbo(b, a, x, leverage, exitMultiple);
}
