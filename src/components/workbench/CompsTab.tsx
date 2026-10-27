'use client';

import type { Assumptions, BaseInputs } from '@/lib/engine/model';
import { evToPrice } from '@/lib/engine/model';
import { percentile } from '@/lib/engine/stats';
import type { PeerComp } from '@/lib/types';
import { money, mult, pct, price } from '@/lib/format';
import { DotStrip } from '../charts/Charts';
import { Badge, Card, td, th } from '../ui';

export function CompsTab({ b, a, peers, peerBasis }: { b: BaseInputs; a: Assumptions; peers: PeerComp[]; peerBasis: string }) {
  const ms = b.peerMultiples;
  if (ms.length < 2) {
    return <Card title="Trading comparables">Not enough usable peers to build a comps range for this company.</Card>;
  }
  const q = { p25: percentile(ms, 0.25), median: percentile(ms, 0.5), p75: percentile(ms, 0.75) };
  const own = b.currentEV / b.ltmEbitda;
  const sorted = [...peers].sort((x, y) => y.evEbitda - x.evEbitda);
  const implied = (m: number) => evToPrice(b, m * b.ltmEbitda);

  return (
    <div className="space-y-5">
      <Card
        title="Peer EV / EBITDA"
        subtitle={`Peer set: ${peerBasis}. Shaded band = 25th-75th percentile, line = median.${b.peerExcluded.length ? ` Excluded as outliers (>3x from median): ${b.peerExcluded.join(', ')}.` : ''}`}
        right={<Badge tone={peers[0]?.source === 'sec-live' ? 'live' : 'snap'}>{peers[0]?.source === 'sec-live' ? 'Peers computed from live SEC filings' : 'Illustrative snapshot multiples'}</Badge>}
      >
        <DotStrip points={peers.filter((p) => !b.peerExcluded.includes(p.ticker)).map((p) => ({ label: p.ticker, value: p.evEbitda }))} target={own} targetLabel={b.ticker} {...q} />
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Comparable companies" subtitle={`EV and EBITDA on an LTM basis, ${peers[0]?.source === 'sec-live' ? 'built from each peer’s own XBRL facts and live price' : 'snapshot'}`}>
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Company</th>
                  <th className={th}>EV</th>
                  <th className={th}>LTM EBITDA</th>
                  <th className={th}>EV / EBITDA</th>
                  <th className={th}>EV / Rev</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.ticker} className="border-b border-line/40">
                    <td className={td}>
                      <span className="num mr-2 font-semibold text-ink">{p.ticker}</span>
                      <span className="text-mute">{p.name}</span>
                    </td>
                    <td className={td}>{p.ev ? money(p.ev) : '—'}</td>
                    <td className={td}>{p.ebitda ? money(p.ebitda) : '—'}</td>
                    <td className={`${td} font-semibold text-ink`}>
                      {b.peerExcluded.includes(p.ticker) && <span className="mr-2 rounded bg-amber/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber">NM · outlier</span>}
                      <span className={b.peerExcluded.includes(p.ticker) ? 'text-mute line-through' : ''}>{mult(p.evEbitda)}</span>
                    </td>
                    <td className={td}>{p.evRevenue ? mult(p.evRevenue) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-brand/10">
                  <td className={`${td} font-semibold text-[#8DB4FF]`}>{b.ticker} (target, at market)</td>
                  <td className={td}>{money(b.currentEV)}</td>
                  <td className={td}>{money(b.ltmEbitda)}</td>
                  <td className={`${td} font-semibold text-[#8DB4FF]`}>{mult(own)}</td>
                  <td className={`${td} font-semibold text-[#8DB4FF]`}>{mult(b.currentEV / b.ltmRevenue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Implied valuation" subtitle={`Peer multiples x ${b.ticker} ${b.ltmLabel} EBITDA of ${money(b.ltmEbitda)} and revenue of ${money(b.ltmRevenue)}. The comps bar spans both.`}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>Statistic</th>
                  <th className={th}>Multiple</th>
                  <th className={th}>EV</th>
                  <th className={th}>Per share</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['EV/EBITDA 25th', q.p25, b.ltmEbitda],
                    ['EV/EBITDA median', q.median, b.ltmEbitda],
                    ['EV/EBITDA 75th', q.p75, b.ltmEbitda],
                    ...(b.peerRevMultiples.length >= 2
                      ? ([
                          ['EV/Revenue 25th', percentile(b.peerRevMultiples, 0.25), b.ltmRevenue],
                          ['EV/Revenue median', percentile(b.peerRevMultiples, 0.5), b.ltmRevenue],
                          ['EV/Revenue 75th', percentile(b.peerRevMultiples, 0.75), b.ltmRevenue],
                        ] as const)
                      : []),
                  ] as (readonly [string, number, number])[]
                ).map(([k, m, metric]) => (
                  <tr key={k} className="border-b border-line/40">
                    <td className={td}>{k}</td>
                    <td className={td}>{mult(m)}</td>
                    <td className={td}>{money(m * metric)}</td>
                    <td className={`${td} font-semibold text-ink`}>{price(evToPrice(b, m * metric))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card title="Precedent transactions" subtitle="Trading multiples grossed up for a change-of-control premium">
            <p className="text-[13px] leading-relaxed text-sub">
              Acquirers pay a control premium over the unaffected trading price, typically 15-30% for large-cap US targets. The precedent range applies premia of{' '}
              <span className="num text-ink">
                {pct(Math.max(0, a.controlPremium - 0.075), 1)}-{pct(a.controlPremium + 0.075, 1)}
              </span>{' '}
              to the peer 25th-75th percentile multiples.
            </p>
            <div className="num mt-3 grid grid-cols-3 gap-2 text-center">
              {[q.p25, q.median, q.p75].map((m, i) => (
                <div key={i} className="rounded-lg border border-line bg-raised/50 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-mute">{['25th', 'Median', '75th'][i]}</div>
                  <div className="mt-0.5 text-sm font-semibold text-ink">{mult(m * (1 + a.controlPremium))}</div>
                  <div className="text-[11px] text-sub">{price(implied(m * (1 + a.controlPremium)))}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
