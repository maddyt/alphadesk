'use client';

import { useEffect, useState } from 'react';
import type { CompanyFinancials, LineItem, LineKey, Period } from '@/lib/types';
import { companyFilingsUrl, conceptUrl, filingUrl } from '@/lib/sec/links';
import { date, mm, shares } from '@/lib/format';
import { Badge, Card, td, th } from '../ui';
import { checkBalance } from '@/lib/schema';

const ROWS: { key: LineKey; section?: string }[] = [
  { key: 'revenue', section: 'Income statement' },
  { key: 'ebit' },
  { key: 'impairment' },
  { key: 'da' },
  { key: 'interestExpense' },
  { key: 'pretax' },
  { key: 'taxExpense' },
  { key: 'netIncome' },
  { key: 'capex', section: 'Cash flow' },
  { key: 'cash', section: 'Balance sheet' },
  { key: 'securities' },
  { key: 'ar' },
  { key: 'inventory' },
  { key: 'ap' },
  { key: 'debt' },
  { key: 'assetsCurrent' },
  { key: 'assets' },
  { key: 'liabilitiesCurrent' },
  { key: 'liabilities' },
  { key: 'equity' },
  { key: 'liabilitiesAndEquity' },
  { key: 'sharesOutstanding', section: 'Shares' },
  { key: 'sharesDiluted' },
];

interface Selected {
  item: LineItem;
  period: string;
}

