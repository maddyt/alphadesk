import type { ScenarioResult } from '@/lib/engine/types';
import { money, pct, usd } from '@/lib/format';

export function Triangulation({ r }: { r: ScenarioResult }) {
  const cards = [
    { k: 'Market price', v: usd(r.price), f: 'what you pay today', hi: false },
    { k: '① FCFE @ cost of equity', v: r.fcfe.terminalOk ? usd(r.fcfe.perShare) : '—', f: r.fcfe.marginOfSafety !== null ? `MoS ${r.fcfe.marginOfSafety.toFixed(1)}%` : 'no valid terminal value', hi: !r.diagnostics.isFinancial },
    { k: '② FCFF @ WACC → EV − net debt', v: r.fcff?.ok ? usd(r.fcff.perShare) : '—', f: r.fcff?.marginOfSafety != null ? `MoS ${r.fcff.marginOfSafety.toFixed(1)}%` : 'not computable', hi: false },
    { k: '③ Residual income', v: r.residualIncome ? usd(r.residualIncome.perShare) : '—', f: r.diagnostics.isFinancial ? 'preferred for financials' : 'book value + excess returns', hi: r.diagnostics.isFinancial },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.k} className={`card ${c.hi ? 'border-l-4 border-l-accent' : ''}`}>
            <div className="stat-k">{c.k}</div>
            <div className="stat-v">{c.v}</div>
            <div className="text-[11px] text-muted">{c.f}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat k="Cost of equity" v={pct(r.costOfEquity, 2)} />
        <Stat k="WACC" v={r.fcff?.ok ? pct(r.fcff.wacc, 2) : '—'} />
        <Stat k="Terminal value share (EV)" v={r.fcff?.tvShare != null ? pct(r.fcff.tvShare, 0) : '—'} f="lower is sturdier" />
        <Stat k="Method disagreement" v={r.diagnostics.spread != null ? pct(r.diagnostics.spread, 0) : '—'} f="max spread across ①②③" />
        <Stat k="P/E now vs at value" v={`${r.diagnostics.peCurrent?.toFixed(1) ?? '—'} / ${r.diagnostics.peAtIV?.toFixed(1) ?? '—'}`} />
      </div>
      {r.fcff?.ok && (
        <div className="card">
          <div className="stat-k mb-2">Enterprise-value bridge ($mm)</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[13px] font-mono">
            <Bridge k="PV of unlevered FCF" v={money(r.fcff.pvOperating)} />
            <Bridge k="PV of terminal value" v={money(r.fcff.pvTerminal)} />
            <Bridge k="Enterprise value" v={money(r.fcff.enterpriseValue)} strong />
            <Bridge k="Less: net debt" v={money(-r.fcff.netDebt)} />
            <Bridge k="Equity value" v={money(r.fcff.equityValue)} strong />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, f }: { k: string; v: string; f?: string }) {
  return (
    <div className="card">
      <div className="stat-k">{k}</div>
      <div className="font-mono text-base font-bold tabular-nums">{v}</div>
      {f && <div className="text-[11px] text-muted">{f}</div>}
    </div>
  );
}
function Bridge({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <div className="stat-k">{k}</div>
      <div className={strong ? 'font-bold' : ''}>{v}</div>
    </div>
  );
}
