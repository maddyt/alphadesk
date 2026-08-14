/**
 * Runs the engine over the committed fixtures and prints the triangulated valuation for each.
 * No database, no network, no API keys — a fast way to confirm the maths still behaves after a
 * change, and a readable demo of what the portal computes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepare } from '../src/lib/engine/corrections.ts';
import { defaultAssumptions } from '../src/lib/engine/assumptions.ts';
import { runScenario } from '../src/lib/engine/valuation.ts';
import { backtest, reverseDcf } from '../src/lib/engine/analytics.ts';
import { auditCompany } from '../src/lib/pipeline/ingest.ts';
import type { CompanyData, SectorMedians } from '../src/lib/engine/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, '../tests/fixtures/raw.json'), 'utf8')) as Record<string, CompanyData>;
const medians = JSON.parse(readFileSync(join(here, '../tests/fixtures/sector-medians.json'), 'utf8')) as SectorMedians;

const usd = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '     —' : `$${v.toFixed(2)}`.padStart(9));
const pct = (v: number | null | undefined) => (v == null ? '  —' : `${(v * 100).toFixed(1)}%`.padStart(7));

console.log('ticker  sector                price       FCFE      FCFF        RI   spread  mode     flags');
console.log('─'.repeat(100));
for (const t of Object.keys(raw)) {
  const data = prepare(raw[t]);
  const a = defaultAssumptions(data.meta);
  const med = medians[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null };
  const r = runScenario(data, a, med);
  console.log(
    `${t.padEnd(7)} ${(data.meta.sector ?? '—').slice(0, 20).padEnd(20)} ${usd(r.price)} ${usd(r.fcfe.perShare)} ${usd(r.fcff?.perShare)} ${usd(r.residualIncome?.perShare)} ${pct(r.diagnostics.spread)}  ${r.diagnostics.marginMode.padEnd(8)} ${r.flags.map((f) => f.code).join(',') || 'none'}`,
  );
}
console.log();
const aapl = prepare(raw.AAPL);
const a = defaultAssumptions(aapl.meta);
const bt = backtest(aapl, a);
const rev = reverseDcf(aapl, a, medians[aapl.meta.sector ?? 'Other']);
console.log(`AAPL backtest (trained through FY${bt?.cutoffYear}): revenue error ${pct(bt?.revenueMape)}, operating income ${pct(bt?.operatingIncomeMape)}`);
if (rev?.status === 'ok') console.log(`AAPL reverse DCF: market implies ${pct(rev.impliedAvgGrowth)} growth vs the model's ${pct(rev.modelAvgGrowth)}`);
console.log(`AAPL data-quality findings: ${auditCompany(aapl).map((f) => f.code).join(', ') || 'none'}`);
