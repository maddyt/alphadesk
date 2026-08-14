/**
 * CLI ingestion. Run with:  npm run ingest
 * Requires SUPABASE_SERVICE_ROLE_KEY and a provider key in .env.local.
 */
import { runIngestion } from '../src/lib/pipeline/run.ts';

const universe = process.argv[2] ?? process.env.INGEST_UNIVERSE ?? 'AAPL';
const years = Number(process.argv[3] ?? process.env.INGEST_YEARS ?? 10);

console.log(`[ingest] provider=${process.env.DATA_PROVIDER ?? 'fmp'} universe=${universe} years=${years}`);
runIngestion(universe, years)
  .then((s) => {
    console.log(`[ingest] ok=${s.ok.length} failed=${s.failed.length} flags=${s.flags}`);
    if (s.failed.length) for (const f of s.failed) console.error(`  ! ${f.ticker}: ${f.error}`);
    process.exit(0);
  })
  .catch((e) => { console.error('[ingest] failed:', e instanceof Error ? e.message : e); process.exit(1); });
