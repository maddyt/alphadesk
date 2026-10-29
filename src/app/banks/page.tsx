import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { BankPicker } from '@/components/banks/BankPicker';
import { supabase } from '@/lib/supabase';
import { price } from '@/lib/format';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'BankVal AI | Bank valuation: P/TBV vs. ROATCE and dividend discount model',
  description: 'Value a commercial bank the way FIG bankers do: tangible book, returns on tangible equity, CET1-constrained dividends and deposit-run stress tests, straight from SEC filings.',
};

const BANKS: [string, string][] = [
  ['JPM', 'JPMorgan Chase'],
  ['BAC', 'Bank of America'],
  ['WFC', 'Wells Fargo'],
  ['C', 'Citigroup'],
  ['USB', 'U.S. Bancorp'],
  ['PNC', 'PNC Financial'],
  ['TFC', 'Truist'],
  ['MTB', 'M&T Bank'],
  ['FITB', 'Fifth Third'],
  ['HBAN', 'Huntington'],
  ['CFG', 'Citizens'],
  ['ZION', 'Zions'],
];

const IDEAS = [
  ['Why not EV/EBITDA?', 'For a bank, deposits and borrowings are raw material, not financing. Interest is its cost of goods, so “enterprise value” and EBITDA lose their meaning. Bankers value the equity directly.'],
  ['Tangible book & ROATCE', 'Tangible common equity strips out goodwill, intangibles and preferred stock. ROATCE is profit to common shareholders divided by it: the return the bank really earns on its own money.'],
  ['P/TBV vs. ROATCE', 'Across banks, a higher return on tangible equity earns a higher price-to-tangible-book multiple. Fit a line through the peers and see who trades above (rich) or below (cheap) it.'],
  ['Capital caps the dividend', 'Regulators require CET1 capital of at least 7% of risk-weighted assets. A bank can only pay out what is left after funding its growth at the target ratio: that is the dividend discount model.'],
];

async function savedModels(): Promise<{ id: string; ticker: string; name: string; query: string; price: number; regression_price: number | null; ddm_price: number | null }[]> {
  const db = supabase();
  if (!db) return [];
  const { data } = await db.from('saved_bank_models').select('id, ticker, name, query, price, regression_price, ddm_price').order('created_at', { ascending: false }).limit(8);
  return data ?? [];
}

export default async function BanksHome() {
  const saved = await savedModels().catch(() => []);
  return (
    <>
      <Nav search={false} />
      <main>
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-amber/10 blur-[120px]" />
          <div className="relative mx-auto max-w-5xl px-4 pb-14 pt-14 text-center sm:px-6 lg:pt-20">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs text-sub">
              <span className="h-1.5 w-1.5 rounded-full bg-amber" /> BankVal AI · Financial Institutions Group workbench
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              Banks don&rsquo;t fit a DCF.
              <br />
              <span className="bg-gradient-to-r from-[#FBBF24] via-[#F59E0B] to-[#10B981] bg-clip-text text-transparent">Value them like a FIG banker.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-sub">
              Price to tangible book against return on tangible equity, a dividend model capped by Basel III capital, and an SVB-style rate and deposit-run stress test. Straight from SEC
              filings, recalculated as you drag.
            </p>
            <div className="mt-8">
              <BankPicker />
            </div>
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
              {BANKS.map(([t, n]) => (
                <Link key={t} href={`/banks/${t}`} className="group rounded-xl border border-line bg-panel/70 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-amber/50">
                  <div className="num text-sm font-semibold text-ink">{t}</div>
                  <div className="text-[11px] text-mute group-hover:text-sub">{n}</div>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-mute">Any US bank or thrift that files 10-K/10-Q reports with deposits works. Peer group: large and regional US commercial banks.</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FBBF24]">How bank valuation works</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Four ideas behind every FIG pitch</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {IDEAS.map(([t, d], i) => (
              <div key={t} className="rounded-2xl border border-line bg-panel/70 p-6">
                <div className="num flex h-9 w-9 items-center justify-center rounded-full bg-amber/90 text-sm font-bold text-black">{i + 1}</div>
                <div className="mt-4 text-lg font-semibold text-ink">{t}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-sub">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
          <div className="num grid gap-4 rounded-2xl border border-line bg-panel/80 p-6 text-[13px] leading-loose text-sub sm:p-8 md:grid-cols-3">
            <div>
              <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-mute">Tangible book</div>
              <div>TCE = common equity − goodwill − intangibles</div>
              <div>TBVPS = TCE ÷ shares</div>
              <div className="text-ink">ROATCE = NI to common ÷ avg TCE</div>
            </div>
            <div>
              <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-mute">Regression</div>
              <div>Implied P/TBV = α + β × ROATCE</div>
              <div>Ordinary least squares across peers</div>
              <div className="text-ink">Above the line = rich · below = cheap</div>
            </div>
            <div>
              <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-mute">3-stage DDM</div>
              <div>Div<sub>t</sub> = NI<sub>t</sub> − (RWA<sub>t</sub> × CET1* − CET1<sub>t−1</sub>)</div>
              <div>Value = Σ Div<sub>t</sub>/(1+K<sub>e</sub>)<sup>t</sup> + TV/(1+K<sub>e</sub>)<sup>n</sup></div>
              <div className="text-ink">K<sub>e</sub> = r<sub>f</sub> + β × ERP</div>
            </div>
          </div>
        </section>

        {saved.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-mute">Saved bank models</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((m) => (
                <Link key={m.id} href={`/banks/${m.ticker}${m.query}`} className="rounded-xl border border-line bg-panel/70 px-4 py-3 transition hover:border-amber/50">
                  <div className="flex items-baseline justify-between">
                    <span className="num font-semibold text-ink">{m.ticker}</span>
                    <span className="num text-xs text-mute">{price(Number(m.price))}</span>
                  </div>
                  <div className="num mt-0.5 text-[11px] text-sub">
                    P/TBV line {m.regression_price !== null ? price(Number(m.regression_price)) : '—'} · DDM {m.ddm_price !== null ? price(Number(m.ddm_price)) : '—'}
                  </div>
                  <div className="truncate text-xs text-mute">{m.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-mute">BankVal AI · Data: SEC EDGAR XBRL, U.S. Treasury and market prices · Educational analysis, not investment advice.</footer>
    </>
  );
}
