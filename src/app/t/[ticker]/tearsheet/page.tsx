import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FootballFieldSvg } from '@/components/charts/FootballFieldSvg';
import { LIGHT } from '@/components/charts/theme';
import { PrintButton } from '@/components/PrintButton';
import { ScaleToFit } from '@/components/ScaleToFit';
import { Logo } from '@/components/ui';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { valuate } from '@/lib/data/valuate';
import { evToPrice } from '@/lib/engine/model';
import { readOverrides, toQuery } from '@/lib/engine/params';
import { sensitivityWaccGrowth } from '@/lib/engine/valuation';
import { date, mm, money, mult, pct, price, signedPct } from '@/lib/format';
import type { Fact } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { ticker: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `${decodeURIComponent(params.ticker).toUpperCase()} tear sheet | ValuationEngine AI` };
}

const W = 1280; // 13.333in x 7.5in at 96dpi
const H = 720;

export default async function TearSheet({ params, searchParams }: Props) {
  let r;
  try {
    r = await valuate(params.ticker, readOverrides(searchParams));
  } catch (e) {
    if (e instanceof TickerNotFoundError) notFound();
    throw e;
  }
  const { ds, b, a, run, wacc, defaults } = r;
  const toPx = (ev: number) => evToPrice(b, ev);
  const rows = run.ranges.map((x) => ({ range: x, min: toPx(x.min), p25: toPx(x.p25), median: toPx(x.median), p75: toPx(x.p75), max: toPx(x.max) }));
  const sens = sensitivityWaccGrowth(b, a);
  const asOf = date(new Date().toISOString());
  const live = ds.source === 'sec-live';
  const last = ds.company.years[ds.company.years.length - 1];
  const sources: { label: string; f: Fact }[] = (
    [
      ['Revenue', ds.company.ltm.items.revenue],
      ['Operating income', ds.company.ltm.items.ebit],
      ['D&A', ds.company.ltm.items.da],
      ['Total debt', ds.company.balance.items.debt],
      ['Cash', ds.company.balance.items.cash],
      ['Shares outstanding', ds.company.balance.items.sharesOutstanding],
    ] as const
  ).flatMap(([label, it]) => (it ? it.facts.slice(0, 1).map((f) => ({ label, f })) : []));
  const upside = run.compositePrice / b.price - 1;

  return (
    <div className="theme-light min-h-screen bg-[#E9EDF2] px-3 py-8 print:bg-white print:px-0 print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-2">
        <Link href={`/t/${b.ticker}${toQuery(a, defaults)}`} className="text-sm text-[#1D4ED8] hover:underline">
          ← Back to workbench
        </Link>
        <div className="flex items-center gap-3 text-xs text-[#3F4A5A]">
          Two 16:9 pages, sized for a pitchbook. Use “Save as PDF” in the print dialog.
          <PrintButton />
        </div>
      </div>

      {/* ------------------------------------------------------------- Page 1 */}
      <div className="mx-auto max-w-[1280px]">
      <ScaleToFit width={W} height={H}>
      <section className="page flex flex-col bg-white text-[#0B1220] shadow-xl" style={{ width: W, height: H }}>
        <Header title="Preliminary valuation summary" name={b.name} ticker={b.ticker} asOf={asOf} page={1} />
        <div className="grid flex-1 grid-cols-[1fr_330px] gap-6 px-10 pt-5">
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <h3 className="text-[13px] font-bold uppercase tracking-wider text-[#0F1A33]">Implied value per share</h3>
              <span className="text-[11px] text-[#6B7689]">Bars: 25th–75th pct · whiskers: min–max · dashed: current price {price(b.price)}</span>
            </div>
            <div className="rounded-lg border border-[#DFE4EB]">
              <FootballFieldSvg
                rows={rows}
                current={b.price}
                currentLabel="Current"
                composite={run.compositePrice}
                width={W - 80 - 330 - 24 - 2}
                theme={LIGHT}
                format={(v) => price(v)}
                axisFormat={(v) => `$${v.toFixed(0)}`}
                animate={false}
                rowHeight={46}
              />
            </div>
            <table className="num mt-3 w-full text-[11px]">
              <thead>
                <tr className="border-b-2 border-[#0F1A33] text-left text-[10px] uppercase tracking-wider text-[#3F4A5A]">
                  <th className="py-1 font-semibold">Methodology</th>
                  <th className="py-1 text-right font-semibold">Low</th>
                  <th className="py-1 text-right font-semibold">Median</th>
                  <th className="py-1 text-right font-semibold">High</th>
                  <th className="py-1 text-right font-semibold">Median EV</th>
                  <th className="py-1 pl-4 font-semibold">Basis</th>
                </tr>
              </thead>
              <tbody>
                {run.ranges.map((x) => (
                  <tr key={x.methodology} className="border-b border-[#E3E7ED]">
                    <td className="py-1 font-sans font-semibold">{x.methodology}</td>
                    <td className="py-1 text-right">{price(toPx(x.min))}</td>
                    <td className="py-1 text-right font-semibold">{price(toPx(x.median))}</td>
                    <td className="py-1 text-right">{price(toPx(x.max))}</td>
                    <td className="py-1 text-right">{money(x.median)}</td>
                    <td className="max-w-[300px] truncate py-1 pl-4 font-sans text-[10.5px] text-[#6B7689]">{x.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg bg-[#0F1A33] px-5 py-4 text-white">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#9DB7F5]">Composite implied value</div>
              <div className="num mt-1 text-3xl font-semibold">{price(run.compositePrice)}</div>
              <div className={`num mt-0.5 text-sm ${upside >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>{signedPct(upside)} vs current</div>
              <div className="mt-1 text-[10.5px] text-[#9DB7F5]">Median of methodology medians</div>
            </div>
            <KV
              title="Market data"
              rows={[
                ['Share price', price(b.price)],
                ['52-week range', `${price(b.market52.low)} – ${price(b.market52.high)}`],
                ['Diluted shares', `${(b.shares / 1e9).toFixed(3)}B`],
                ['Market capitalization', money(b.marketCap)],
                ['(+) Debt', money(b.debt)],
                ['(−) Cash & ST investments', money(b.cash + b.securities)],
                ['Enterprise value', money(b.currentEV)],
              ]}
            />
            <KV
              title="Operating metrics"
              rows={[
                [`${b.ltmLabel} revenue`, money(b.ltmRevenue)],
                [`${b.ltmLabel} EBITDA`, money(b.ltmEbitda)],
                ['EBITDA margin', pct(b.ltmEbitda / b.ltmRevenue)],
                ['EV / LTM EBITDA', mult(b.currentEV / b.ltmEbitda)],
                ['Beta (levered)', b.beta.toFixed(2)],
              ]}
            />
          </aside>
        </div>
        <Footer live={live} sources={sources} cik={ds.company.cik} />
      </section>
      </ScaleToFit>
      </div>

      {/* ------------------------------------------------------------- Page 2 */}
      <div className="mx-auto mt-8 max-w-[1280px] print:mt-0">
      <ScaleToFit width={W} height={H}>
      <section className="page flex flex-col bg-white text-[#0B1220] shadow-xl" style={{ width: W, height: H }}>
        <Header title="DCF, sensitivity and LBO detail" name={b.name} ticker={b.ticker} asOf={asOf} page={2} />
        <div className="grid flex-1 grid-cols-[1.45fr_1fr] gap-8 px-10 pt-5">
          <div>
            <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[#0F1A33]">Unlevered free cash flow ($M)</h3>
            <table className="num w-full text-[11.5px]">
              <thead>
                <tr className="border-b-2 border-[#0F1A33] text-right text-[10px] uppercase tracking-wider text-[#3F4A5A]">
                  <th className="py-1 text-left font-semibold" />
                  <th className="py-1 font-semibold">{last.label}A</th>
                  {run.dcf.years.map((y) => (
                    <th key={y.label} className="py-1 font-semibold text-[#1D4ED8]">
                      {y.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Revenue', b.revenue0, (i: number) => run.dcf.years[i].revenue, true],
                    ['EBIT', b.ebit0, (i: number) => run.dcf.years[i].ebit],
                    ['(−) Taxes', undefined, (i: number) => -run.dcf.years[i].taxes],
                    ['(+) D&A', b.da0, (i: number) => run.dcf.years[i].da],
                    ['(−) CapEx', -b.capex0, (i: number) => -run.dcf.years[i].capex],
                    ['(−) ΔNWC', undefined, (i: number) => -run.dcf.years[i].dNwc],
                    ['Unlevered FCF', undefined, (i: number) => run.dcf.years[i].fcff, true],
                    ['PV of FCF', undefined, (i: number) => run.dcf.years[i].pvFcff],
                  ] as [string, number | undefined, (i: number) => number, boolean?][]
                ).map(([label, base, get, strong]) => (
                  <tr key={label} className={`border-b border-[#E3E7ED] text-right ${strong ? 'font-semibold' : ''}`}>
                    <td className="py-1 text-left font-sans">{label}</td>
                    <td className="py-1">{base === undefined ? '' : mm(base)}</td>
                    {run.dcf.years.map((_, i) => (
                      <td key={i} className="py-1">
                        {mm(get(i))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-5 grid grid-cols-2 gap-6">
              <KV
                title="WACC"
                rows={[
                  ['Risk-free rate', pct(wacc.riskFree, 2)],
                  ['Beta × ERP', `${wacc.beta.toFixed(2)} × ${pct(wacc.erp, 2)}`],
                  ['Cost of equity', pct(wacc.costOfEquity, 2)],
                  ['After-tax cost of debt', pct(wacc.afterTaxKd, 2)],
                  ['E / (D+E)', pct(wacc.weightEquity)],
                  ['WACC applied', pct(a.wacc, 2)],
                ]}
              />
              <KV
                title="DCF output"
                rows={[
                  ['Σ PV of FCF', money(run.dcf.sumPvFcff)],
                  ['PV of TV (perpetuity)', money(run.dcf.pvTvGordon)],
                  ['Enterprise value', money(run.dcf.evGordon)],
                  ['Implied share price', price(evToPrice(b, run.dcf.evGordon))],
                  ['Implied exit multiple', mult(run.dcf.impliedExitMultiple)],
                  ['Perpetuity growth', pct(a.terminalGrowth, 2)],
                ]}
              />
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wider text-[#0F1A33]">Implied price: WACC vs perpetuity growth</h3>
              <table className="num w-full border-collapse text-center text-[11.5px]">
                <thead>
                  <tr>
                    <th className="p-1 text-[10px] text-[#6B7689]" />
                    {sens.cols.map((c) => (
                      <th key={c} className="bg-[#0F1A33] p-1 font-semibold text-white">
                        {pct(c, 2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sens.rows.map((w, i) => (
                    <tr key={w}>
                      <th className="bg-[#0F1A33] p-1 font-semibold text-white">{pct(w, 2)}</th>
                      {sens.values[i].map((v, j) => {
                        const d = v / b.price - 1;
                        const bg = Math.abs(d) < 0.02 ? '#F1F5F9' : d > 0 ? `rgba(22,163,74,${Math.min(0.55, 0.08 + Math.abs(d))})` : `rgba(220,38,38,${Math.min(0.55, 0.08 + Math.abs(d))})`;
                        return (
                          <td key={j} className={`border border-white p-1 ${i === 2 && j === 2 ? 'font-bold outline outline-2 outline-[#0F1A33]' : ''}`} style={{ background: bg }}>
                            {price(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {run.lbo && (
              <KV
                title="LBO floor"
                rows={[
                  ['Leverage', `${mult(a.lboLeverage)} LTM EBITDA`],
                  ['Target IRR / hold', `${pct(a.lboTargetIrr, 0)} / 5 years`],
                  ['Max entry multiple', mult(run.lbo.entryMultiple)],
                  ['Max entry EV', money(run.lbo.entryEv)],
                  ['Implied share price', price(evToPrice(b, run.lbo.entryEv))],
                  ['MoIC', mult(run.lbo.moic, 2)],
                ]}
              />
            )}
            <KV
              title="Comparable companies"
              rows={[
                ['Peer set', ds.peerBasis.replace(/ \(.*\)$/, '')],
                ['Peers', ds.peers.map((p) => p.ticker).join(', ')],
                ['EV/EBITDA range', `${mult(Math.min(...b.peerMultiples))} – ${mult(Math.max(...b.peerMultiples))}`],
                ['Control premium (precedents)', pct(a.controlPremium)],
              ]}
            />
          </div>
        </div>
        <Footer live={live} sources={sources} cik={ds.company.cik} />
      </section>
      </ScaleToFit>
      </div>
    </div>
  );
}

function Header({ title, name, ticker, asOf, page }: { title: string; name: string; ticker: string; asOf: string; page: number }) {
  return (
    <header className="flex items-end justify-between border-b-4 border-[#0F1A33] px-10 pb-3 pt-7">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1D4ED8]">{title}</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[#0F1A33]">
          {name} <span className="num text-[#6B7689]">({ticker})</span>
        </h1>
      </div>
      <div className="flex items-center gap-3 text-right text-[11px] text-[#3F4A5A]">
        <div>
          <div>As of {asOf}</div>
          <div className="num">Page {page}</div>
        </div>
        <Logo size={30} />
      </div>
    </header>
  );
}

function KV({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <div className="mb-1 border-b-2 border-[#0F1A33] pb-1 text-[10.5px] font-bold uppercase tracking-wider text-[#0F1A33]">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[#E3E7ED] py-[3px] text-[11.5px]">
          <span className="text-[#3F4A5A]">{k}</span>
          <span className="num truncate text-right font-medium text-[#0B1220]">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Footer({ live, sources, cik }: { live: boolean; sources: { label: string; f: Fact }[]; cik: string }) {
  return (
    <footer className="mt-auto border-t border-[#DFE4EB] px-10 py-3 text-[9.5px] leading-relaxed text-[#6B7689]">
      <div>
        <span className="font-semibold text-[#3F4A5A]">Sources: </span>
        {live ? (
          <>
            SEC EDGAR XBRL (CIK {cik}):{' '}
            {sources.map((s, i) => (
              <span key={s.label}>
                {s.label} <span className="num">{s.f.tag}</span> {s.f.form} accn <span className="num">{s.f.accn ?? 'n/a'}</span>
                {i < sources.length - 1 ? '; ' : '.'}
              </span>
            ))}
          </>
        ) : (
          'Offline snapshot rounded from 10-K filings; market data approximate; peer multiples illustrative.'
        )}{' '}
        Market data per workbench. EV = market capitalization + total debt − cash and short-term investments.
      </div>
      <div className="mt-0.5">Prepared with ValuationEngine AI. Preliminary and for discussion purposes only; not investment advice.</div>
    </footer>
  );
}
