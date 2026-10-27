import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { DealWorkbench } from '@/components/deals/DealWorkbench';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { readDealOverrides } from '@/lib/deals/params';
import { dealRun } from '@/lib/deals/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { acquirer: string; target: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `${decodeURIComponent(params.acquirer).toUpperCase()} + ${decodeURIComponent(params.target).toUpperCase()} | DealPulse` };
}

export default async function DealPage({ params, searchParams }: Props) {
  let d;
  try {
    d = await dealRun(params.acquirer, params.target, readDealOverrides(searchParams));
  } catch (e) {
    if (e instanceof TickerNotFoundError) notFound();
    throw e;
  }
  return (
    <>
      <Nav />
      <main>
        <DealWorkbench A={d.A} T={d.T} defaults={d.defaults} initial={d.a} warnings={d.warnings} />
      </main>
    </>
  );
}
