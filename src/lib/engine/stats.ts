export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear-interpolated percentile, p in [0, 1]. */
export function percentile(values: number[], p: number): number {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  if (xs.length === 1) return xs[0];
  const idx = clamp(p, 0, 1) * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
}

export interface FiveNumber {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

export function fiveNumber(values: number[]): FiveNumber {
  return {
    min: percentile(values, 0),
    p25: percentile(values, 0.25),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    max: percentile(values, 1),
  };
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** OLS slope of y on x: the raw beta when x is index returns and y stock returns. */
export function slope(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my);
    varx += (x[i] - mx) ** 2;
  }
  return varx === 0 ? NaN : cov / varx;
}

/** Bisection on a monotone function. Returns x where f(x) ~= 0, or NaN if no sign change. */
export function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-7, maxIter = 200): number {
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return NaN;
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol || hi - lo < tol) return mid;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}
