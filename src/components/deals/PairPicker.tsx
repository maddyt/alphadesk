'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN', 'NVDA', 'AMD', 'AVGO', 'QCOM', 'INTC', 'ORCL', 'CRM', 'ADBE', 'DIS', 'EA', 'TTWO', 'NFLX', 'CMCSA', 'WBD', 'KO', 'PEP', 'MDLZ', 'KHC', 'COST', 'WMT', 'TGT', 'HD', 'LOW', 'NKE', 'LULU', 'PFE', 'MRK', 'LLY', 'ABBV', 'XOM', 'CVX', 'COP', 'BA', 'LMT', 'RTX', 'MCD', 'SBUX', 'CMG'];

export function PairPicker({ initial = ['DIS', 'EA'] }: { initial?: [string, string] }) {
  const router = useRouter();
  const [acq, setAcq] = useState(initial[0]);
  const [tgt, setTgt] = useState(initial[1]);
  const [busy, setBusy] = useState(false);
  const a = acq.trim().toUpperCase();
  const t = tgt.trim().toUpperCase();
  const valid = /^[A-Z][A-Z0-9.\-]{0,5}$/.test(a) && /^[A-Z][A-Z0-9.\-]{0,5}$/.test(t) && a !== t;

  const input = 'num w-full min-w-0 bg-transparent text-lg uppercase text-ink placeholder:font-sans placeholder:normal-case placeholder:text-mute focus:outline-none';
  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        router.push(`/deals/${encodeURIComponent(a)}/${encodeURIComponent(t)}`);
      }}
    >
      <datalist id="deal-tickers">
        {TICKERS.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-panel/90 p-2 sm:flex-row sm:items-stretch">
        <label className="flex flex-1 flex-col rounded-xl bg-bg/50 px-4 py-2 focus-within:ring-2 focus-within:ring-brand/40">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">Buyer (acquirer)</span>
          <input list="deal-tickers" value={acq} onChange={(e) => setAcq(e.target.value)} placeholder="e.g. DIS" aria-label="Acquirer ticker" className={input} />
        </label>
        <button
          type="button"
          onClick={() => {
            setAcq(tgt);
            setTgt(acq);
          }}
          className="self-center rounded-full border border-line px-3 py-1.5 text-sm text-sub transition hover:border-brand/50 hover:text-ink"
          aria-label="Swap buyer and target"
          title="Swap"
        >
          ⇄
        </button>
        <label className="flex flex-1 flex-col rounded-xl bg-bg/50 px-4 py-2 focus-within:ring-2 focus-within:ring-brand/40">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mute">Company being bought (target)</span>
          <input list="deal-tickers" value={tgt} onChange={(e) => setTgt(e.target.value)} placeholder="e.g. EA" aria-label="Target ticker" className={input} />
        </label>
        <button
          type="submit"
          disabled={!valid || busy}
          className="whitespace-nowrap rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/30 transition hover:bg-[#3B82F6] disabled:opacity-50"
        >
          {busy ? 'Fetching SEC filings…' : 'Auto-fetch SEC filings →'}
        </button>
      </div>
      {a && t && a === t && <p className="mt-2 text-xs text-amber">Pick two different companies.</p>}
    </form>
  );
}
