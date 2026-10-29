'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function BankPicker() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const go = (t: string) => {
    const ticker = t.trim().toUpperCase();
    if (ticker) router.push(`/banks/${encodeURIComponent(ticker)}`);
  };
  return (
    <form
      className="mx-auto flex max-w-xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        go(q);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Bank ticker, e.g. JPM, PNC, ZION"
        aria-label="Bank ticker"
        className="num min-w-0 flex-1 rounded-2xl border border-line bg-panel/90 px-5 py-3.5 text-[15px] text-ink outline-none transition placeholder:font-sans placeholder:text-mute focus:border-brand/70 focus:ring-4 focus:ring-brand/15"
      />
      <button type="submit" className="shrink-0 rounded-2xl bg-brand px-6 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition hover:bg-[#3B82F6]">
        Value it
      </button>
    </form>
  );
}
