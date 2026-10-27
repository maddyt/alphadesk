'use client';

import type { BaseInputs } from '@/lib/engine/model';
import type { SotpInput } from '@/lib/engine/valuation';
import { evToPrice } from '@/lib/engine/model';
import type { Intel } from '@/lib/types';
import { filingUrl } from '@/lib/sec/links';
import { date, money, mult, price } from '@/lib/format';
import { Card } from '../ui';
import { SegmentMix } from '../intel/IntelPanels';

export function SegmentsTab({ b, intel, loading, sotp, baseMultiple, onMultiple, onReset }: { b: BaseInputs; intel: Intel | null; loading: boolean; sotp: SotpInput | null; baseMultiple: number; onMultiple: (i: number, m: number) => void; onReset: () => void }) {
  if (loading) return <Card title="Segments & sum-of-the-parts">Loading segment revenue from the latest 10-K…</Card>;
  const seg = intel?.segments;
  if (!seg) {
    return (
      <Card title="Segments & sum-of-the-parts">
        <p className="text-[13px] text-sub">
          {intel?.source === 'snapshot'
            ? 'Segment data for this ticker needs live SEC access (the offline snapshot covers Apple and Disney).'
            : 'This company’s latest 10-K does not break revenue down by product or segment in machine-readable XBRL, so a sum-of-the-parts can’t be built automatically.'}
        </p>
      </Card>
    );
  }
  const ev = sotp ? sotp.lines.reduce((s, l) => s + l.revenue * l.multiple, 0) : NaN;
  return (
    <div className="space-y-5">
      <Card
        title="Revenue by segment and geography"
        subtitle={
          seg.accessionNumber ? (
            <>
              From the dimensional XBRL in the 10-K for the year ended {date(seg.fyEnd)} (accession{' '}
              <a className="num text-mark hover:underline" href={filingUrl(intel!.cik, seg.accessionNumber)} target="_blank" rel="noreferrer">
                {seg.accessionNumber}
              </a>
              ). Segment detail isn&rsquo;t in the SEC companyfacts API, so the app reads the filing&rsquo;s own XBRL instance.
            </>
          ) : (
            `Offline snapshot, rounded from the 10-K notes for the year ended ${date(seg.fyEnd)}.`
          )
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {seg.breakdowns.map((bd) => (
            <SegmentMix key={bd.axisQName} b={bd} />
          ))}
        </div>
      </Card>

      {sotp && (
        <Card
          title="Sum-of-the-parts valuation"
          subtitle={`Each ${sotp.axisLabel} line gets its own EV/revenue multiple. Starting point: peer median ${mult(baseMultiple)}, tilted up for services/software and down for hardware. Edit any multiple.`}
          right={
            <button type="button" onClick={onReset} className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-sub hover:text-ink">
              Reset multiples
            </button>
          }
        >
          <div className="space-y-3">
            {sotp.lines.map((l, i) => (
              <div key={l.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto]">
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-ink">{l.label}</div>
                  <div className="num text-[11px] text-mute">{money(l.revenue)} revenue</div>
                </div>
                <div className="order-3 col-span-2 flex items-center gap-2 sm:order-none sm:col-span-1">
                  <input
                    type="range"
                    className="slider"
                    min={0.25}
                    max={Math.max(20, Math.ceil(l.multiple * 2))}
                    step={0.25}
                    value={l.multiple}
                    aria-label={`${l.label} EV/revenue multiple`}
                    style={{ ['--fill' as string]: `${(l.multiple / Math.max(20, Math.ceil(l.multiple * 2))) * 100}%` }}
                    onChange={(e) => onMultiple(i, Number(e.target.value))}
                  />
                  <span className="num w-12 shrink-0 text-right text-[12.5px] font-semibold text-[#8DB4FF]">{mult(l.multiple, 2)}</span>
                </div>
                <div className="num text-right text-[13px] font-semibold text-ink">{money(l.revenue * l.multiple)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <Stat label="SOTP enterprise value" value={money(ev)} />
            <Stat label="Implied per share" value={price(evToPrice(b, ev))} accent />
            <Stat label="vs current EV" value={`${((ev / b.currentEV - 1) * 100).toFixed(1)}%`} />
            <Stat label="Blended EV / revenue" value={mult(ev / sotp.lines.reduce((s, l) => s + l.revenue, 0))} />
          </div>
          <p className="mt-3 text-[11px] text-mute">The football field&rsquo;s Sum-of-the-Parts bar flexes all multiples by ±20%.</p>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-mute">{label}</div>
      <div className={`num mt-0.5 text-[15px] font-semibold ${accent ? 'text-[#8DB4FF]' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