export function FinancialsTab({ company }: { company: CompanyFinancials }) {
  const [sel, setSel] = useState<Selected | null>(null);
  const cols: { period: Period; kind: 'fy' | 'ltm' | 'bal' }[] = [
    ...company.years.map((p) => ({ period: p, kind: 'fy' as const })),
    ...(company.ltm.end !== company.years[company.years.length - 1]?.end ? [{ period: company.ltm, kind: 'ltm' as const }] : []),
    ...(company.balance.end !== company.years[company.years.length - 1]?.end ? [{ period: company.balance, kind: 'bal' as const }] : []),
  ];
  const live = company.source === 'sec-live';
  const bal = checkBalance(company.balance.items);

  return (
    <>
      <Card
        title="Historical financials from SEC EDGAR XBRL"
        subtitle="USD millions. Click any figure to inspect its XBRL tag, filing and accession number."
        right={
          <div className="flex items-center gap-2">
            {bal.checked && (
              <Badge tone={bal.ties ? 'live' : 'snap'}>
                <span title={`Zod-validated: assets ${mm(bal.assets)} vs liabilities + equity ${mm(bal.liabilitiesAndEquity)} ($M)`}>{bal.ties ? '✓ Balance sheet ties' : '⚠ Balance sheet gap'}</span>
              </Badge>
            )}
            <Badge tone={live ? 'live' : 'snap'}>{live ? `CIK ${company.cik}` : 'Offline snapshot'}</Badge>
            <a href={companyFilingsUrl(company.cik)} target="_blank" rel="noreferrer" className="text-xs text-[#8DB4FF] hover:underline">
              EDGAR filings ↗
            </a>
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>Line item</th>
                {cols.map((c) => (
                  <th key={c.period.label} className={`${th} ${c.kind !== 'fy' ? 'text-[#8DB4FF]' : ''}`}>
                    {c.kind === 'bal' ? `Latest ${c.period.label.replace('Balance sheet ', '')}` : c.period.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ key, section }) => {
                const anyValue = cols.some((c) => c.period.items[key]);
                if (!anyValue) return null;
                return [
                  section ? (
                    <tr key={`s-${section}`}>
                      <td colSpan={cols.length + 1} className="px-3 pb-1 pt-4 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-mute">
                        {section}
                      </td>
                    </tr>
                  ) : null,
                  <tr key={key} className="border-b border-line/40 hover:bg-raised/40">
                    <td className={`${td} text-ink`}>{labelOf(cols, key)}</td>
                    {cols.map((c) => {
                      const it = c.period.items[key];
                      const isBalance = INSTANT.has(key) || key === 'sharesOutstanding';
                      const show = c.kind === 'ltm' ? !isBalance : c.kind === 'bal' ? isBalance : true;
                      if (!it || !show) return <td key={c.period.label} className={`${td} text-mute/50`}>—</td>;
                      return (
                        <td key={c.period.label} className={td}>
                          <button
                            type="button"
                            onClick={() => setSel({ item: it, period: c.period.label })}
                            className="rounded px-1 py-0.5 text-sub underline decoration-line decoration-dotted underline-offset-4 transition hover:bg-brand/15 hover:text-ink hover:decoration-brand"
                          >
                            {key.startsWith('shares') ? shares(it.value) : mm(it.value)}
                            {it.formula && <sup className="ml-0.5 text-amber">•</sup>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-mute">
          <span className="text-amber">•</span> derived from more than one XBRL fact (e.g. LTM = FY + YTD − prior YTD, or total debt = current + non-current + commercial paper).
        </p>
      </Card>
      {sel && <AuditModal cik={company.cik} live={live} sel={sel} onClose={() => setSel(null)} />}
    </>
  );
}

const INSTANT = new Set<LineKey>(['cash', 'securities', 'ar', 'inventory', 'ap', 'debt', 'assets', 'assetsCurrent', 'liabilitiesCurrent', 'liabilities', 'equity', 'liabilitiesAndEquity']);

function labelOf(cols: { period: Period }[], key: LineKey) {
  for (const c of cols) if (c.period.items[key]) return c.period.items[key]!.label;
  return key;
}

export function AuditModal({ cik, live, sel, onClose }: { cik: string; live: boolean; sel: Selected; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const { item } = sel;
  const isShares = item.key.startsWith('shares');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="SEC audit trail">
      <div className="max-h-[90vh] w-full max-w-3xl animate-fadeup overflow-y-auto rounded-2xl border border-line bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mark">SEC audit trail</div>
            <h3 className="mt-1 text-lg font-semibold text-ink">
              {item.label} <span className="text-mute">· {sel.period}</span>
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-mute hover:bg-raised hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider text-mute">Value used by the engine</div>
              <div className="num mt-1 text-3xl font-semibold text-ink">
                {isShares ? shares(item.value) : `$${mm(item.value)}M`}
              </div>
            </div>
            {item.formula && (
              <div className="rounded-lg border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
                <span className="font-semibold">Derived:</span> {item.formula}
              </div>
            )}
          </div>

          {!live && (
            <div className="rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-amber">
              Offline snapshot: tags and periods are shown, but accession numbers are only displayed when they come from a live SEC EDGAR response.
            </div>
          )}

          {item.facts.map((f, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-raised/60 px-4 py-2.5">
                <code className="num text-[12.5px] text-[#8DB4FF]">
                  {f.taxonomy}:{f.tag}
                </code>
                {f.weight === -1 && <Badge tone="snap">subtracted</Badge>}
              </div>
              <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-[12.5px] sm:grid-cols-3">
                <Field k="Reported value" v={isShares ? shares(f.value) : f.unit === 'USD' ? `$${mm(f.value)}M` : `${f.unit} ${mm(f.value)}M`} />
                <Field k="Period" v={f.start ? `${date(f.start)} – ${date(f.end)}` : `As of ${date(f.end)}`} />
                <Field k="Form" v={f.form ?? '—'} />
                <Field k="Fiscal year / period" v={f.fy ? `FY${f.fy} ${f.fp ?? ''}` : '—'} />
                <Field k="Filed" v={date(f.filed)} />
                <Field
                  k="Accession ID"
                  v={
                    f.accn ? (
                      <a href={filingUrl(cik, f.accn)} target="_blank" rel="noreferrer" className="text-mark hover:underline">
                        {f.accn} ↗
                      </a>
                    ) : (
                      <span className="text-mute">live fetch only</span>
                    )
                  }
                />
              </dl>
              {live && (
                <div className="flex gap-4 border-t border-line/60 px-4 py-2 text-[11px]">
                  <a href={conceptUrl(cik, f.taxonomy, f.tag)} target="_blank" rel="noreferrer" className="text-[#8DB4FF] hover:underline">
                    Full tag history (companyconcept JSON) ↗
                  </a>
                  {f.accn && (
                    <a href={filingUrl(cik, f.accn)} target="_blank" rel="noreferrer" className="text-[#8DB4FF] hover:underline">
                      Filing index on EDGAR ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="font-sans text-[10.5px] uppercase tracking-wider text-mute">{k}</dt>
      <dd className="mt-0.5 text-ink">{v}</dd>
    </div>
  );
}
