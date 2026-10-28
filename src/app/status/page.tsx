import type { Metadata } from 'next';
import { Card } from '@/components/ui';
import { health } from '@/lib/db/health';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Setup status | ValuationEngine AI' };

const Mark = ({ ok, warn }: { ok: boolean; warn?: boolean }) => <span className={ok ? 'text-up' : warn ? 'text-amber' : 'text-down'}>{ok ? '✓' : warn ? '○' : '✗'}</span>;

export default async function Status() {
  const h = await health();
  const env: [string, boolean, string, boolean?][] = [
    ['SEC_USER_AGENT', h.env.secUserAgent, 'Required for live SEC EDGAR data'],
    ['ANTHROPIC_API_KEY', h.env.anthropic, 'AI memos, golden parachutes and the AI Deal Room', true],
    ['SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY', h.env.supabase, 'Persistence: history, caches, saved deals, spend guard', true],
    ['FMP_API_KEY', h.env.marketKey, 'Optional; otherwise prices come from Yahoo Finance', true],
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8DB4FF]">Setup status</div>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{!h.env.supabase ? 'Supabase is not connected yet' : h.ok ? 'Everything is connected' : 'Some setup steps are missing'}</h1>
        <p className="mt-1 text-sm text-sub">Data mode: {h.env.dataMode}. This page shows configuration only, never keys or stored data.</p>
      </div>
      <Card title="Environment variables (Vercel → Settings → Environment Variables)">
        <ul className="space-y-2 text-[13px]">
          {env.map(([k, ok, why, optional]) => (
            <li key={k} className="flex gap-2">
              <Mark ok={ok} warn={optional} />
              <span>
                <code className="text-ink">{k}</code> <span className="text-mute">· {why}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Supabase tables" subtitle="Created by supabase/setup.sql. Row counts are estimates.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <tbody>
              {h.tables.map((t) => (
                <tr key={t.name} className="border-b border-line/50">
                  <td className="w-10 py-2 pl-5 pr-2">
                    <Mark ok={t.ok} />
                  </td>
                  <td className="py-2 pr-3">
                    <code className="text-ink">{t.name}</code>
                    <div className="text-[11.5px] text-mute">{t.purpose}</div>
                  </td>
                  <td className="num py-2 pr-5 text-right text-sub">{t.ok ? `${t.rows?.toLocaleString()} ${t.rows === 1 ? 'row' : 'rows'}` : <span className="text-[12px] text-down">{t.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="AI spend guard" subtitle="Claude calls stop for the day once the budget is reached. Change the limits with the environment variables shown.">
        <dl className="num grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
          {[
            ['Spent today', h.ai.spentTodayUsd === null ? 'n/a' : `$${h.ai.spentTodayUsd.toFixed(2)}`],
            ['Last 7 days', h.ai.spent7dUsd === null ? 'n/a' : `$${h.ai.spent7dUsd.toFixed(2)}`],
            ['Daily budget (AI_DAILY_BUDGET_USD)', h.ai.dailyBudgetUsd > 0 ? `$${h.ai.dailyBudgetUsd}` : 'off'],
            ['Deal Room runs / visitor / day', h.ai.roomRunsPerIpPerDay > 0 ? String(h.ai.roomRunsPerIpPerDay) : 'off'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-sans text-[10.5px] uppercase tracking-wider text-mute">{k}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
