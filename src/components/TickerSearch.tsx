'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const SUGGEST: [string, string][] = [
  ['AAPL', 'Apple'], ['NVDA', 'NVIDIA'], ['DIS', 'Walt Disney'], ['MSFT', 'Microsoft'], ['COST', 'Costco'], ['KO', 'Coca-Cola'],
  ['GOOGL', 'Alphabet'], ['META', 'Meta Platforms'], ['AMZN', 'Amazon'], ['AMD', 'Advanced Micro Devices'], ['AVGO', 'Broadcom'],
  ['ORCL', 'Oracle'], ['CRM', 'Salesforce'], ['ADBE', 'Adobe'], ['NFLX', 'Netflix'], ['CMCSA', 'Comcast'], ['PEP', 'PepsiCo'],
  ['WMT', 'Walmart'], ['TGT', 'Target'], ['HD', 'Home Depot'], ['LOW', "Lowe's"], ['NKE', 'Nike'], ['LULU', 'Lululemon'],
  ['TSLA', 'Tesla'], ['GM', 'General Motors'], ['F', 'Ford'], ['PFE', 'Pfizer'], ['MRK', 'Merck'], ['LLY', 'Eli Lilly'],
  ['ABBV', 'AbbVie'], ['XOM', 'ExxonMobil'], ['CVX', 'Chevron'], ['BA', 'Boeing'], ['LMT', 'Lockheed Martin'], ['RTX', 'RTX'],
  ['V', 'Visa'], ['MA', 'Mastercard'], ['MCD', "McDonald's"], ['SBUX', 'Starbucks'], ['CMG', 'Chipotle'], ['UBER', 'Uber'],
  ['ABNB', 'Airbnb'], ['BKNG', 'Booking Holdings'],
];

export function TickerSearch({ size = 'lg', autoFocus = false }: { size?: 'lg' | 'sm'; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const query = q.trim().toUpperCase();
  const matches = query
    ? SUGGEST.filter(([t, n]) => t.startsWith(query) || n.toUpperCase().includes(query)).slice(0, 6)
    : SUGGEST.slice(0, 6);

  function go(t: string) {
    const ticker = t.trim().toUpperCase();
    if (!ticker) return;
    setOpen(false);
    router.push(`/t/${encodeURIComponent(ticker)}`);
  }

  const lg = size === 'lg';
  return (
    <form
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        go(open && matches[active] && !SUGGEST.some(([t]) => t === query) ? matches[active][0] : query);
      }}
    >
      <div className={`flex items-center gap-3 rounded-2xl border border-line bg-panel/90 transition focus-within:border-brand/70 focus-within:ring-4 focus-within:ring-brand/15 ${lg ? 'px-5 py-4' : 'px-3 py-2'}`}>
        <svg width={lg ? 20 : 15} height={lg ? 20 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-mute" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((i) => Math.min(matches.length - 1, i + 1));
            if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1));
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={lg ? 'Any US ticker, e.g. NVDA' : 'Ticker…'}
          aria-label="Ticker"
          className={`num w-full min-w-0 bg-transparent uppercase text-ink placeholder:font-sans placeholder:normal-case placeholder:text-mute focus:outline-none ${lg ? 'text-lg' : 'text-sm'}`}
        />
        {lg && (
          <button type="submit" className="shrink-0 whitespace-nowrap rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-[#3B82F6]">
            Value it
          </button>
        )}
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-line bg-raised shadow-2xl">
          {matches.map(([t, n], i) => (
            <li key={t}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(t)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${i === active ? 'bg-brand/15' : ''}`}
              >
                <span className="num font-semibold text-ink">{t}</span>
                <span className="text-mute">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
