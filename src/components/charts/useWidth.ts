'use client';
import { useEffect, useRef, useState } from 'react';

/** Tracks an element's content width so SVG charts render at true pixel size (crisp text). */
export function useWidth<T extends HTMLElement>(initial = 960) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
