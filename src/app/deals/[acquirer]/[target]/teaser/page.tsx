import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { ScaleToFit } from '@/components/ScaleToFit';
import { WaterfallSvg } from '@/components/deals/DealCharts';
import { DealRoomExport } from '@/components/deals/DealRoomExport';
import { waterSteps } from '@/components/deals/steps';
import { LIGHT } from '@/components/charts/theme';
import { Logo } from '@/components/ui';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { gridPremiumSynergies, riskScorecard, synergyMax, type Rag } from '@/lib/deals/engine';
import { geoBreakdown, geoOverlap, productBreakdown, productOverlap } from '@/lib/deals/overlap';
import { getIntel } from '@/lib/data/intel';
import { dealQuery, readDealOverrides } from '@/lib/deals/params';
import { dealRun } from '@/lib/deals/run';
import { date, money, mult, pct, price, signedPct } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { acquirer: string; target: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `${decodeURIComponent(params.acquirer).toUpperCase()} + ${decodeURIComponent(params.target).toUpperCase()} teaser | DealPulse` };
}

// US Letter portrait at 96 dpi.
const W = 816;
const H = 1056;

const RAG: Record<Rag, string> = { green: '#16A34A', amber: '#D97706', red: '#DC2626' };

export default async function Teaser({ params, searchParams }: Props) {
  let d;
  try {
    d = await dealRun(params.acquirer, params.target, readDealOverrides(searchParams));
  } catch (e) {
    if (e instanceof TickerNotFoundError) notFound();
    throw e;
  }
  const { A, T, a, r, defaults } = d;
  // PRD v2: the teaser scorecard includes segment overlap and target governance when the feeds are available.
  const [iA, iT] = await Promise.all([getIntel(A.ticker).catch(() => null), getIntel(T.ticker).catch(() => null)]);
  const risk = riskScorecard(A, T, a, r, {
    productOverlap: productOverlap(productBreakdown(iA?.segments?.breakdowns), productBreakdown(iT?.segments?.breakdowns))?.share ?? null,
    geoOverlap: geoOverlap(geoBreakdown(iA?.segments?.breakdowns), geoBreakdown(iT?.segments?.breakdowns)),
    targetGovernance: iT?.governance ? { rating: iT.governance.rating, flags: iT.governance.flags.filter((f) => f.severity !== 'info').map((f) => `${f.code} (${f.filingDate})`) } : null,
    activist: iT?.ownership?.find((o) => o.activist)?.filer ?? null,
    insiderSelling: iT?.insiders?.signal === 'selling' ? iT.insiders.sells : null,
  });
  const grid = gridPremiumSynergies(A, T, a, synergyMax(T, A));
  const accretive = r.accretion >= 0;
  const live = A.source === 'sec-live' && T.source === 'sec-live';

  return (
    <div className="theme-light min-h-screen bg-[#E9EDF2] px-3 py-6 print:bg-white print:p-0">
      <style>{'@media print { @page { size: 8.5in 11in; margin: 0; } }'}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[816px] flex-wrap items-center justify-between gap-3">
        <Link href={`/deals/${A.ticker}/${T.ticker}${dealQuery(a, defaults)}`} className="text-sm text-[#1D4ED8] hover:underline">
          ← Back to deal
        </Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[816px]">
        <ScaleToFit width={W} height={H}>
          <section className="page flex flex-col bg-white text-[#0B1220] shadow-xl" style={{ width: W, height: H }}>
            <header className="bg-[#0F1A33] px-10 pb-5 pt-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#9DB7F5]">Hypothetical M&amp;A teaser · strictly illustrative</div>
                  <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight">
                    {A.name} <span className="text-[#9DB7F5]">to acquire</span> {T.name}
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-right text-[10.5px] text-[#9DB7F5]">
                  <div>
                    DealPulse
                    <br />
                    {date(new Date().toISOString())}
                  </div>
                  <Logo size={30} />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-4 gap-3">
                {[
                  ['Offer per share', price(r.offerPrice), `${pct(a.premium, 0)} premium`],
                  ['Equity value', money(r.equityPurchasePrice), `EV ${money(r.enterprisePurchasePrice)}`],
                  ['EV / LTM EBITDA', mult(r.multiples.evEbitda), `${mult(r.multiples.pe)} P/E`],
                  ['Year-1 EPS impact', signedPct(r.accretion), accretive ? 'Accretive' : 'Dilutive'],
                ].map(([k, v, s], i) => (
                  <div key={k} className="rounded-lg bg-white/10 px-3 py-2.5">
                    <div className="text-[9.5px] uppercase tracking-wider text-[#9DB7F5]">{k}</div>
                    <div className={`num mt-0.5 text-[20px] font-semibold ${i === 3 ? (accretive ? 'text-[#4ADE80]' : 'text-[#F87171]') : ''}`}>{v}</div>
                    <div className="text-[10px] text-[#C7D5F5]">{s}</div>
                  </div>
                ))}
              </div>
            </header>

            <div className="grid grid-cols-[1fr_1fr] gap-7 px-10 pt-6">
              <div>
                <H2>Transaction structure</H2>
                <KV
                  rows={[
                    ['Consideration', `${pct(a.cashPct, 0)} cash · ${pct(a.stockPct, 0)} stock · ${pct(a.debtPct, 0)} debt`],
                    ['Cash from balance sheet', money(r.cashUsed)],
                    [`New ${A.ticker} shares issued`, `${(r.newShares / 1e6).toFixed(0)}M (${money(r.stockIssued)})`],
                    ['New acquisition debt', `${money(r.newDebt)} @ ${pct(a.debtRate, 2)}`],
                    ['Pre-tax run-rate synergies', money(a.synergies)],
                    ...(a.transactionCosts > 0 ? ([['Change-of-control payouts (proxy)', money(a.transactionCosts)]] as [string, string][]) : []),
                    [`${T.ticker} holders’ pro-forma stake`, pct(r.ownershipTarget, 1)],
                  ]}
                />
              </div>
              <div>
                <H2>Pro-forma accretion / (dilution)</H2>
                <table className="num w-full text-[11.5px]">
                  <thead>
                    <tr className="border-b-2 border-[#0F1A33] text-right text-[9.5px] uppercase tracking-wider text-[#3F4A5A]">
                      <th className="py-1 text-left font-semibold" />
                      <th className="py-1 font-semibold">{A.ticker} standalone</th>
                      <th className="py-1 font-semibold">Pro-forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Net income', money(A.netIncome), money(r.proFormaNetIncome)],
                      ['Shares outstanding', `${(A.shares / 1e9).toFixed(3)}B`, `${(r.proFormaShares / 1e9).toFixed(3)}B`],
                      ['EPS', price(r.standaloneEps), price(r.proFormaEps)],
                      ['Debt / EBITDA', mult(r.leverage.standalone), mult(r.leverage.proForma)],
                    ].map(([k, x, y]) => (
                      <tr key={k} className="border-b border-[#E3E7ED] text-right">
                        <td className="py-1 text-left font-sans">{k}</td>
                        <td className="py-1">{x}</td>
                        <td className="py-1 font-semibold">{y}</td>
                      </tr>
                    ))}
                    <tr className="text-right">
                      <td className="py-1.5 text-left font-sans font-bold">Accretion / (dilution)</td>
                      <td />
                      <td className="py-1.5 font-bold" style={{ color: accretive ? '#16A34A' : '#DC2626' }}>
                        {signedPct(r.accretion)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-1 text-[10px] text-[#6B7689]">
                  Breakeven synergies {money(r.breakevenSynergies)} · max accretive premium {r.maxPremium === null ? 'none' : r.maxPremium >= 3 ? '>300%' : pct(r.maxPremium, 0)}
                </div>
              </div>
            </div>

            <div className="px-10 pt-5">
              <H2>Net income bridge</H2>
              <div className="rounded-lg border border-[#DFE4EB] py-1">
                <WaterfallSvg steps={waterSteps(A, T, r)} width={W - 80 - 2} theme={LIGHT} animate={false} rowHeight={36} />
              </div>
            </div>

            <div className="grid grid-cols-[1.15fr_1fr] gap-7 px-10 pt-5">
              <div>
                <H2>EPS accretion: premium vs. synergies</H2>
                <table className="num w-full border-collapse text-center text-[10.5px]">
                  <thead>
                    <tr>
                      <th />
                      {grid.cols.map((c) => (
                        <th key={c} className="bg-[#0F1A33] p-1 font-semibold text-white">
                          {money(c, 0)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((p, i) => (
                      <tr key={p}>
                        <th className="bg-[#0F1A33] p-1 font-semibold text-white">{pct(p, 0)}</th>
                        {grid.values[i].map((v, j) => (
                          <td key={j} className="border border-white p-1" style={{ background: v >= 0 ? `rgba(22,163,74,${Math.min(0.5, 0.1 + v * 5)})` : `rgba(220,38,38,${Math.min(0.5, 0.1 - v * 5)})` }}>
                            {signedPct(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <H2>Risk scorecard</H2>
                <div className="space-y-1.5">
                  {risk.map((x) => (
                    <div key={x.id} className="flex items-start gap-2 border-b border-[#E3E7ED] pb-1.5 text-[11px]">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: RAG[x.rating] }} />
                      <div>
                        <div className="font-semibold">{x.title}</div>
                        <div className="text-[#3F4A5A]">{x.headline}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <footer className="mt-auto border-t border-[#DFE4EB] px-10 py-3 text-[9px] leading-relaxed text-[#6B7689]">
              <span className="font-semibold text-[#3F4A5A]">Sources: </span>
              {live
                ? `SEC EDGAR XBRL: ${A.ticker} CIK ${A.cik}, ${T.ticker} CIK ${T.cik} (${A.ltmLabel} / ${T.ltmLabel} net income, latest balance sheets). Prices: ${A.priceSource}.`
                : 'Includes offline snapshot data rounded from 10-K filings; prices approximate.'}{' '}
              Pro-forma NI = NI(A) + NI(T) + synergies(1−t) − new debt × r(d)(1−t) − cash used × r(c)(1−t); tax rate {pct(a.taxRate, 1)}. Excludes transaction fees, purchase-price
              amortization and phase-in of synergies. Hypothetical transaction for educational purposes; not investment advice.
            </footer>
          </section>
        </ScaleToFit>
      </div>
      <DealRoomExport acquirer={A.ticker} target={T.ticker} query={dealQuery(a, defaults)} backHref={`/deals/${A.ticker}/${T.ticker}${dealQuery(a, defaults)}`}
        runId={typeof searchParams.room === 'string' ? searchParams.room : undefined}
      />
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 border-b-2 border-[#0F1A33] pb-1 text-[11px] font-bold uppercase tracking-wider text-[#0F1A33]">{children}</h3>;
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[#E3E7ED] py-1 text-[11.5px]">
          <span className="text-[#3F4A5A]">{k}</span>
          <span className="num text-right font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
