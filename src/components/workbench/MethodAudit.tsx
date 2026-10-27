'use client';

import { useEffect } from 'react';
import type { Assumptions, BaseInputs } from '@/lib/engine/model';
import type { MethodRange, SotpInput } from '@/lib/engine/valuation';
import type { Dataset, Fact, Intel, LineItem } from '@/lib/types';
import { filingUrl } from '@/lib/sec/links';
import { date, money, mult, pct, price } from '@/lib/format';

interface Input {
  label: string;
  value: string;
  item?: LineItem;
  note?: string;
}

/** PRD v2 section 6: clicking a football-field bar opens its source audit, down to SEC accession numbers. */
export function MethodAuditModal({
  range,
  ds,
  b,
  a,
  intel,
  sotp,
  onClose,
  onOpenTab,
}: {
  range: MethodRange;
  ds: Dataset;
  b: BaseInputs;
  a: Assumptions;
  intel: Intel | null;
  sotp: SotpInput | null;
  onClose: () => void;
  onOpenTab: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const c = ds.company;
  const ltm = c.ltm.items;
  const fy = c.years[c.years.length - 1].items;
  const bal = c.balance.items;
  const bridge: Input[] = [
    { label: 'Shares outstanding', value: `${(b.shares / 1e9).toFixed(3)}B`, item: bal.sharesOutstanding },
    { label: 'Total debt', value: money(b.debt), item: bal.debt },
    { label: 'Cash & equivalents', value: money(b.cash), item: bal.cash },
    { label: 'Short-term investments', value: money(b.securities), item: bal.securities },
  ];
  const ebitda: Input[] = [
    { label: `${b.ltmLabel} revenue`, value: money(b.ltmRevenue), item: ltm.revenue },
    { label: `${b.ltmLabel} operating income`, value: money(ltm.ebit?.value ?? NaN), item: ltm.ebit },
    { label: 'Restructuring & impairment add-back', value: money(ltm.impairment?.value ?? 0), item: ltm.impairment },
    { label: `${b.ltmLabel} D&A`, value: money(ltm.da?.value ?? NaN), item: ltm.da },
  ];
  const rf: Input = {
    label: 'Risk-free rate',
    value: pct(a.riskFree, 2),
    note: ds.macro?.date ? `${ds.macro.source}, 10Y as of ${date(ds.macro.date)}` : (ds.macro?.source ?? 'Static default'),
  };

  let derivation = '';
  let inputs: Input[] = [];
  let extra: React.ReactNode = null;
  switch (range.methodology) {
    case '52-Week Range':
      derivation = 'EV = closing price × shares outstanding + total debt − cash − short-term investments, for the low, quartiles and high of trailing-year closes.';
      inputs = [{ label: 'Current price', value: price(b.price), note: `${ds.market.source}` }, { label: '52-week low / high', value: `${price(b.market52.low)} / ${price(b.market52.high)}` }, ...bridge];
      break;
    case 'Public Comps (EV/EBITDA & EV/Revenue)':
      derivation = `Peer EV/EBITDA and EV/revenue (25th, median, 75th percentile, min and max) × the target's ${b.ltmLabel} EBITDA and revenue. EBITDA = operating income + restructuring & impairment + D&A.`;
      inputs = ebitda;
      extra = <Peers ds={ds} />;
      break;
    case 'Precedent Transactions':
      derivation = `Peer EV/EBITDA (25th-75th percentile) × (1 + control premium of ${pct(a.controlPremium - 0.075, 1)}-${pct(a.controlPremium + 0.075, 1)}) × ${b.ltmLabel} EBITDA${a.cocCost > 0 ? ', less change-of-control payouts' : ''}.`;
      inputs = [...ebitda, { label: 'Control premium (center)', value: pct(a.controlPremium) }, ...(a.cocCost > 0 ? [{ label: 'Change-of-control payouts (DEF 14A)', value: money(a.cocCost) }] : [])];
      extra = <Peers ds={ds} />;
      break;
    case 'Discounted Cash Flow':
      derivation = 'EV = Σ FCFFₜ ÷ (1+WACC)ᵗ + TV ÷ (1+WACC)⁵, where FCFF = EBIT(1−t) + D&A − CapEx − ΔNWC and Ke = Rf + β × ERP. Range: WACC ±1% × perpetuity growth ±0.5% and exit multiple ±1x.';
      inputs = [
        { label: `${c.years[c.years.length - 1].label} revenue (base year)`, value: money(b.revenue0), item: fy.revenue },
        { label: 'Operating income', value: money(fy.ebit?.value ?? NaN), item: fy.ebit },
        { label: 'D&A', value: money(b.da0), item: fy.da },
        { label: 'Capital expenditures', value: money(b.capex0), item: fy.capex },
        { label: 'Income tax expense', value: money(fy.taxExpense?.value ?? NaN), item: fy.taxExpense },
        rf,
        { label: 'Beta', value: b.beta.toFixed(2), note: ds.market.betaSource },
        { label: 'Equity risk premium', value: pct(a.erp, 2), note: 'Kroll recommended U.S. ERP' },
        { label: 'WACC applied', value: pct(a.wacc, 2) },
        ...bridge,
      ];
      break;
    case 'LBO Floor Valuation':
      derivation = `Highest entry price at which a sponsor funding ${pct(a.lboLeverage, 0)} of the price with debt at ${pct(a.lboInterestRate, 2)} earns a ${pct(a.lboTargetIrr, 0)} IRR over 5 years with a full cash sweep, exiting at ${mult(a.exitMultiple)} EBITDA. Range: debt ${pct(a.lboLeverage - 0.05, 0)}-${pct(a.lboLeverage + 0.05, 0)} × exit ±1x.`;
      inputs = [...ebitda, ...(a.cocCost > 0 ? [{ label: 'Change-of-control payouts (extra use of funds)', value: money(a.cocCost) }] : [])];
      break;
    case 'Sum-of-the-Parts':
      derivation = 'EV = Σ segment revenue × segment EV/revenue multiple; the bar flexes every multiple by ±20%. Segment revenue is parsed from the dimensional XBRL in the latest 10-K (not available in the companyfacts API).';
      inputs = (sotp?.lines ?? []).map((l) => ({ label: l.label, value: `${money(l.revenue)} × ${mult(l.multiple)} = ${money(l.revenue * l.multiple)}` }));
      extra = intel?.segments?.accessionNumber ? (
        <p className="text-[12px] text-sub">
          Source: 10-K filed {date(intel.segments.filingDate)}, accession{' '}
          <a className="num text-mark hover:underline" href={filingUrl(c.cik, intel.segments.accessionNumber)} target="_blank" rel="noreferrer">
            {intel.segments.accessionNumber} ↗
          </a>
          , XBRL axis {sotp?.axisLabel}.
        </p>
      ) : (
        <p className="text-[12px] text-amber">Offline snapshot: segment revenue rounded from the 10-K notes; no accession available.</p>
      );
      break;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Source audit">
      <div className="max-h-[92vh] w-full max-w-3xl animate-fadeup overflow-y-auto rounded-t-2xl border border-line bg-panel shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-line bg-panel px-5 py-4 sm:px-6">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mark">Source audit</div>
            <h3 className="mt-1 text-lg font-semibold text-ink">{range.methodology}</h3>
            <div className="num mt-0.5 text-xs text-sub">
              EV {money(range.min)} – {money(range.max)} · median {money(range.median)}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-mute hover:bg-raised hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-[13px] leading-relaxed text-sub">
            <span className="font-semibold text-ink">Derivation: </span>
            {derivation}
          </div>
          <div className="space-y-2">
            {inputs.map((i) => (
              <InputRow key={i.label} input={i} cik={c.cik} live={c.source === 'sec-live'} />
            ))}
          </div>
          {extra}
          <button type="button" onClick={onOpenTab} className="text-xs font-medium text-[#8DB4FF] hover:underline">
            Open the full build →
          </button>
        </div>
      </div>
    </div>
  );
}

function InputRow({ input, cik, live }: { input: Input; cik: string; live: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-raised/30 px-3.5 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink">{input.label}</span>
        <span className="num text-[13px] font-semibold text-ink">{input.value}</span>
      </div>
      {input.note && <div className="mt-0.5 text-[11px] text-mute">{input.note}</div>}
      {input.item?.formula && <div className="mt-0.5 text-[11px] text-amber">{input.item.formula}</div>}
      {input.item?.facts.map((f, k) => <FactLine key={k} f={f} cik={cik} live={live} />)}
    </div>
  );
}

function FactLine({ f, cik, live }: { f: Fact; cik: string; live: boolean }) {
  return (
    <div className="num mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10.5px] text-mute">
      <span className="text-[#8DB4FF]">
        {f.weight === -1 ? '− ' : ''}
        {f.taxonomy}:{f.tag}
      </span>
      <span>{f.start ? `${f.start} → ${f.end}` : `@ ${f.end}`}</span>
      <span>{f.form}</span>
      {f.accn && live ? (
        <a href={filingUrl(cik, f.accn)} target="_blank" rel="noreferrer" className="text-mark hover:underline">
          accn {f.accn} ↗
        </a>
      ) : (
        <span>accn: live fetch only</span>
      )}
    </div>
  );
}

function Peers({ ds }: { ds: Dataset }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-mute">Peer set · {ds.peerBasis}</div>
      <div className="flex flex-wrap gap-1.5">
        {ds.peers.map((p) => (
          <span key={p.ticker} className="num rounded-md border border-line bg-raised/40 px-2 py-1 text-[11px] text-sub">
            {p.ticker} {mult(p.evEbitda)} EBITDA{p.evRevenue ? ` · ${mult(p.evRevenue)} rev` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
