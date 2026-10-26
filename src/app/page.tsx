import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { TickerSearch } from '@/components/TickerSearch';
import { FootballFieldSvg } from '@/components/charts/FootballFieldSvg';
import { DARK } from '@/components/charts/theme';
import { snapshotDataset } from '@/lib/data/snapshot';
import { recentRuns } from '@/lib/data/dataset';
import { buildBaseInputs, defaultAssumptions, evToPrice } from '@/lib/engine/model';
import { runValuation } from '@/lib/engine/valuation';
import { price, signedPct } from '@/lib/format';

export const revalidate = 60;

const FEATURED: { t: string; name: string; tag: string }[] = [
  { t: 'AAPL', name: 'Apple', tag: 'Mega-cap tech' },
  { t: 'NVDA', name: 'NVIDIA', tag: 'Semiconductors' },
  { t: 'DIS', name: 'Walt Disney', tag: 'Media' },
  { t: 'MSFT', name: 'Microsoft', tag: 'Software' },
  { t: 'COST', name: 'Costco', tag: 'Retail' },
  { t: 'KO', name: 'Coca-Cola', tag: 'Staples' },
];

const STEPS = [
  {
    n: '1',
    title: 'Pick a company',
    body: 'Type a stock ticker such as NVDA. We pull the company’s official annual and quarterly reports from the SEC, the free government database that Wall Street itself relies on.',
  },
  {
    n: '2',
    title: 'Get five answers on one chart',
    body: 'Professionals never trust a single number, so we value the company five different ways and line the answers up next to today’s stock price.',
  },
  {
    n: '3',
    title: 'Ask “what if?”',
    body: 'Think growth will be faster, or interest rates higher? Drag a slider and every bar moves instantly. You see which assumptions actually matter.',
  },
];

const METHODS = [
  {
    name: 'What the market paid this year',
    term: '52-week range',
    d: 'The lowest and highest prices the stock traded at over the past year. A reality check for every other method.',
    f: 'EV = price × shares + net debt',
  },
  {
    name: 'Priced like its peers',
    term: 'Trading comparables',
    d: 'If similar companies sell for about 15× their yearly profit, this one probably should too. We compare it to its closest rivals.',
    f: 'EV = peer EV/EBITDA × LTM EBITDA',
  },
  {
    name: 'What a buyer would pay',
    term: 'Precedent transactions',
    d: 'Companies bought outright usually sell for 15–30% more than their stock price, because the buyer gets control.',
    f: 'Peer multiple × (1 + control premium)',
  },
  {
    name: 'Value of its future cash',
    term: 'Discounted cash flow (DCF)',
    d: 'Forecast the cash the business will generate, then work out what that future cash is worth in today’s money.',
    f: 'EV = Σ FCFFₜ/(1+WACC)ᵗ + TV/(1+WACC)ⁿ',
  },
  {
    name: 'What a buyout fund could pay',
    term: 'LBO floor',
    d: 'A private-equity fund borrows to buy the company and needs about a 20% yearly return. That caps its price, which makes it a useful floor.',
    f: 'max EV such that IRR ≥ 20% at 5–6× debt',
  },
];

