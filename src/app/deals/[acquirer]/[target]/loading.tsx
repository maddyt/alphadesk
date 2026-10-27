import { Nav } from '@/components/Nav';

const STEPS = ['Resolving both tickers to SEC CIKs', 'Fetching XBRL filings for buyer and target', 'Computing LTM net income, debt and share counts', 'Pulling live share prices', 'Running the accretion/dilution engine'];

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-[1600px] flex-col items-center px-4 pt-20 sm:px-6">
        <div className="glow w-full max-w-lg rounded-2xl border border-line bg-panel/80 p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">Building deal teardown</div>
            <div className="h-1.5 w-24 overflow-hidden rounded bg-line">
              <div className="h-full w-1/2 animate-scan rounded bg-brand" />
            </div>
          </div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex animate-fadeup items-center gap-3 text-[13px] text-sub" style={{ animationDelay: `${i * 450}ms` }}>
                <span className="num flex h-6 w-6 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[11px] text-[#8DB4FF]">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </main>
    </>
  );
}
