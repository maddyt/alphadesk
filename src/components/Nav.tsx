import Link from 'next/link';
import { Logo } from './ui';
import { TickerSearch } from './TickerSearch';

export function Nav({ search = true }: { search?: boolean }) {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo size={26} />
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            ValuationEngine <span className="text-[#8DB4FF]">AI</span>
          </span>
        </Link>
        {search && (
          <div className="ml-auto w-full max-w-xs">
            <TickerSearch size="sm" />
          </div>
        )}
        <Link href="/#how" className={`hidden text-xs text-mute hover:text-ink md:block ${search ? '' : 'ml-auto'}`}>
          How it works
        </Link>
      </div>
    </header>
  );
}
