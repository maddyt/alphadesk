'use client';

import { useMemo } from 'react';
import { FootballFieldSvg } from './charts/FootballFieldSvg';
import { DARK } from './charts/theme';
import { useWidth } from './charts/useWidth';
import { snapshotDataset } from '@/lib/data/snapshot';
import { buildBaseInputs, defaultAssumptions, evToPrice } from '@/lib/engine/model';
import { runValuation } from '@/lib/engine/valuation';

/** Home-page example chart; measures its container so it stays legible on phones. */
export function HeroField() {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const data = useMemo(() => {
    const ds = snapshotDataset('AAPL');
    if (!ds) return null;
    const b = buildBaseInputs(ds);
    const run = runValuation(b, defaultAssumptions(b));
    const rows = run.ranges.map((r) => ({ range: r, min: evToPrice(b, r.min), p25: evToPrice(b, r.p25), median: evToPrice(b, r.median), p75: evToPrice(b, r.p75), max: evToPrice(b, r.max) }));
    return { rows, price: b.price, composite: run.compositePrice };
  }, []);
  if (!data) return null;
  return (
    <div ref={ref}>
      <FootballFieldSvg
        rows={data.rows}
        current={data.price}
        currentLabel="AAPL"
        composite={data.composite}
        width={width}
        theme={DARK}
        format={(v) => `$${v.toFixed(0)}`}
        axisFormat={(v) => `$${v.toFixed(0)}`}
      />
    </div>
  );
}
