'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppSwitch() {
  const path = usePathname() ?? '/';
  const app = path.startsWith('/deals') ? 'deals' : path.startsWith('/banks') ? 'banks' : 'valuation';
  const item = (active: boolean) => `rounded-lg px-2 py-1.5 text-[12px] font-medium transition sm:px-3 ${active ? 'bg-raised text-ink ring-1 ring-line' : 'text-mute hover:text-sub'}`;
  return (
    <nav className="flex shrink-0 rounded-xl border border-line bg-panel/60 p-0.5" aria-label="Apps">
      <Link href="/" className={item(app === 'valuation')}>
        Valuation
      </Link>
      <Link href="/deals" className={item(app === 'deals')}>
        M&amp;A<span className="hidden sm:inline"> Deals</span>
      </Link>
      <Link href="/banks" className={item(app === 'banks')}>
        Banks
      </Link>
    </nav>
  );
}
