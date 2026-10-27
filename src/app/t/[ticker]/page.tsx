import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { Workbench } from '@/components/workbench/Workbench';
import Link from 'next/link';
import { ForeignFilerError, TickerNotFoundError, getDataset, logRun } from '@/lib/data/dataset';
import { readOverrides } from '@/lib/engine/params';
import { buildBaseInputs, defaultAssumptions } from '@/lib/engine/model';
import { runValuation } from '@/lib/engine/valuation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { ticker: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  const t = decodeURIComponent(params.ticker).toUpperCase();
  return { title: `${t} valuation | ValuationEngine AI` };
}

export default async function TickerPage({ params, searchParams }: Props) {
  let ds;
  try {
    ds = await getDataset(params.ticker);
  } catch (e) {
    if (e instanceof TickerNotFoundError) notFound();
    if (e instanceof ForeignFilerError) return <ForeignNotice ticker={decodeURIComponent(params.ticker).toUpperCase()} message={e.message} />;
    throw e;
  }
  const b = buildBaseInputs(ds);
  const run = runValuation(b, defaultAssumptions(b, ds.macro?.tenYear));
  void logRun({ ticker: b.ticker, name: b.name, price: b.price, current_ev: b.currentEV, composite_price: run.compositePrice, source: ds.source });
  return (
    <>
      <Nav />
      <main>
        <Workbench ds={ds} overrides={readOverrides(searchParams)} />
      </main>
    </>
  );
}

/** Foreign 20-F filers are out of scope here (US GAAP / USD only) but supported in DealPulse. */
function ForeignNotice({ ticker, message }: { ticker: string; message: string }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 pt-28 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#C4B5FD]">🌐 Foreign filer</div>
        <h1 className="mt-3 text-2xl font-semibold text-ink">{ticker} reports under non-US rules</h1>
        <p className="mt-3 text-sm leading-relaxed text-sub">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/deals/NVDA/${ticker}`} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
            Use {ticker} in an M&amp;A teardown →
          </Link>
          <Link href="/" className="rounded-xl border border-line px-4 py-2 text-sm text-sub hover:text-ink">
            Value a US company
          </Link>
        </div>
      </main>
    </>
  );
}
