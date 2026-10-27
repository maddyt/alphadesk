// Fact sheet for the AI deal memo: every number the model may use, computed by the engine.

import type { FactEntry, Unit } from '../ai/facts.ts';
import { show } from '../ai/facts.ts';
import type { DealAssumptions, DealCompany, DealResult } from './engine.ts';

export function buildDealFacts(A: DealCompany, T: DealCompany, a: DealAssumptions, r: DealResult): FactEntry[] {
  const f: FactEntry[] = [];
  const add = (id: string, label: string, value: number, unit: Unit, digits = 1) => {
    if (Number.isFinite(value)) f.push({ id, label, value, unit, display: show(value, unit, digits) });
  };
  add('acq_price', `${A.ticker} share price`, A.price, 'usd_ps');
  add('tgt_price', `${T.ticker} share price`, T.price, 'usd_ps');
  add('acq_mcap', `${A.ticker} market cap`, A.marketCap, 'usd');
  add('tgt_mcap', `${T.ticker} market cap`, T.marketCap, 'usd');
  add('acq_ni', `${A.ticker} ${A.ltmLabel} net income`, A.netIncome, 'usd');
  add('tgt_ni', `${T.ticker} ${T.ltmLabel} net income`, T.netIncome, 'usd');
  add('acq_rev', `${A.ticker} revenue`, A.revenue, 'usd');
  add('tgt_rev', `${T.ticker} revenue`, T.revenue, 'usd');
  add('tgt_ebitda', `${T.ticker} EBITDA`, T.ebitda, 'usd');
  add('premium', 'Offer premium', a.premium, 'pct');
  add('offer_price', 'Offer price per target share', r.offerPrice, 'usd_ps');
  add('equity_price', 'Equity purchase price', r.equityPurchasePrice, 'usd');
  add('ev_price', 'Enterprise purchase price', r.enterprisePurchasePrice, 'usd');
  add('cash_mix', 'Paid in cash', a.cashPct, 'pct');
  add('stock_mix', 'Paid in stock', a.stockPct, 'pct');
  add('debt_mix', 'Funded with new debt', a.debtPct, 'pct');
  add('new_debt', 'New acquisition debt', r.newDebt, 'usd');
  add('synergies', 'Pre-tax synergies', a.synergies, 'usd');
  add('at_synergies', 'After-tax synergies', r.afterTaxSynergies, 'usd');
  add('pf_ni', 'Pro-forma net income', r.proFormaNetIncome, 'usd');
  add('eps_sa', `${A.ticker} standalone EPS`, r.standaloneEps, 'usd_ps');
  add('eps_pf', 'Pro-forma EPS', r.proFormaEps, 'usd_ps');
  add('accretion', 'EPS accretion / (dilution)', r.accretion, 'pct');
  add('breakeven_syn', 'Breakeven pre-tax synergies', r.breakevenSynergies, 'usd');
  if (r.maxPremium !== null) add('max_premium', 'Highest accretive premium', r.maxPremium, 'pct');
  add('own_tgt', 'Target holders’ pro-forma ownership', r.ownershipTarget, 'pct');
  add('own_acq', 'Acquirer holders’ pro-forma ownership', r.ownershipAcquirer, 'pct');
  add('ev_ebitda', 'Purchase EV / EBITDA', r.multiples.evEbitda, 'x');
  add('ev_rev', 'Purchase EV / revenue', r.multiples.evRevenue, 'x');
  add('pe', 'Purchase P/E', r.multiples.pe, 'x');
  add('lev_sa', 'Acquirer debt / EBITDA today', r.leverage.standalone, 'x');
  add('lev_pf', 'Pro-forma debt / EBITDA', r.leverage.proForma, 'x');
  add('rel_size', 'Target revenue as % of acquirer revenue', r.relativeSize, 'pct');
  return f;
}
