import type { DealCompany, DealResult } from '@/lib/deals/engine';
import type { WaterStep } from './DealCharts';

/** PRD 5.3 bridge: standalone acquirer NI -> pro-forma NI. */
export function waterSteps(A: DealCompany, T: DealCompany, r: DealResult): WaterStep[] {
  const steps: WaterStep[] = [
    { label: `${A.ticker} net income`, sub: `standalone, ${A.ltmLabel.replace(' (LTM)', '')}`, value: A.netIncome, kind: 'total' },
    { label: `+ ${T.ticker} net income`, sub: 'what the target earns', value: T.netIncome, kind: T.netIncome >= 0 ? 'add' : 'sub' },
    { label: '+ Synergies', sub: 'after tax', value: r.afterTaxSynergies, kind: 'add' },
    { label: '− Interest on new debt', sub: 'after tax', value: r.afterTaxInterest, kind: 'sub' },
    { label: '− Lost interest on cash', sub: 'after tax', value: r.foregoneInterest, kind: 'sub' },
    { label: 'Pro-forma net income', sub: 'combined company', value: r.proFormaNetIncome, kind: 'total' },
  ];
  // Negative target NI enters as a subtraction of its absolute value.
  steps[1].value = Math.abs(steps[1].value);
  return steps;
}
