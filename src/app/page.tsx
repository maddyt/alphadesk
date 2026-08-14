import Link from 'next/link';
import { listCompanies, loadLatestValuations, loadOpenFlags } from '@/lib/supabase/queries';
import { pct, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function CoveragePage() {
  let companies: Awaited<ReturnType<typeof listCompanies>> = [];
  let valuations: Awaited<ReturnType<typeof loadLatestValuations>> = [];
  let flags: Awaited<ReturnType<typeof loadOpenFlags>> = [];
  let error: string | null = null;
  try {
    [companies, valuations, flags] = await Promise.all([listCompanies(), loadLatestValuations(), loadOpenFlags()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="card">
        <h1 className="font-serif text-2xl mb-2">Not connected yet</h1>
        <p className="text-[13px] text-muted mb-3">
          Supabase could not be reached: <code className="text-neg">{error}</code>
        </p>
        <p className="text-[13px]">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, run{' '}
          <code>supabase db push</code>, then <code>npm run ingest</code>.
        </p>
      </div>
    );
  }

  const byTicker = new Map(valuations.map((v) => [(v as { ticker: string }).ticker, v]));
  const flagCounts = new Map<string, number>();
  for (const f of flags as { companies?: { ticker?: string } }[]) {
    const t = f.companies?.ticker;
    if (t) flagCounts.set(t, (flagCounts.get(t) ?? 0) + 1);
  }
  const warnTotal = (flags as { severity: string }[]).filter((f) => f.severity === 'warn').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl text-navy">Coverage</h1>
        <p className="text-[13px] text-muted max-w-3xl">
          {companies.length} companies · {valuations.length} valued · {warnTotal} open warnings.
          Each name is valued three independent ways; where they disagree the portal says so rather than
          picking the flattering number.
        </p>
      </div>

      {!companies.length && (
        <div className="card text-[13px]">
          No companies stored yet. Run <code>npm run ingest</code> with a provider key set.
        </div>
      )}

      <div className="scroller">
        <table className="tbl">
          <thead>
            <tr>
              <th className="li">Company</th>
              <th>Sector</th><th>Price</th><th>FCFE</th><th>FCFF</th><th>Residual income</th>
              <th>Spread</th><th>Upside</th><th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const v = byTicker.get(c.ticker) as Record<string, number | null> | undefined;
              const spread = v?.method_spread ?? null;
              const mos = v?.margin_of_safety ?? null;
              return (
                <tr key={c.ticker} className="hover:bg-canvas">
                  <td className="li">
                    <Link href={`/ticker/${c.ticker}`} className="text-accent font-semibold">{c.ticker}</Link>
                    <span className="text-muted ml-2 text-[11.5px]">{c.company_name}</span>
                  </td>
                  <td className="num text-muted">{c.sector ?? '—'}</td>
                  <td className="num">{usd(c.current_price)}</td>
                  <td className="num">{usd(v?.fcfe_per_share ?? null)}</td>
                  <td className="num">{usd(v?.fcff_per_share ?? null)}</td>
                  <td className="num">{usd(v?.residual_income_per_share ?? null)}</td>
                  <td className={`num ${spread !== null && spread > 0.35 ? 'text-neg font-semibold' : ''}`}>
                    {spread === null ? '—' : pct(spread, 0)}
                  </td>
                  <td className={`num ${mos !== null && mos > 0 ? 'text-pos' : 'text-neg'}`}>
                    {mos === null ? '—' : `${mos.toFixed(0)}%`}
                  </td>
                  <td className="num">{flagCounts.get(c.ticker) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
