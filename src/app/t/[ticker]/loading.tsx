import { Nav } from '@/components/Nav';

const STEPS = [
  'Resolving ticker to SEC CIK',
  'Fetching XBRL companyfacts from data.sec.gov',
  'Parsing 10-K annual series and 10-Q LTM',
  'Pulling price history and regression beta',
  'Building peer multiples from peer filings',
  'Running five valuation methodologies',
];

export default function Loading() {
  return (
    <>
      <Nav />
      <main className="mx-auto flex max-w-[1600px] flex-col items-center px-6 pt-24">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-panel/80 p-6 glow">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">Building valuation</div>
            <div className="h-1.5 w-24 overflow-hidden rounded bg-line">
              <div className="h-full w-1/2 animate-scan rounded bg-brand" />
            </div>
          </div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex animate-fadeup items-center gap-3 text-[13px] text-sub" style={{ animationDelay: `${i * 450}ms` }}>
                <span className="num flex h-6 w-6 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-[11px] text-[#8DB4FF]">{i + 1}</span>
                {s}
                <span className="ml-auto h-1.5 w-1.5 animate-pulseline rounded-full bg-mark" />
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs text-mute">First load of a ticker downloads its full XBRL history (several MB). Cached afterwards.</p>
        </div>
      </main>
    </>
  );
}
