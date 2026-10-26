// Market data: share price, trailing 52-week distribution, and a regression beta.
// Sources are tried in order: FMP (if FMP_API_KEY is set), Yahoo Finance chart
// API. Callers fall back to the bundled snapshot.

import type { MarketData } from '../types.ts';
import { clamp, percentile, slope } from '../engine/stats.ts';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (ValuationEngine AI)' };

interface ChartSeries {
  price: number;
  timestamps: number[];
  closes: number[];
}

async function yahooChart(symbol: string, range: string, interval: string): Promise<ChartSeries> {
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const j = await res.json();
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error('Yahoo: empty chart');
  const ts: number[] = r.timestamp ?? [];
  const raw: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const timestamps: number[] = [];
  const closes: number[] = [];
  raw.forEach((c, i) => {
    if (c != null && Number.isFinite(c)) {
      timestamps.push(ts[i]);
      closes.push(c);
    }
  });
  return { price: r.meta?.regularMarketPrice ?? closes[closes.length - 1], timestamps, closes };
}

function weeklyReturns(s: ChartSeries): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < s.closes.length; i++) {
    const week = Math.floor(s.timestamps[i] / (7 * 86400));
    out.set(week, s.closes[i] / s.closes[i - 1] - 1);
  }
  return out;
}

/** 2-year weekly regression vs the S&P 500, Blume-adjusted (0.67 x raw + 0.33). */
async function regressionBeta(symbol: string): Promise<number> {
  const [stock, index] = await Promise.all([yahooChart(symbol, '2y', '1wk'), yahooChart('^GSPC', '2y', '1wk')]);
  const rs = weeklyReturns(stock);
  const ri = weeklyReturns(index);
  const x: number[] = [];
  const y: number[] = [];
  for (const [w, r] of rs) {
    const m = ri.get(w);
    if (m !== undefined) {
      x.push(m);
      y.push(r);
    }
  }
  const raw = slope(x, y);
  if (!Number.isFinite(raw)) throw new Error('beta: insufficient overlap');
  return clamp(0.67 * raw + 0.33, 0.5, 2.5);
}

function fromCloses(price: number, closes: number[], beta: number, betaSource: string, source: string): MarketData {
  return {
    price,
    asOf: new Date().toISOString(),
    low52: Math.min(...closes),
    high52: Math.max(...closes),
    p25: percentile(closes, 0.25),
    median: percentile(closes, 0.5),
    p75: percentile(closes, 0.75),
    closes: downsample(closes, 60),
    beta,
    betaSource,
    source,
  };
}

function downsample(xs: number[], n: number): number[] {
  if (xs.length <= n) return xs;
  return Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
}

async function fmpQuote(symbol: string, key: string): Promise<MarketData> {
  const base = 'https://financialmodelingprep.com/stable';
  const [q, hist] = await Promise.all([
    fetch(`${base}/quote?symbol=${symbol}&apikey=${key}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`${base}/historical-price-eod/light?symbol=${symbol}&apikey=${key}`, { cache: 'no-store' }).then((r) => r.json()),
  ]);
  const quote = Array.isArray(q) ? q[0] : null;
  if (!quote?.price) throw new Error('FMP: no quote');
  const yearAgo = Date.now() - 365 * 86400_000;
  const closes: number[] = (Array.isArray(hist) ? hist : [])
    .filter((h: { date: string }) => Date.parse(h.date) >= yearAgo)
    .map((h: { price?: number; close?: number }) => h.price ?? h.close)
    .filter((c: unknown): c is number => typeof c === 'number')
    .reverse();
  const series = closes.length > 20 ? closes : [quote.yearLow, quote.price, quote.yearHigh];
  return fromCloses(quote.price, series, 1, 'default', 'Financial Modeling Prep');
}

async function betaOr(symbol: string, fallback?: number): Promise<{ beta: number; betaSource: string }> {
  try {
    return { beta: await regressionBeta(symbol), betaSource: '2Y weekly vs S&P 500 (Blume-adjusted)' };
  } catch {
    return fallback ? { beta: fallback, betaSource: 'Snapshot estimate' } : { beta: 1, betaSource: 'Market default (1.00)' };
  }
}

export async function fetchMarketData(ticker: string, fallbackBeta?: number): Promise<MarketData> {
  const yahooSymbol = ticker.replace('.', '-');
  const fmpKey = process.env.FMP_API_KEY;
  if (fmpKey) {
    try {
      const m = await fmpQuote(ticker, fmpKey);
      return { ...m, ...(await betaOr(yahooSymbol, fallbackBeta)) };
    } catch {
      /* fall through to Yahoo */
    }
  }
  const chart = await yahooChart(yahooSymbol, '1y', '1d');
  const { beta, betaSource } = await betaOr(yahooSymbol, fallbackBeta);
  return fromCloses(chart.price, chart.closes, beta, betaSource, 'Yahoo Finance');
}

/** Latest price only (used for peers, where the 52-week distribution and beta are not needed). */
export async function fetchPrice(ticker: string): Promise<number> {
  const chart = await yahooChart(ticker.replace('.', '-'), '5d', '1d');
  if (!(chart.price > 0)) throw new Error(`No price for ${ticker}`);
  return chart.price;
}
