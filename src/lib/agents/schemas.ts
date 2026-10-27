import { z } from 'zod';

// Structured outputs for the three Deal Room agents. No numeric min/max here
// (structured outputs ignore most constraints); values are clamped server-side.

export const DocId = z.enum(['acquirer_annual', 'target_annual', 'target_proxy', 'tool']);
export type DocId = z.infer<typeof DocId>;

export const Cite = z.object({
  doc: DocId.describe('Which filing the quote comes from'),
  quote: z.string().describe('A short passage copied VERBATIM from that filing (15-40 words). Never paraphrase.'),
});

export const AuditSchema = z.object({
  verdict: z.enum(['clean', 'minor_issues', 'material_issues']),
  summary: z.string().describe('2-3 sentences on whether the model inputs are trustworthy'),
  findings: z.array(
    z.object({
      severity: z.enum(['info', 'warning', 'critical']),
      title: z.string(),
      detail: z.string().describe('What looks wrong or noteworthy and why it matters for EPS accretion'),
      factIds: z.array(z.string()).describe('Fact-sheet ids this finding is about'),
    }),
  ),
});

const Phase = z.object({ year1: z.number(), year2: z.number(), year3: z.number() }).describe('Share of the run-rate realised in each year, 0-1');

export const SynergySchema = z.object({
  overlapSummary: z.string().describe('How the two businesses overlap: products, customers, geographies'),
  costSynergies: z.array(
    z.object({
      area: z.string().describe('e.g. Corporate overhead, Procurement, R&D, Distribution, Facilities'),
      rationale: z.string(),
      runRateUsd: z.number().describe('Estimated annual run-rate pre-tax savings in USD'),
      phaseIn: Phase,
      cite: Cite,
    }),
  ),
  revenueSynergies: z.array(z.object({ area: z.string(), rationale: z.string(), runRateUsd: z.number(), cite: Cite })),
  regionalOverlap: z.array(z.object({ region: z.string(), acquirerPresence: z.enum(['none', 'low', 'medium', 'high']), targetPresence: z.enum(['none', 'low', 'medium', 'high']) })),
  hsrRisk: z.object({ score: z.number().describe('1 = no overlap concern, 5 = likely second request / remedies'), rationale: z.string() }),
  confidence: z.number().describe('0-100 confidence in the synergy estimate'),
  methodology: z.string().describe('How the run-rate was sized, referencing cost bases in the filings'),
});

export const RiskSchema = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      title: z.string(),
      category: z.enum(['regulatory', 'integration', 'financial', 'legal', 'governance', 'market', 'people']),
      likelihood: z.number().describe('1 (remote) to 5 (almost certain)'),
      impact: z.number().describe('1 (minor) to 5 (deal-breaking)'),
      detail: z.string(),
      cite: Cite,
    }),
  ),
  governance: z.array(z.object({ item: z.string(), assessment: z.string(), rag: z.enum(['green', 'amber', 'red']) })),
  insiderSentiment: z.enum(['buying', 'neutral', 'selling', 'unknown']),
  antitrustNotes: z.string(),
});

export type AuditOut = z.infer<typeof AuditSchema>;
export type SynergyOut = z.infer<typeof SynergySchema>;
export type RiskOut = z.infer<typeof RiskSchema>;
