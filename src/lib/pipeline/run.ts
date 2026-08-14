/** Orchestrates a full ingestion run. Shared by the CLI script and the cron route. */
import { createServiceClient } from '../supabase/server.ts';
import { collect, valueAll, valuationFlagsToFindings, type IngestSummary } from './ingest.ts';
import { finishRun, replaceFlags, startRun, upsertCompany, upsertStatements, writeValuation } from './persist.ts';
import { computeSectorMedians } from '../engine/analytics.ts';

export async function runIngestion(universe = process.env.INGEST_UNIVERSE ?? 'AAPL', years = Number(process.env.INGEST_YEARS ?? 10)): Promise<IngestSummary> {
  const sb = createServiceClient();
  const { provider, companies, failed } = await collect({ universe, years });
  const runId = await startRun(sb, provider.name, companies.map((c) => c.ticker));
  let flagCount = 0;
  try {
    // Sector medians come from the whole batch, so a company's mean-reversion target reflects
    // its peers in this run rather than whatever happened to be stored previously.
    const medians = computeSectorMedians(companies.map((c) => c.data));
    const valued = valueAll(companies.map((c) => ({ ticker: c.ticker, data: c.data })), medians);

    for (const c of companies) {
      const companyId = await upsertCompany(sb, c.data.meta);
      await upsertStatements(sb, companyId, provider.name, c.data, c.provider.raw);
      const v = valued.find((x) => x.ticker === c.ticker);
      const findings = [...c.findings];
      if (v?.result) {
        await writeValuation(sb, companyId, v.assumptions, v.result);
        findings.push(...valuationFlagsToFindings(v.result.flags));
      } else if (v?.error) {
        findings.push({ code: 'VALUATION_FAILED', severity: 'warn', message: v.error });
      }
      await replaceFlags(sb, companyId, findings);
      flagCount += findings.length;
    }
    await finishRun(sb, runId, { status: 'succeeded', tickers_ok: companies.length, tickers_failed: failed.length, flags_raised: flagCount });
  } catch (e) {
    await finishRun(sb, runId, { status: 'failed', tickers_ok: 0, tickers_failed: failed.length, flags_raised: flagCount, error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  return { provider: provider.name, ok: companies.map((c) => c.ticker), failed, flags: flagCount };
}
