// Fact sheet for the AI bank analysis: every number the model may use, computed by the engine.

import type { FactEntry, Unit } from '../ai/facts.ts';
import { show } from '../ai/facts.ts';
import type { BankAssumptions, BankRun } from './engine.ts';

export function buildBankFacts(run: BankRun, a: BankAssumptions): FactEntry[] {
  const { i, reg, ddm, stack, stress } = run;
  const f: FactEntry[] = [];
  const add = (id: string, label: string, value: number | null | undefined, unit: Unit, digits = 1) => {
    if (value !== null && value !== undefined && Number.isFinite(value)) f.push({ id, label, value, unit, display: show(value, unit, digits) });
  };
  add('price', 'Share price', i.price, 'usd_ps');
  add('tbvps', 'Tangible book value per share', i.tbvps, 'usd_ps');
  add('ptbv', 'Price / tangible book', i.ptbv, 'x');
  add('roatce', 'ROATCE (reported)', i.roatce, 'pct');
  add('roatce_used', 'ROATCE used for valuation', a.roatce, 'pct');
  add('pe', 'Price / earnings', i.pe, 'x');
  add('div_yield', 'Dividend yield', i.divYield, 'pct');
  add('tce', 'Tangible common equity', i.tce, 'usd');
  add('niac', 'Net income to common', i.niac, 'usd');
  add('assets', 'Total assets', i.totalAssets, 'usd');
  add('deposits', 'Deposits', i.deposits, 'usd');
  add('loans', 'Loans', i.loans, 'usd');
  add('nim', 'NII / average assets', i.nim, 'pct', 2);
  add('efficiency', 'Efficiency ratio', i.efficiency, 'pct');
  add('npl_ratio', 'Nonperforming loans / loans', i.nplRatio, 'pct', 2);
  add('acl_ratio', 'Allowance / loans', i.aclRatio, 'pct', 2);
  add('ldr', 'Loans / deposits', i.ldr, 'pct');
  add('cet1_ratio', 'CET1 ratio', i.cet1Ratio, 'pct');
  add('tier1_ratio', 'Tier 1 ratio', i.tier1Ratio, 'pct');
  add('total_cap_ratio', 'Total capital ratio', i.totalCapitalRatio, 'pct');
  add('tce_ratio', 'TCE / tangible assets', i.tceRatio, 'pct');
  add('target_cet1', 'Target CET1 ratio', a.targetCet1, 'pct');
  add('cet1_req', 'CET1 minimum + conservation buffer', stack.requirement.cet1, 'pct');
  add('excess_cet1', 'CET1 above target', stack.excessToTarget, 'usd');
  add('injection', 'CET1 needed to reach target', stack.injectionToTarget, 'usd');
  add('reg_alpha', 'Regression intercept', reg.fit.alpha, 'num');
  add('reg_beta', 'Regression slope', reg.fit.beta, 'num');
  add('reg_r2', 'Regression R²', reg.fit.r2, 'num');
  add('implied_ptbv', 'Regression-implied P/TBV', reg.impliedPtbv, 'x');
  add('implied_price_reg', 'Regression-implied price', reg.impliedPrice, 'usd_ps');
  add('residual', 'P/TBV residual vs line', reg.targetResidual, 'x');
  add('ke', 'Cost of equity', a.ke, 'pct');
  add('loan_growth', 'Loan growth (stage 1)', a.loanGrowth, 'pct');
  add('terminal_growth', 'Terminal growth', a.terminalGrowth, 'pct');
  add('ddm_value', 'DDM value per share', ddm.perShare, 'usd_ps');
  add('ddm_ptbv', 'DDM-implied P/TBV', ddm.impliedPtbv, 'x');
  add('ddm_upside', 'DDM upside vs price', ddm.perShare / i.price - 1, 'pct');
  add('reg_upside', 'Regression upside vs price', reg.impliedPrice / i.price - 1, 'pct');
  add('shock_bps', 'Rate shock (bps)', a.rateShockBps, 'num');
  add('stress_outflow', 'Stressed deposit outflow', stress.outflow, 'usd');
  add('stress_shortfall', 'Liquidity shortfall', stress.shortfall, 'usd');
  add('stress_cet1_after', 'CET1 ratio after stress', stress.cet1RatioAfter, 'pct');
  add('htm_unrealized', 'HTM unrealized loss today', i.htmUnrealized, 'usd');
  return f;
}
