import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'AlphaDesk — transparent equity valuation',
  description: 'Three-statement forecasting, triangulated intrinsic value, and honest data-quality auditing.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b-2 border-navy bg-surface">
          <div className="max-w-[1400px] mx-auto px-5 py-3 flex items-baseline gap-6">
            <Link href="/" className="font-serif text-xl font-semibold text-navy">AlphaDesk</Link>
            <nav className="flex gap-4 text-[13px] text-muted">
              <Link href="/" className="hover:text-accent">Coverage</Link>
              <Link href="/audit" className="hover:text-accent">Data quality</Link>
            </nav>
            <span className="ml-auto text-[11px] text-muted italic">
              Analyst work product — every figure traceable, every model flagged. Not investment advice.
            </span>
          </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-5 py-6">{children}</main>
      </body>
    </html>
  );
}
