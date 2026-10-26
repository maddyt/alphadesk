import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { Workbench } from '@/components/workbench/Workbench';
import { TickerNotFoundError, getDataset, logRun } from '@/lib/data/dataset';
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
    throw e;
  }
  const b = buildBaseInputs(ds);
  const run = runValuation(b, defaultAssumptions(b));
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
