import { z } from 'zod';

// Contract for /api/deals responses, validated before anything leaves the server.
export const DealOutputSchema = z.object({
  acquirer: z.string().max(6),
  target: z.string().max(6),
  assumptions: z.object({
    offerPremium: z.number().min(0).max(1),
    cashMix: z.number().min(0).max(1),
    stockMix: z.number().min(0).max(1),
    debtMix: z.number().min(0).max(1),
    preTaxSynergies: z.number().min(0),
    debtRate: z.number(),
    cashRate: z.number(),
    taxRate: z.number(),
  }),
  equityPurchasePrice: z.number().positive(),
  offerPricePerShare: z.number().positive(),
  standaloneEps: z.number(),
  proFormaEps: z.number(),
  accretionDilutionPct: z.number(),
  proFormaNetIncome: z.number(),
  proFormaShares: z.number().positive(),
  breakevenSynergies: z.number().min(0),
  proFormaDebtToEbitda: z.number().nullable(),
  risk: z.array(z.object({ id: z.string(), rating: z.enum(['green', 'amber', 'red']), headline: z.string() })),
});

export type DealOutput = z.infer<typeof DealOutputSchema>;
