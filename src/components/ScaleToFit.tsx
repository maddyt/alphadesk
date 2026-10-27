'use client';

import { useEffect, useRef, useState } from 'react';

/** Shrinks a fixed-size printable page to the screen width on phones; print output is untouched. */
export function ScaleToFit({ width, height, children, className = '' }: { width: number; height: number; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={`fit-wrap w-full ${className}`} style={{ height: height * scale }}>
      <div className="fit-inner origin-top-left" style={{ width, transform: scale < 1 ? `scale(${scale})` : undefined }}>
        {children}
      </div>
    </div>
  );
}
