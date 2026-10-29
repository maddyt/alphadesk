import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { BankWorkbench } from '@/components/banks/BankWorkbench';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { bankRun, NotABankError } from '@/lib/banks/data';
import { readBankOverrides } from '@/lib/banks/params';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { ticker: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `${decodeURIComponent(params.ticker).toUpperCase()} bank valuation | BankVal AI` };
}

export default async function BankPage({ params, searchParams }: Props) {
  let d;
  try {
    d = await bankRun(params.ticker, readBankOverrides(searchParams));
  } catch (e) {
    if (e instanceof TickerNotFoundError) notFound();
    if (e instanceof NotABankError) return <NotABank ticker={decodeURIComponent(params.ticker).toUpperCase()} message={e.message} />;
    throw e;
  }
  return (
    <>
      <Nav />
      <main>
        <BankWorkbench
          fin={d.bank.fin}
          market={d.bank.market}
          i={d.run.i}
          peers={d.peers}
          basis={d.basis}
          defaults={d.defaults}
          initial={d.a}
          warnings={d.warnings}
          rf={d.macro.tenYear}
          rfSource={d.macro.source}
        />
      </main>
    </>
  );
}

function NotABank({ ticker, message }: { ticker: string; message: string }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 pt-28 text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber">Not a bank</div>
        <h1 className="mt-3 text-2xl font-semibold text-ink">{ticker} isn&rsquo;t a deposit-taking bank</h1>
        <p className="mt-3 text-sm leading-relaxed text-sub">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href={`/t/${ticker}`} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
            Value {ticker} with DCF &amp; comps
          </Link>
          <Link href="/banks" className="rounded-xl border border-line px-4 py-2 text-sm text-sub hover:text-ink">
            Pick a bank
          </Link>
        </div>
      </main>
    </>
  );
}
