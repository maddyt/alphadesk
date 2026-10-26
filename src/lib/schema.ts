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
