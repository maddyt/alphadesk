import Link from 'next/link';
import { loadLatestValuations, loadOpenFlags } from '@/lib/supabase/queries';
import { pct } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface FlagRow { code: string; severity: string; message: string; fiscal_year: number | null; companies?: { ticker: string; company_name: string; sector: string | null } }

const EXPLAIN: Record<string, string> = {
  BALANCE_GAP: 'The vendor’s own reported balance sheet does not satisfy Assets = Liabilities + Equity. No client-side formula can fix this; it needs an ingestion-side correction or a better source.',
  EXTREME_RESULT: 'The model lands more than 2x away from the market price. Usually the assumptions are wrong, not the market.',
  METHOD_DISAGREEMENT: 'The three valuation routes disagree by more than 35%. Any single figure is indicative only.',
  TV_CONCENTRATION: 'Most of the value sits beyond the forecast horizon, so the answer is mostly an assumption about the far future.',
  FINANCIAL_SECTOR: 'Banks and insurers have no meaningful capital expenditure, so a cash-flow DCF misprices them by construction. Residual income is the anchor.',
  ZERO_INTEREST_WITH_DEBT: 'Interest expense is reported as zero despite material debt — a reporting gap, excluded from rate calibration.',
  THIN_HISTORY: 'Too few reported years to calibrate a forecast or run a backtest.',
  NO_TERMINAL: 'Terminal-year cash flow to equity is negative, so that route cannot produce a value at all.',
  NEGATIVE_COGS: 'Gross profit exceeds revenue in a reported year, forcing cost of revenue negative. Excluded from COGS ratios.',
  WACC_BAND: 'The computed WACC is implausible, which points at the capital-structure inputs.',
  NB_CLAMP: 'Net borrowing was capped by the cash-flow-based bound.',
  NB_TERMINAL_CLAMP: 'The terminal-year debt schedule wanted to outgrow the business and was capped.',
  VALUATION_FAILED: 'The engine could not value this company at all.',
  NO_PRICE: 'No market price, so margin of safety cannot be computed.',
  NO_SHARES: 'No share count, so per-share values cannot be computed.',
  YEAR_GAP: 'Missing fiscal years in the reported history.',
};

export default async function AuditPage() {
  let flags: FlagRow[] = [];
  let valuations: Record<string, unknown>[] = [];
  let error: string | null = null;
  try {
    [flags, valuations] = await Promise.all([
      loadOpenFlags() as unknown as Promise<FlagRow[]>,
      loadLatestValuations() as unknown as Promise<Record<string, unknown>[]>,
    ]);
  } catch (e) { error = e instanceof Error ? e.message : String(e); }

  if (error) return <div className="card text-[13px]">Supabase not reachable: <code className="text-neg">{error}</code></div>;

  const byCode = new Map<string, FlagRow[]>();
  for (const f of flags) { const l = byCode.get(f.code) ?? []; l.push(f); byCode.set(f.code, l); }
  const ordered = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length);
  const companies = new Set(flags.map((f) => f.companies?.ticker).filter(Boolean)).size;
  const warns = flags.filter((f) => f.severity === 'warn').length;
  const disagree = valuations.filter((v) => typeof v.method_spread === 'number' && (v.method_spread as number) > 0.35).length;
  const tvHeavy = valuations.filter((v) => typeof v.tv_share_ev === 'number' && (v.tv_share_ev as number) > 0.8).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl text-navy">Data quality</h1>
        <p className="text-[13px] text-muted max-w-3xl">
          Every check the portal runs, and everything currently failing one. This page exists because a valuation
          portal that hides its own data problems is worse than no portal — it produces confident numbers on broken
          inputs.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat k="Open findings" v={String(flags.length)} f={`${warns} warnings`} />
        <Stat k="Companies affected" v={String(companies)} />
        <Stat k="Methods disagree >35%" v={String(disagree)} f={`of ${valuations.length} valued`} />
        <Stat k="Terminal value >80% of EV" v={String(tvHeavy)} f="assumption-dominated" />
      </div>

      {ordered.map(([code, rows]) => (
        <section key={code} className="space-y-1">
          <h2 className="font-serif text-lg text-navy">
            {code.replace(/_/g, ' ').toLowerCase()} <span className="text-muted text-[13px]">· {rows.length}</span>
          </h2>
          {EXPLAIN[code] && <p className="text-[12.5px] text-muted max-w-4xl">{EXPLAIN[code]}</p>}
          <div className="scroller max-h-72 overflow-y-auto">
            <table className="tbl">
              <thead><tr><th className="li">Company</th><th>FY</th><th className="li">Detail</th></tr></thead>
              <tbody>
                {rows.slice(0, 60).map((f, i) => (
                  <tr key={i}>
                    <td className="li">
                      {f.companies?.ticker
                        ? <Link href={`/ticker/${f.companies.ticker}`} className="text-accent font-semibold">{f.companies.ticker}</Link>
                        : '—'}
                    </td>
                    <td className="num">{f.fiscal_year ?? '—'}</td>
                    <td className="li !text-left whitespace-normal max-w-[70ch] text-[12px]">{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {!flags.length && <div className="card text-[13px]">No open findings. Either the data is clean or ingestion has not run.</div>}
    </div>
  );
}

function Stat({ k, v, f }: { k: string; v: string; f?: string }) {
  return <div className="card"><div className="stat-k">{k}</div><div className="stat-v">{v}</div>{f && <div className="text-[11px] text-muted">{f}</div>}</div>;
}
