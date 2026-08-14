import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadCompany, loadSectorMedians } from '@/lib/supabase/queries';
import { defaultAssumptions } from '@/lib/engine/assumptions';
import { runScenario } from '@/lib/engine/valuation';
import { backtest } from '@/lib/engine/analytics';
import { Statements } from '@/components/Statements';
import { ScenarioBuilder } from '@/components/ScenarioBuilder';
import { money, pct, shares, usd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TickerPage({ params }: { params: { symbol: string } }) {
  const symbol = params.symbol.toUpperCase();
  const [data, medians] = await Promise.all([loadCompany(symbol), loadSectorMedians()]);
  if (!data) notFound();

  const sectorMedian = medians[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null };
  const a = defaultAssumptions(data.meta);
  const base = runScenario(data, a, sectorMedian);
  const bt = backtest(data, a);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-4 flex-wrap border-b border-rule pb-3">
        <h1 className="font-serif text-2xl text-navy">{data.meta.company_name}</h1>
        <span className="font-mono text-lg">{symbol}</span>
        <span className="text-muted text-[13px]">{data.meta.sector}</span>
        <span className="ml-auto flex gap-4 text-[13px]">
          <span><span className="stat-k">Price </span><b className="font-mono">{usd(data.meta.current_price)}</b></span>
          <span><span className="stat-k">Shares </span><b className="font-mono">{shares(data.meta.shares_outstanding)}mm</b></span>
          <span><span className="stat-k">Beta </span><b className="font-mono">{data.meta.beta?.toFixed(2) ?? '—'}</b></span>
        </span>
      </div>

      <div className="flex gap-3 text-[13px]">
        <a href={`/api/deliverables/${symbol}?type=dcf`} className="border border-rule rounded px-3 py-1.5 hover:border-accent hover:text-accent">DCF report</a>
        <a href={`/api/deliverables/${symbol}?type=tearsheet`} className="border border-rule rounded px-3 py-1.5 hover:border-accent hover:text-accent">Tearsheet</a>
        <a href={`/api/deliverables/${symbol}?type=model`} className="border border-rule rounded px-3 py-1.5 hover:border-accent hover:text-accent">Excel model</a>
        <Link href="/audit" className="ml-auto text-muted hover:text-accent">Data-quality dashboard →</Link>
      </div>

      <ScenarioBuilder data={data} sectorMedian={sectorMedian} />

      <Statements data={data} projIS={base.projIS} projCF={base.projCF} projBS={base.projBS} />

      {bt && (
        <section className="space-y-1">
          <h3 className="font-serif text-lg text-navy">Backtest — does this engine actually predict?</h3>
          <p className="text-[12.5px] text-muted">
            Re-run using only data through FY{bt.cutoffYear}, then compared with what happened. Mean absolute error:{' '}
            <b>{pct(bt.revenueMape)}</b> on revenue, <b>{pct(bt.operatingIncomeMape)}</b> on operating income.
          </p>
          <div className="scroller">
            <table className="tbl">
              <thead>
                <tr><th className="li">Held-out year</th><th>Predicted revenue</th><th>Actual revenue</th><th>Error</th><th>Predicted op. income</th><th>Actual op. income</th><th>Error</th></tr>
              </thead>
              <tbody>
                {bt.rows.map((r) => (
                  <tr key={r.fiscalYear}>
                    <td className="li">FY{r.fiscalYear}</td>
                    <td className="num">{money(r.predictedRevenue)}</td>
                    <td className="num">{money(r.actualRevenue)}</td>
                    <td className="num">{pct(r.revenueError)}</td>
                    <td className="num">{money(r.predictedOperatingIncome)}</td>
                    <td className="num">{money(r.actualOperatingIncome)}</td>
                    <td className="num">{pct(r.operatingIncomeError)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card text-[12.5px] text-muted space-y-1">
        <div className="font-semibold text-ink">Method &amp; lineage</div>
        <p>
          Historical figures are stored exactly as the provider returned them, alongside a corrected copy in which
          every &ldquo;other&rdquo; bucket is rebuilt as a residual so each subtotal ties. Projections are computed by the
          engine in <code>src/lib/engine</code> — the same module that runs in your browser on this page, so the numbers
          here and the numbers stored by the ingestion job cannot drift apart.
        </p>
        <p>
          Margins use a {pct(a.margin.sectorBlend, 0)} blend toward the sector median; stock-based compensation is treated as a
          real cost; the diluted share count moves with buybacks; discounting is mid-year. Every one of those is a
          choice you can reverse in the panel above.
        </p>
      </section>
    </div>
  );
}
