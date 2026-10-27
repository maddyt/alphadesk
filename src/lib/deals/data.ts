import 'server-only';
import { getFinancials, normalizeTicker, TickerNotFoundError } from '../data/dataset.ts';
import { snapshotCompany, snapshotMarket } from '../data/snapshot.ts';
import { fetchMarketData } from '../market/quote.ts';
import { toDealCompany, type DealCompany } from './engine.ts';
import { adrRatio, toAdrShares, toUsd } from './foreign.ts';
import { getUsdRate } from '../market/fx.ts';
import { SNAPSHOT_FX } from '../data/snapshot.ts';
import type { CompanyFinancials } from '../types.ts';

/** Foreign filers: statements to USD at spot, ordinary shares to ADR-equivalents (PRD: cross-border M&A). */
async function normalizeForeign(fin: CompanyFinancials, warnings: string[], offline = false): Promise<CompanyFinancials> {
  const acc = fin.accounting;
  if (!acc) return fin;
  let out = fin;
  if (acc.currency !== 'USD') {
    const rate = offline
      ? SNAPSHOT_FX[acc.currency] && { rate: SNAPSHOT_FX[acc.currency], asOf: 'snapshot', source: 'Snapshot rate (approximate)' }
      : await getUsdRate(acc.currency).catch(() => (SNAPSHOT_FX[acc.currency] ? { rate: SNAPSHOT_FX[acc.currency], asOf: 'snapshot', source: 'Snapshot rate (live FX unavailable)' } : null));
    if (!rate) throw new Error(`${fin.ticker} reports in ${acc.currency} and no FX rate to USD is available`);
    out = toUsd(out, rate);
    warnings.push(`${fin.ticker} reports under ${acc.standard} in ${acc.currency} (${acc.annualForm}); converted to USD at ${rate.rate.toFixed(4)} USD/${acc.currency} (${rate.source}${rate.asOf ? `, ${rate.asOf}` : ''}). Spot rate applied to all periods.`);
  }
  if (acc.annualForm !== '10-K') {
    const { ratio, known } = adrRatio(fin.ticker);
    out = toAdrShares(out, ratio);
    if (ratio !== 1) warnings.push(`${fin.ticker}: SEC share counts are ordinary shares; converted at ${ratio} ordinary shares per US-listed ADR.`);
    if (!known) warnings.push(`${fin.ticker}: ADR ratio not in our table, assumed 1:1. Check the depositary ratio if market cap looks off.`);
    if (acc.standard === 'IFRS') warnings.push(`${fin.ticker}: IFRS 20-F filers have no tagged quarterly data, so figures are from the latest annual report. EBITDA is adjusted for IFRS 16 leases to compare with US GAAP.`);
  }
  return out;
}

/** One side of a deal: SEC financials plus a market price, without the peer set the valuation app needs. */
export async function getDealCompany(raw: string): Promise<{ company: DealCompany; warnings: string[] }> {
  const ticker = normalizeTicker(raw);
  const snapC = snapshotCompany(ticker);
  const snapM = snapshotMarket(ticker);
  if (process.env.DATA_MODE === 'snapshot') {
    if (!snapC || !snapM) throw new TickerNotFoundError(`${ticker} is not in the offline snapshot (DATA_MODE=snapshot)`);
    const w = [`${ticker}: offline snapshot, approximate figures.`];
    return { company: toDealCompany(await normalizeForeign(snapC, w, true), snapM), warnings: w };
  }
  const warnings: string[] = [];
  try {
    const fin = await getFinancials(ticker);
    let market;
    try {
      market = await fetchMarketData(ticker, snapM?.beta);
    } catch (e) {
      if (!snapM) throw new Error(`Market data unavailable for ${ticker}: ${(e as Error).message}`);
      market = snapM;
      warnings.push(`${ticker}: live price unavailable, using approximate snapshot price as of ${snapM.asOf}.`);
    }
    return { company: toDealCompany(await normalizeForeign(fin, warnings), market), warnings };
  } catch (e) {
    if (e instanceof TickerNotFoundError) throw e;
    if (snapC && snapM) {
      const w = [`${ticker}: live SEC fetch failed (${(e as Error).message}); showing the offline snapshot.`];
      return { company: toDealCompany(await normalizeForeign(snapC, w, true), snapM), warnings: w };
    }
    throw e;
  }
}

export async function getDealPair(acquirer: string, target: string) {
  if (normalizeTicker(acquirer) === normalizeTicker(target)) throw new TickerNotFoundError('Acquirer and target must be different companies');
  const [A, T] = await Promise.all([getDealCompany(acquirer), getDealCompany(target)]);
  return { A: A.company, T: T.company, warnings: [...A.warnings, ...T.warnings] };
}
