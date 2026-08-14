/** Presentation helpers. Money is stored in units and displayed in millions. */
export const MM = 1e6;

export function money(v: number | null | undefined, dp = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const m = v / MM;
  const s = Math.abs(m).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return m < 0 ? `(${s})` : s;
}
export function usd(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function pct(v: number | null | undefined, dp = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(dp)}%`;
}
export function mult(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}x`;
}
export function shares(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return (v / MM).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
export const negative = (v: number | null | undefined): boolean => v !== null && v !== undefined && v < 0;
