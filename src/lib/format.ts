export function money(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—';
  const s = x < 0 ? '-' : '';
  const a = Math.abs(x);
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(digits + 1)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(digits)}M`;
  return `${s}$${a.toFixed(0)}`;
}

/** USD millions with thousands separators, the way a model's tables print. */
export function mm(x: number | undefined): string {
  if (x === undefined || !Number.isFinite(x)) return '—';
  const v = x / 1e6;
  const body = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return v < 0 ? `(${body})` : body;
}

export function price(x: number): string {
  if (!Number.isFinite(x)) return '—';
  return `${x < 0 ? '-' : ''}$${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pct(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—';
}

export function signedPct(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%` : '—';
}

export function mult(x: number, digits = 1): string {
  return Number.isFinite(x) ? `${x.toFixed(digits)}x` : '—';
}

export function shares(x: number): string {
  return `${(x / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
