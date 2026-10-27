import 'server-only';
import { defaultDealAssumptions, riskScorecard, runDeal, synergyMax, type DealAssumptions } from './engine.ts';
import { resolveDeal } from './params.ts';
import { DealOutputSchema, type DealOutput } from './schema.ts';
import { getDealPair } from './data.ts';
import { getYieldCurve } from '../market/treasury.ts';

/** Server-side teardown: the same engine the browser runs, from cached SEC data. */
export async function dealRun(acquirer: string, target: string, overrides: Partial<DealAssumptions> = {}) {
  const [{ A, T, warnings }, macro] = await Promise.all([getDealPair(acquirer, target), getYieldCurve()]);
  const defaults = defaultDealAssumptions(A, T, macro.date ? macro.tenYear : undefined);
  const a = resolveDeal(defaults, overrides, synergyMax(T, A));
  const r = runDeal(A, T, a);
  return { A, T, warnings, defaults, a, r, risk: riskScorecard(A, T, a, r), macro };
}

export function toDealOutput(d: Awaited<ReturnType<typeof dealRun>>): DealOutput {
  return DealOutputSchema.parse({
    acquirer: d.A.ticker,
    target: d.T.ticker,
    assumptions: {
      offerPremium: d.a.premium,
      cashMix: d.a.cashPct,
      stockMix: d.a.stockPct,
      debtMix: d.a.debtPct,
      preTaxSynergies: d.a.synergies,
      debtRate: d.a.debtRate,
      cashRate: d.a.cashRate,
      taxRate: d.a.taxRate,
    },
    equityPurchasePrice: d.r.equityPurchasePrice,
    offerPricePerShare: d.r.offerPrice,
    standaloneEps: d.r.standaloneEps,
    proFormaEps: d.r.proFormaEps,
    accretionDilutionPct: d.r.accretion * 100,
    proFormaNetIncome: d.r.proFormaNetIncome,
    proFormaShares: d.r.proFormaShares,
    breakevenSynergies: d.r.breakevenSynergies,
    proFormaDebtToEbitda: Number.isFinite(d.r.leverage.proForma) ? d.r.leverage.proForma : null,
    risk: d.risk.map(({ id, rating, headline }) => ({ id, rating, headline })),
  });
}
