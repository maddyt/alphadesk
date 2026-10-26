'use client';

import Link from 'next/link';

export default function TickerError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-6 pt-32 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-down">Data pipeline error</div>
      <h1 className="mt-3 text-2xl font-semibold text-ink">We couldn&apos;t value this company</h1>
      <p className="mt-3 text-sm leading-relaxed text-sub">{error.message || 'SEC EDGAR or the market-data source did not respond.'}</p>
      <p className="mt-2 text-xs text-mute">Companies that file 20-F (foreign private issuers) or lack US-GAAP revenue tags are not supported.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
          Retry
        </button>
        <Link href="/" className="rounded-xl border border-line px-4 py-2 text-sm text-sub hover:text-ink">
          Try another ticker
        </Link>
      </div>
    </main>
  );
}
