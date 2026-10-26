// Explicit colours for SVG charts. Charts don't read CSS variables so an exported
// SVG (and the light tear sheet) renders identically outside the page.

export interface ChartTheme {
  name: 'dark' | 'light';
  rowAlt: string;
  rowHover: string;
  grid: string;
  axis: string;
  text: string;
  sub: string;
  mute: string;
  bar: string;
  barHover: string;
  whisker: string;
  median: string;
  mark: string;
  markInk: string;
  composite: string;
  up: string;
  down: string;
  neutral: string;
}

export const DARK: ChartTheme = {
  name: 'dark',
  rowAlt: 'rgba(148,163,184,0.035)',
  rowHover: 'rgba(37,99,235,0.10)',
  grid: 'rgba(148,163,184,0.12)',
  axis: 'rgba(148,163,184,0.35)',
  text: '#E6EAF0',
  sub: '#A3ADBD',
  mute: '#6B7689',
  bar: '#2563EB',
  barHover: '#3B82F6',
  whisker: '#64748B',
  median: '#F8FAFC',
  mark: '#10B981',
  markInk: '#04120D',
  composite: '#F59E0B',
  up: '#22C55E',
  down: '#EF4444',
  neutral: '#1E2633',
};

export const LIGHT: ChartTheme = {
  name: 'light',
  rowAlt: 'rgba(15,23,42,0.03)',
  rowHover: 'rgba(37,99,235,0.08)',
  grid: 'rgba(15,23,42,0.08)',
  axis: 'rgba(15,23,42,0.35)',
  text: '#0B1220',
  sub: '#3F4A5A',
  mute: '#6B7689',
  bar: '#2563EB',
  barHover: '#1D4ED8',
  whisker: '#64748B',
  median: '#FFFFFF',
  mark: '#059669',
  markInk: '#FFFFFF',
  composite: '#D97706',
  up: '#16A34A',
  down: '#DC2626',
  neutral: '#F1F5F9',
};

/** "Nice" axis ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, target = 6): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
