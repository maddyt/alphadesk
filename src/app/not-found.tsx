import Link from 'next/link';
import { Nav } from '@/components/Nav';

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-xl px-6 pt-32 text-center">
        <div className="num text-6xl font-semibold text-line">404</div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">Ticker not found in SEC EDGAR</h1>
        <p className="mt-3 text-sm text-sub">Check the symbol, or try one of the demo tickers.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['AAPL', 'NVDA', 'DIS', 'MSFT', 'COST', 'KO'].map((t) => (
            <Link key={t} href={`/t/${t}`} className="num rounded-xl border border-line bg-panel px-3 py-1.5 text-sm text-ink hover:border-brand/50">
              {t}
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
