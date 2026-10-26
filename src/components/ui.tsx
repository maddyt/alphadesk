import type { ReactNode } from 'react';

export function Card({ title, subtitle, right, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-panel/80 ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/70 px-5 py-3.5">
          <div>
            {title && <h3 className="text-sm font-semibold tracking-tight text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-mute">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-mute">{label}</div>
      <div className={`num mt-1 truncate text-[17px] font-semibold ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-ink'}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'live' | 'snap' | 'neutral' | 'brand' }) {
  const cls = {
    live: 'border-mark/40 bg-mark/10 text-mark',
    snap: 'border-amber/40 bg-amber/10 text-amber',
    brand: 'border-brand/40 bg-brand/10 text-[#7FA8FF]',
    neutral: 'border-line bg-raised text-sub',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function LiveDot() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mark opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-mark" />
    </span>
  );
}

export const th = 'px-3 py-2 text-right text-[10.5px] font-medium uppercase tracking-wider text-mute first:text-left';
export const td = 'num px-3 py-1.5 text-right text-[12.5px] text-sub first:text-left first:font-sans';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0F1A33" />
      <line x1="7" x2="25" y1="9" y2="9" stroke="#64748B" strokeWidth="1.5" />
      <rect x="11" y="6.5" width="9" height="5" rx="1.5" fill="#2563EB" />
      <line x1="5" x2="22" y1="16" y2="16" stroke="#64748B" strokeWidth="1.5" />
      <rect x="9" y="13.5" width="8" height="5" rx="1.5" fill="#3B82F6" />
      <line x1="9" x2="27" y1="23" y2="23" stroke="#64748B" strokeWidth="1.5" />
      <rect x="14" y="20.5" width="9" height="5" rx="1.5" fill="#2563EB" />
      <line x1="16.5" x2="16.5" y1="4" y2="28" stroke="#10B981" strokeWidth="1.6" strokeDasharray="2.5 2" />
    </svg>
  );
}
