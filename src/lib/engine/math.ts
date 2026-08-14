/** Numeric helpers. Weighted averages bias recent observations: weight = bias^index. */

export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export function safeDiv(n: number | null | undefined, d: number | null | undefined, def: number | null = null): number | null {
  if (n === null || n === undefined || d === null || d === undefined || d === 0) return def;
  return n / d;
}

export function weightedAvg(values: (number | null | undefined)[], bias = 2.0): number | null {
  let numr = 0, den = 0;
  values.forEach((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) { const w = Math.pow(bias, i); numr += w * v; den += w; }
  });
  return den ? numr / den : null;
}

export function clamp(v: number | null, lo: number, hi: number): number | null {
  if (v === null) return null;
  return Math.max(lo, Math.min(hi, v));
}

export function yoyGrowthRates(values: (number | null | undefined)[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < values.length; i++) {
    const a = values[i - 1], b = values[i];
    out.push(a !== null && a !== undefined && b !== null && b !== undefined && a !== 0 ? (b - a) / Math.abs(a) : null);
  }
  return out;
}

export function stableRatio(values: (number | null | undefined)[], denoms: (number | null | undefined)[], def: number, bias = 1.5): number {
  const ratios: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const r = safeDiv(values[i] as number, denoms[i] as number);
    if (r !== null) ratios.push(r);
  }
  if (!ratios.length) return def;
  return weightedAvg(ratios, bias) ?? def;
}

export const mean = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export function stdev(a: number[]): number | null {
  if (a.length < 2) return null;
  const m = mean(a)!;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
}

export function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Box-Muller standard normal. `rand` is injectable so simulations are reproducible in tests. */
export function randNormal(rand: () => number = Math.random): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Deterministic PRNG (mulberry32) for reproducible Monte Carlo runs. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
