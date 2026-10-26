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
  { n: '01', title: 'SEC EDGAR XBRL', body: 'companyfacts REST endpoint, custom User-Agent, rate-limited under 10 req/s. No terminal licence.' },
  { n: '02', title: 'Parse & reconcile', body: 'Annual 10-K series, LTM from 10-Q YTD, latest balance sheet. Every value keeps its tag and accession ID.' },
  { n: '03', title: 'Five methodologies', body: '52-week, trading comps, precedents, DCF and LBO floor run concurrently in one deterministic engine.' },
  { n: '04', title: 'Zod-validated output', body: 'Ranges are schema-checked before they leave the server. The AI memo can only cite engine figures.' },
  { n: '05', title: 'Pitchbook visuals', body: 'SVG football field, sensitivity heatmaps, EV bridge, LBO schedule, 16:9 tear sheet export.' },
];

const METHODS = [
  { name: 'Discounted Cash Flow', f: 'EV = Σ FCFFₜ/(1+WACC)ᵗ + TVₙ/(1+WACC)ⁿ', d: 'FCFF = EBIT(1−t) + D&A − CapEx − ΔNWC. Terminal value by both Gordon growth and exit multiple; WACC from CAPM with a regression beta.' },
  { name: 'Trading comps', f: 'EV = peer EV/EBITDA × LTM EBITDA', d: 'Peer multiples built from each peer’s own SEC filings and live price; 25th, median and 75th percentiles applied to the target.' },
  { name: 'Precedent transactions', f: 'Multiple × (1 + 15–30% control premium)', d: 'Change-of-control premium over the trading range. Slider moves the premium; the bar stretches with it.' },
  { name: 'LBO floor', f: 'max EV s.t. IRR ≥ 20% at 5.0–6.0x leverage', d: 'Five-year cash sweep with interest on the opening balance; the entry multiple is solved by bisection.' },
  { name: '52-week range', f: 'EV = price × shares + net debt', d: 'Distribution of trailing daily closes: low, quartiles and high, bridged from equity value to enterprise value.' },
];

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
                <span className="h-1.5 w-1.5 rounded-full bg-mark" /> SEC EDGAR XBRL · 5 methodologies · audit trail to accession ID
              </div>
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl xl:text-6xl">
                Ticker in.
                <br />
                <span className="bg-gradient-to-r from-[#7FA8FF] via-[#3B82F6] to-[#10B981] bg-clip-text text-transparent">Football field out.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-sub">
                An institutional valuation workbench. Pulls 10-K and 10-Q data straight from SEC EDGAR, runs DCF, comps, precedents, LBO and 52-week analysis, and lets you stress-test every
                bar in real time.
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
                <span className="text-[11px] text-mute">Implied value per share · illustrative snapshot</span>
              </div>
              <div className="overflow-x-auto">
                <HeroChart />
              </div>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="how" className="mx-auto max-w-[1400px] scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mb-10 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8DB4FF]">How it works</div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Deterministic math, auditable to the filing</h2>
            <p className="mt-3 text-sub">
              General-purpose AI predicts tokens, which is how multiples get mis-stated and balance sheets stop balancing. Here the arithmetic runs in typed code, every input traces to an XBRL fact, and the
              language model only writes the narrative.
            </p>
          </div>
          <ol className="grid gap-4 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.n} className="relative rounded-2xl border border-line bg-panel/70 p-5">
                <div className="num text-xs font-semibold text-[#8DB4FF]">{s.n}</div>
                <div className="mt-2 font-semibold text-ink">{s.title}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-mute">{s.body}</p>
                {i < STEPS.length - 1 && <div className="absolute -right-3 top-1/2 hidden h-px w-6 bg-gradient-to-r from-brand to-transparent md:block" />}
              </li>
            ))}
          </ol>
        </section>

        {/* Methodologies */}
        <section className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {METHODS.map((m) => (
              <div key={m.name} className="rounded-2xl border border-line bg-gradient-to-b from-panel to-bg p-5">
                <div className="font-semibold text-ink">{m.name}</div>
                <code className="num mt-3 block rounded-lg bg-raised/70 px-3 py-2 text-[12px] leading-relaxed text-[#8DB4FF]">{m.f}</code>
                <p className="mt-3 text-[13px] leading-relaxed text-mute">{m.d}</p>
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
