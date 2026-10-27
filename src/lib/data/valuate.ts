import 'server-only';
import { buildBaseInputs, defaultAssumptions, sliderRanges, waccBuild, type Assumptions } from '../engine/model.ts';
import { resolveAssumptions } from '../engine/params.ts';
import { runValuation } from '../engine/valuation.ts';
import { ValuationOutputSchema, type ValuationOutput } from '../schema.ts';
import { getDataset } from './dataset.ts';

/** Server-side valuation: the same engine the browser runs, from cached SEC data. */
export async function valuate(ticker: string, overrides: Partial<Assumptions> = {}) {
  const ds = await getDataset(ticker);
  const b = buildBaseInputs(ds);
  const defaults = defaultAssumptions(b, ds.macro?.tenYear);
  const a = resolveAssumptions(defaults, sliderRanges(defaults), overrides);
  const run = runValuation(b, a);
  const wacc = waccBuild(b, a.riskFree, a.erp, a.taxRate);
  return { ds, b, defaults, a, run, wacc };
}

/** PRD 4.2 contract, validated with Zod before it leaves the server. */
export function toValuationOutput(r: Awaited<ReturnType<typeof valuate>>): ValuationOutput {
  return ValuationOutputSchema.parse({
    ticker: r.b.ticker,
    currentSharePrice: r.b.price,
    enterpriseValue: r.run.currentEV,
    valuationRanges: r.run.ranges.map((x) => ({
      methodology: x.methodology,
      minEV: x.min,
      twentyFifthEV: x.p25,
      medianEV: x.median,
      seventyFifthEV: x.p75,
      maxEV: x.max,
    })),
  });
}
