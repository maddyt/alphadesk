import Link from 'next/link';
import { Logo } from './ui';
import { TickerSearch } from './TickerSearch';
import { AppSwitch } from './AppSwitch';

export function Nav({ search = true }: { search?: boolean }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="ValuationEngine AI home">
          <Logo size={26} />
          <span className="hidden text-[15px] font-semibold tracking-tight text-ink sm:inline">
            ValuationEngine <span className="text-[#8DB4FF]">AI</span>
          </span>
        </Link>
        <AppSwitch />
        {search && (
          <div className="ml-auto hidden w-full max-w-xs md:block">
            <TickerSearch size="sm" />
          </div>
        )}
        <Link href="/#how" className={`hidden text-xs text-mute hover:text-ink lg:block ${search ? '' : 'ml-auto'}`}>
          How it works
        </Link>
      </div>
    </header>
  );
}
