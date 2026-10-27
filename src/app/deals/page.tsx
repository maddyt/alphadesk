import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { PairPicker } from '@/components/deals/PairPicker';
import { savedDeals } from '@/lib/data/dataset';
import { signedPct } from '@/lib/format';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'DealPulse | M&A accretion/dilution teardowns',
  description: 'Pick a buyer and a target. See instantly whether the deal raises or lowers earnings per share, what it costs, and what could go wrong.',
};

const PAIRS: [string, string, string][] = [
  ['DIS', 'EA', 'Media buys gaming'],
  ['MSFT', 'EA', 'Big tech buys gaming'],
  ['NVDA', 'AMD', 'Chip rivals combine'],
  ['PEP', 'KHC', 'Packaged-food roll-up'],
  ['CVX', 'COP', 'Oil majors merge'],
  ['COST', 'TGT', 'Retail consolidation'],
  ['NVDA', 'ASML', 'Cross-border · IFRS target'],
  ['SAP', 'CRM', 'Cross-border · IFRS acquirer'],
  ['DIS', 'SONY', 'Cross-border · media'],
];

const STEPS = [
  ['Pick two companies', 'A buyer and a target. We pull both companies’ latest official numbers from the SEC automatically.'],
  ['Set the deal terms', 'How much above today’s price the buyer pays, and whether it pays with cash, new shares or borrowed money.'],
  ['See the answer instantly', 'Does the buyer’s earnings per share go up (accretive) or down (dilutive)? Plus the risks, the break-even point, and a one-page teaser.'],
];

export default async function DealsHome() {
  const saved = await savedDeals();
  return (
    <>
      <Nav search={false} />
      <main>
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-mark/15 blur-[120px]" />
          <div className="relative mx-auto max-w-5xl px-4 pb-16 pt-14 text-center sm:px-6 lg:pt-20">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs text-sub">
              <span className="h-1.5 w-1.5 rounded-full bg-mark" /> DealPulse · M&amp;A teardown in seconds
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              What happens when
              <br />
              <span className="bg-gradient-to-r from-[#7FA8FF] via-[#3B82F6] to-[#10B981] bg-clip-text text-transparent">one company buys another?</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-sub">
              The first question every banker asks about a deal: will it make the buyer&rsquo;s earnings per share go up or down? Pick two companies and find out, using real SEC
              filings, with sliders for price, financing and cost savings.
            </p>
            <div className="mx-auto mt-8 max-w-4xl text-left">
              <PairPicker />
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {PAIRS.map(([a, t, d]) => (
                <Link key={a + t} href={`/deals/${a}/${t}`} className="group rounded-xl border border-line bg-panel/70 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-brand/50">
                  <div className="num text-sm font-semibold text-ink">
                    {a} <span className="text-mute">+</span> {t}
                  </div>
                  <div className="text-[11px] text-mute group-hover:text-sub">{d}</div>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-mute">
              All pairings are hypothetical, for analysis practice. Non-US companies filing 20-F reports (IFRS or foreign-currency GAAP) are converted to USD and ADR shares automatically.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">How it works</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Three steps, one big question</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-line bg-panel/70 p-6">
                <div className="num flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</div>
                <div className="mt-4 text-lg font-semibold text-ink">{t}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-sub">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
          <div className="grid gap-6 rounded-2xl border border-line bg-panel/80 p-6 sm:p-8 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">The key idea</div>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Accretive or dilutive?</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-sub">
                Earnings per share (EPS) is profit divided by the number of shares. After a deal, the buyer adds the target&rsquo;s profit and any cost savings, but also pays interest on
                borrowed money and may issue new shares.
              </p>
              <p className="mt-3 text-[14.5px] leading-relaxed text-sub">
                If the new EPS is <span className="font-semibold text-up">higher</span>, the deal is <span className="font-semibold text-up">accretive</span>. If it&rsquo;s{' '}
                <span className="font-semibold text-down">lower</span>, it&rsquo;s <span className="font-semibold text-down">dilutive</span>. Pay too much, or issue too many shares, and a
                good company can still be a bad deal.
              </p>
            </div>
            <div className="num rounded-xl bg-raised/60 p-5 text-[13px] leading-loose text-sub">
              <div className="font-sans text-[11px] font-semibold uppercase tracking-wider text-mute">The math, for the finance-minded</div>
              <div>Pro-forma NI = NI<sub>A</sub> + NI<sub>T</sub> + synergies(1−t) − new debt·r<sub>d</sub>(1−t) − cash used·r<sub>c</sub>(1−t)</div>
              <div>Pro-forma shares = shares<sub>A</sub> + (price × stock %) ÷ acquirer price</div>
              <div className="text-ink">Accretion = PF EPS ÷ standalone EPS − 1</div>
            </div>
          </div>
        </section>

        {saved.length > 0 && (
          <section className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-mute">Saved teardowns</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {saved.map((d) => (
                <Link key={d.id} href={`/deals/${d.acquirer}/${d.target}${d.query}`} className="rounded-xl border border-line bg-panel/70 px-4 py-3 transition hover:border-brand/50">
                  <div className="flex items-baseline justify-between">
                    <span className="num font-semibold text-ink">
                      {d.acquirer} + {d.target}
                    </span>
                    <span className={`num text-xs ${Number(d.accretion) >= 0 ? 'text-up' : 'text-down'}`}>{signedPct(Number(d.accretion))}</span>
                  </div>
                  <div className="truncate text-xs text-mute">{d.name}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-mute">DealPulse · Data: SEC EDGAR XBRL and market prices · Hypothetical analysis, not investment advice.</footer>
    </>
  );
}