function ReadTheChart() {
  // A single annotated football-field row, drawn in HTML so the callouts can wrap on small screens.
  return (
    <div className="rounded-2xl border border-line bg-panel/80 p-6 sm:p-8">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">How to read the chart</div>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Each row is one way of valuing the company</h3>
      <div className="relative mx-auto mt-12 max-w-3xl pb-4">
        <div className="relative h-24">
          {/* today's price */}
          <div className="absolute bottom-0 top-0 border-l-2 border-dashed border-mark" style={{ left: '62%' }} />
          <div className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-full bg-mark px-2.5 py-0.5 text-[11px] font-bold text-black" style={{ left: '62%' }}>
            Today&rsquo;s price $100
          </div>
          {/* whisker + bar */}
          <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-[#64748B]" style={{ left: '12%', right: '22%' }} />
          <div className="absolute top-[38%] h-[24%] w-0.5 bg-[#64748B]" style={{ left: '12%' }} />
          <div className="absolute top-[38%] h-[24%] w-0.5 bg-[#64748B]" style={{ right: '22%' }} />
          <div className="absolute top-[36%] h-[28%] rounded-md bg-gradient-to-b from-[#3B82F6] to-brand" style={{ left: '30%', right: '52%' }} />
          <div className="absolute top-[38%] h-[24%] w-0.5 bg-white" style={{ left: '38%' }} />
          <span className="num absolute top-1/2 -translate-x-full -translate-y-1/2 pr-2 text-xs text-sub" style={{ left: '12%' }}>
            $60
          </span>
          <span className="num absolute top-1/2 -translate-y-1/2 pl-2 text-xs text-sub" style={{ left: '78%' }}>
            $115
          </span>
        </div>
        <div className="mt-6 grid gap-4 text-[13px] leading-relaxed sm:grid-cols-4">
          <Callout color="bg-[#64748B]" title="Thin line">
            The full range: lowest to highest answer under reasonable assumptions.
          </Callout>
          <Callout color="bg-brand" title="Blue bar">
            The most likely range, where the middle half of the answers land.
          </Callout>
          <Callout color="bg-white" title="White tick">
            The single midpoint estimate for this method.
          </Callout>
          <Callout color="bg-mark" title="Green dashed line">
            Today&rsquo;s stock price. A bar to its left says the stock is worth less than it costs; to its right, more.
          </Callout>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-3xl rounded-xl bg-raised/60 px-4 py-3 text-[13px] leading-relaxed text-sub">
        <span className="font-semibold text-ink">In this example</span> the method says the company is worth roughly $75–$90 a share, with $60–$115 as the outer limits.
        At $100 the stock looks a bit expensive, unless you believe something the assumptions don&rsquo;t capture. Finding out what that something is, is the whole point of the
        sliders.
      </p>
    </div>
  );
}

function Callout({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 font-semibold text-ink">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
        {title}
      </div>
      <p className="mt-1 text-mute">{children}</p>
    </div>
  );
}

function HeroChart() {
  const ds = snapshotDataset('AAPL');
  if (!ds) return null;
  const b = buildBaseInputs(ds);
  const run = runValuation(b, defaultAssumptions(b));
  const rows = run.ranges.map((r) => ({
    range: r,
    min: evToPrice(b, r.min),
    p25: evToPrice(b, r.p25),
    median: evToPrice(b, r.median),
    p75: evToPrice(b, r.p75),
    max: evToPrice(b, r.max),
  }));
  return (
    <FootballFieldSvg
      rows={rows}
      current={b.price}
      currentLabel="AAPL"
      composite={run.compositePrice}
      width={760}
      theme={DARK}
      format={(v) => `$${v.toFixed(0)}`}
      axisFormat={(v) => `$${v.toFixed(0)}`}
    />
  );
}

export default async function Home() {
  const recent = await recentRuns();
  return (
    <>
      <Nav search={false} />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="grid-bg pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-brand/20 blur-[120px]" />
          <div className="relative mx-auto grid max-w-[1400px] items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
            <div className="animate-fadeup">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3 py-1 text-xs text-sub">
                <span className="h-1.5 w-1.5 rounded-full bg-mark" /> Official SEC data · 5 valuation methods · every number traceable
              </div>
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl xl:text-6xl">
                What is a company
                <br />
                <span className="bg-gradient-to-r from-[#7FA8FF] via-[#3B82F6] to-[#10B981] bg-clip-text text-transparent">really worth?</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-sub">
                Type in any US-listed company. We read its official financial reports from the SEC, value it five different ways the way investment bankers do, and show every
                answer on one chart next to today&rsquo;s stock price.
              </p>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-mute">
                Then drag the sliders (growth, profit, interest rates) and watch the answer change. It&rsquo;s the quickest way to see whether a stock looks cheap or expensive, and why.
              </p>
              <div className="mt-8 max-w-xl">
                <TickerSearch autoFocus />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {FEATURED.map((f) => (
                  <Link
                    key={f.t}
                    href={`/t/${f.t}`}
                    className="group flex items-center gap-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-sm transition hover:-translate-y-0.5 hover:border-brand/50 hover:bg-brand/10"
                  >
                    <span className="num font-semibold text-ink">{f.t}</span>
                    <span className="text-xs text-mute group-hover:text-sub">{f.tag}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="glow relative animate-fadeup rounded-2xl bg-panel/90 p-2 [animation-delay:150ms]">
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]/70" />
                </div>
                <span className="text-[11px] text-mute">Example: Apple, value per share by method (illustrative)</span>
              </div>
              <div className="overflow-x-auto">
                <HeroChart />
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">How it works</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Three steps, no finance degree required</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-line bg-panel/70 p-6">
                <div className="num flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{s.n}</div>
                <div className="mt-4 text-lg font-semibold text-ink">{s.title}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-sub">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
          <ReadTheChart />
        </section>

        {/* The five methods */}
        <section className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">The five rows</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Five ways professionals value a company</h2>
            <p className="mt-3 text-sub">Each one asks the same question from a different angle. When they agree you can be more confident; when they don&rsquo;t, the gap tells a story.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {METHODS.map((m) => (
              <div key={m.name} className="flex flex-col rounded-2xl border border-line bg-gradient-to-b from-panel to-bg p-5">
                <div className="font-semibold text-ink">{m.name}</div>
                <div className="mt-0.5 text-[11px] uppercase tracking-wider text-mute">{m.term}</div>
                <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-sub">{m.d}</p>
                <code className="num mt-4 block rounded-lg bg-raised/70 px-3 py-2 text-[11px] leading-relaxed text-[#8DB4FF]" title="The math, for the finance-minded">
                  {m.f}
                </code>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <section className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Real numbers, not guesses', 'Every figure comes from the company’s own SEC filings. Click any number in the app to see exactly which report it came from.'],
              ['AI writes the words, not the math', 'General AI chatbots often get numbers wrong. Here the math runs in ordinary code, and the AI summary is checked number by number against it.'],
              ['Ready for a pitchbook', 'Export a clean, two-page summary in the standard 16:9 investment-banking format, ready to print or save as PDF.'],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border border-line bg-panel/60 p-5">
                <div className="font-semibold text-ink">{t}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-mute">{d}</p>
              </div>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-mute">Recently valued</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((r) => {
                const up = Number(r.composite_price) / Number(r.price) - 1;
                return (
                  <Link key={r.ticker} href={`/t/${r.ticker}`} className="rounded-xl border border-line bg-panel/70 px-4 py-3 transition hover:border-brand/50">
                    <div className="flex items-baseline justify-between">
                      <span className="num font-semibold text-ink">{r.ticker}</span>
                      <span className={`num text-xs ${up >= 0 ? 'text-up' : 'text-down'}`}>{signedPct(up)}</span>
                    </div>
                    <div className="truncate text-xs text-mute">{r.name}</div>
                    <div className="num mt-1 text-xs text-sub">
                      {price(Number(r.price))} → {price(Number(r.composite_price))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>
      <footer className="border-t border-line py-8 text-center text-xs text-mute">
        ValuationEngine AI · Data: SEC EDGAR XBRL (public domain) and market prices · For education and analysis, not investment advice.
      </footer>
    </>
  );
}
