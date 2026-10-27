import { z } from 'zod';
import { METHODOLOGIES } from './engine/valuation.ts';

// PRD 4.2: the contract every valuation response is validated against before it
// leaves the server. EV figures are in USD.
export const ValuationOutputSchema = z.object({
  ticker: z.string().max(5),
  currentSharePrice: z.number().positive(),
  enterpriseValue: z.number(),
  valuationRanges: z.array(
    z.object({
      methodology: z.enum(METHODOLOGIES),
      minEV: z.number().describe('Minimum Enterprise Value ($)'),
      twentyFifthEV: z.number().describe('25th Percentile Enterprise Value ($)'),
      medianEV: z.number().describe('Median Enterprise Value ($)'),
      seventyFifthEV: z.number().describe('75th Percentile Enterprise Value ($)'),
      maxEV: z.number().describe('Maximum Enterprise Value ($)'),
    }),
  ),
});

export type ValuationOutput = z.infer<typeof ValuationOutputSchema>;

// PRD v2 section 4: parsed balance sheets are validated for equilibrium before use.
// Assets must equal Liabilities + Equity (both as the total-L&E tag and, when the
// company tags them separately, as liabilities plus equity incl. minority interest).
const tie = (a: number, b: number) => Math.abs(a - b) <= Math.abs(a) * 0.01;

export const BalanceSheetSchema = z
  .object({
    assets: z.number().positive(),
    liabilitiesAndEquity: z.number().positive().optional(),
    liabilities: z.number().optional(),
    equity: z.number().optional(),
  })
  .refine((b) => b.liabilitiesAndEquity === undefined || tie(b.assets, b.liabilitiesAndEquity), { message: 'Assets do not equal total liabilities & equity' });

export interface BalanceCheck {
  checked: boolean;
  ties: boolean;
  assets?: number;
  liabilitiesAndEquity?: number;
  message: string;
}

export function checkBalance(items: Partial<Record<'assets' | 'liabilitiesAndEquity' | 'liabilities' | 'equity', { value: number } | undefined>>): BalanceCheck {
  const input = {
    assets: items.assets?.value,
    liabilitiesAndEquity: items.liabilitiesAndEquity?.value,
    liabilities: items.liabilities?.value,
    equity: items.equity?.value,
  };
  if (input.assets === undefined) return { checked: false, ties: false, message: 'Total assets not tagged' };
  const r = BalanceSheetSchema.safeParse(input);
  const le = input.liabilitiesAndEquity ?? (input.liabilities !== undefined && input.equity !== undefined ? input.liabilities + input.equity : undefined);
  if (le === undefined) return { checked: false, ties: false, assets: input.assets, message: 'Liabilities & equity not tagged' };
  const ok = r.success && tie(input.assets, le);
  return { checked: true, ties: ok, assets: input.assets, liabilitiesAndEquity: le, message: ok ? 'Assets = Liabilities + Equity' : r.success ? 'Assets differ from liabilities + equity by more than 1%' : r.error.issues[0].message };
}
