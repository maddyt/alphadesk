import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/PrintButton';
import { ScaleToFit } from '@/components/ScaleToFit';
import { CapitalGauge, ScatterSvg } from '@/components/banks/BankCharts';
import { LIGHT } from '@/components/charts/theme';
import { Logo } from '@/components/ui';
import { TickerNotFoundError } from '@/lib/data/dataset';
import { bankRun, NotABankError } from '@/lib/banks/data';
import { bankQuery, readBankOverrides } from '@/lib/banks/params';
import { date, money, mult, pct, price, signedPct } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Props = { params: { ticker: string }; searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ params }: Props): Metadata {
  return { title: `${decodeURIComponent(params.ticker).toUpperCase()} FIG valuation summary | BankVal AI` };
}

// US Letter portrait at 96 dpi.
const W = 816;
const H = 1056;
const NAVY = '#0F1A33';

export default async function BankSummary({ params, searchParams }: Props) {
  let d;
  try {
    d = await bankRun(params.ticker, readBankOverrides(searchParams));
  } catch (e) {
    if (e instanceof TickerNotFoundError || e instanceof NotABankError) notFound();
    throw e;
  }
  const { run, a, defaults, bank, basis } = d;
  const { i, reg, ddm, grid, stack, stress } = run;
  const live = bank.fin.source === 'sec-live';
  const t = reg.points.find((p) => p.isTarget);
  const flag = t?.flag === 'premium' ? 'Premium to returns' : t?.flag === 'discount' ? 'Discount to returns' : 'In line with returns';

  return (
    <div className="theme-light min-h-screen bg-[#E9EDF2] px-3 py-6 print:bg-white print:p-0">
      <style>{'@media print { @page { size: 8.5in 11in; margin: 0; } }'}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[816px] flex-wrap items-center justify-between gap-3">
        <Link href={`/banks/${i.ticker}${bankQuery(a, defaults)}`} className="text-sm text-[#1D4ED8] hover:underline">
          ← Back to model
        </Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[816px]">
        <ScaleToFit width={W} height={H}>
          <section className="page flex flex-col bg-white text-[#0B1220] shadow-xl" style={{ width: W, height: H }}>
            <header className="px-10 pb-5 pt-6 text-white" style={{ background: NAVY }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#FCD34D]">FIG valuation summary · P/TBV vs. ROATCE · 3-stage DDM</div>
                  <h1 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight">
                    {i.name} <span className="text-[#9DB7F5]">({i.ticker})</span>
                  </h1>
                </div>
                <div className="flex items-center gap-2 text-right text-[10.5px] text-[#9DB7F5]">
                  <div>
                    BankVal AI
                    <br />
                    {date(new Date().toISOString())}
                  </div>
                  <Logo size={30} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-5 gap-2.5">
                {[
                  ['Price / TBVPS', `${price(i.price)} / ${price(i.tbvps)}`, `${mult(i.ptbv, 2)} P/TBV`],
                  ['ROATCE', pct(i.roatce), bank.fin.fyLabel],
                  ['CET1 ratio', pct(i.cet1Ratio), i.capitalEstimated ? 'estimated' : `min ${pct(stack.requirement.cet1)}`],
                  ['Regression value', price(reg.impliedPrice), signedPct(reg.impliedPrice / i.price - 1)],
                  ['DDM value', price(ddm.perShare), signedPct(ddm.perShare / i.price - 1)],
                ].map(([k, v, s]) => (
                  <div key={k} className="rounded-lg bg-white/10 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-[#9DB7F5]">{k}</div>
                    <div className="num mt-0.5 text-[16px] font-semibold">{v}</div>
                    <div className="text-[10px] text-[#C7D5F5]">{s}</div>
                  </div>
                ))}
              </div>
            </header>

            <div className="px-10 pt-5">
              <H2 right={`P/TBV = ${reg.fit.alpha.toFixed(2)} + ${reg.fit.beta.toFixed(2)} × ROATCE · R² ${reg.fit.r2.toFixed(2)} · n = ${reg.fit.n} · ${i.ticker}: ${flag}`}>Price / tangible book vs. ROATCE</H2>
              <ScatterSvg reg={reg} roatce={a.roatce} theme={LIGHT} width={736} height={300} interactive={false} />
            </div>

            <div className="grid grid-cols-[1.1fr_1fr] gap-7 px-10 pt-4">
              <div>
                <H2>DDM sensitivity: value per share</H2>
                <table className="num w-full border-collapse text-center text-[10.5px]">
                  <thead>
                    <tr>
                      <th className="p-1 text-[9px] font-semibold text-[#6B7689]">Ke \ CET1</th>
                      {grid.cols.map((c) => (
                        <th key={c} className="p-1 font-semibold text-white" style={{ background: NAVY }}>
                          {pct(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map((ke, r) => (
                      <tr key={ke}>
                        <th className="p-1 font-semibold text-white" style={{ background: NAVY }}>
                          {pct(ke, 2)}
                        </th>
                        {grid.values[r].map((v, c) => {
                          const up = v / i.price - 1;
                          const cur = Math.abs(ke - a.ke) < 1e-6 && Math.abs(grid.cols[c] - a.targetCet1) < 1e-6;
                          return (
                            <td key={c} className="border border-white p-1" style={{ background: up >= 0 ? `rgba(22,163,74,${Math.min(0.45, 0.08 + up)})` : `rgba(220,38,38,${Math.min(0.45, 0.08 - up)})`, outline: cur ? '2px solid #D97706' : undefined }}>
                              {price(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1.5 text-[9.5px] leading-snug text-[#6B7689]">
                  Stage 1: {pct(a.loanGrowth)} loan growth for 5 years · stage 2 fades to {pct(a.terminalGrowth)} · Gordon terminal. Dividend capacity = NI − (RWA × target CET1 − prior CET1).
                  Terminal value is {pct(ddm.pvTerminal / ddm.equityValue, 0)} of value.
                </div>
              </div>
              <div>
                <H2>Capital adequacy (Basel III)</H2>
                <CapitalGauge s={stack} target={a.targetCet1} after={stress.cet1RatioAfter} theme={LIGHT} width={340} height={140} />
                <KV
                  rows={[
                    ['CET1 / Tier 1 / Total', `${pct(i.cet1Ratio)} / ${pct(i.tier1Ratio)} / ${pct(i.totalCapitalRatio)}`],
                    [stack.injectionToTarget > 0 ? `Capital needed for ${pct(a.targetCet1)} CET1` : `Excess CET1 over ${pct(a.targetCet1)}`, money(stack.injectionToTarget > 0 ? stack.injectionToTarget : stack.excessToTarget)],
                    ['TCE / tangible assets', pct(i.tceRatio, 2)],
                    ['NPLs / loans · reserves', i.nplRatio !== null ? `${pct(i.nplRatio, 2)} · ${i.aclRatio !== null ? pct(i.aclRatio, 2) : '—'}` : '—'],
                    ['Efficiency · NII / assets', `${i.efficiency !== null ? pct(i.efficiency, 0) : '—'} · ${i.nim !== null ? pct(i.nim, 2) : '—'}`],
                    [`Stress: +${a.rateShockBps} bps, ${pct(a.outflowPct, 0)} outflow`, `CET1 → ${pct(stress.cet1RatioAfter, 1)}${stress.shortfall > 0 ? ` · gap ${money(stress.shortfall)}` : ''}`],
                  ]}
                />
              </div>
            </div>

            <footer className="mt-auto border-t border-[#DFE4EB] px-10 py-3 text-[9px] leading-relaxed text-[#6B7689]">
              <span className="font-semibold text-[#3F4A5A]">Sources: </span>
              {live ? `SEC EDGAR XBRL, ${i.ticker} CIK ${i.cik} (${bank.fin.fyLabel} earnings, balance sheet ${bank.fin.balanceLabel}). Price: ${bank.market.source}.` : 'Offline snapshot rounded from FY2024 10-K filings; prices approximate.'}{' '}
              Peers: {basis}. TCE = common equity − goodwill − intangibles; ROATCE = NI to common ÷ average TCE. Ke {pct(a.ke, 2)} (CAPM: risk-free + β × {pct(0.05)} ERP).
              {i.capitalEstimated ? ' Regulatory capital estimated where the consolidated XBRL omits it.' : ''} Educational analysis; not investment advice.
            </footer>
          </section>
        </ScaleToFit>
      </div>
    </div>
  );
}

function H2({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <h3 className="mb-2 flex items-baseline justify-between gap-3 border-b-2 pb-1 text-[11px] font-bold uppercase tracking-wider" style={{ borderColor: NAVY, color: NAVY }}>
      <span className="shrink-0">{children}</span>
      {right && <span className="num truncate text-[9.5px] font-semibold normal-case tracking-normal text-[#3F4A5A]">{right}</span>}
    </h3>
  );
}

function KV({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mt-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[#E3E7ED] py-1 text-[10.5px]">
          <span className="text-[#3F4A5A]">{k}</span>
          <span className="num text-right font-medium">{v}</span>
        </div>
      ))}
    </div>
  );
}
