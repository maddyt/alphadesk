import 'server-only';
import { getFinancials, normalizeTicker, TickerNotFoundError } from '../data/dataset.ts';
import { snapshotCompany, snapshotMarket } from '../data/snapshot.ts';
import { fetchMarketData } from '../market/quote.ts';
import { toDealCompany, type DealCompany } from './engine.ts';

/** One side of a deal: SEC financials plus a market price, without the peer set the valuation app needs. */
export async function getDealCompany(raw: string): Promise<{ company: DealCompany; warnings: string[] }> {
  const ticker = normalizeTicker(raw);
  const snapC = snapshotCompany(ticker);
  const snapM = snapshotMarket(ticker);
  if (process.env.DATA_MODE === 'snapshot') {
    if (!snapC || !snapM) throw new TickerNotFoundError(`${ticker} is not in the offline snapshot (DATA_MODE=snapshot)`);
    return { company: toDealCompany(snapC, snapM), warnings: [`${ticker}: offline snapshot, approximate figures.`] };
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
    return { company: toDealCompany(fin, market), warnings };
  } catch (e) {
    if (e instanceof TickerNotFoundError) throw e;
    if (snapC && snapM) {
      return { company: toDealCompany(snapC, snapM), warnings: [`${ticker}: live SEC fetch failed (${(e as Error).message}); showing the offline snapshot.`] };
    }
    throw e;
  }
}

export async function getDealPair(acquirer: string, target: string) {
  if (normalizeTicker(acquirer) === normalizeTicker(target)) throw new TickerNotFoundError('Acquirer and target must be different companies');
  const [A, T] = await Promise.all([getDealCompany(acquirer), getDealCompany(target)]);
  return { A: A.company, T: T.company, warnings: [...A.warnings, ...T.warnings] };
}
