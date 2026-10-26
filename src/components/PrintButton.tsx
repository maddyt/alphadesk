'use client';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#0F1A33] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1D2B4F]">
      Print / Save as PDF
    </button>
  );
}
