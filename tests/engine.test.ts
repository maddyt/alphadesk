import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotDataset, SNAPSHOT_TICKERS } from '../src/lib/data/snapshot.ts';
import { buildBaseInputs, dcf, defaultAssumptions, evToPrice, priceToEv, waccBuild } from '../src/lib/engine/model.ts';
import { runLbo, solveLboFloor } from '../src/lib/engine/lbo.ts';
import { METHODOLOGIES, runValuation, sensitivityWaccGrowth } from '../src/lib/engine/valuation.ts';
import { fiveNumber, percentile } from '../src/lib/engine/stats.ts';
import { ValuationOutputSchema } from '../src/lib/schema.ts';

const close = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

function setup(t = 'AAPL') {
  const ds = snapshotDataset(t)!;
  const b = buildBaseInputs(ds);
  const a = defaultAssumptions(b);
  return { ds, b, a };
}

test('percentile interpolates linearly', () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([10, 20], 0.25), 12.5);
  assert.deepEqual(fiveNumber([4, 1, 3, 2, 5]), { min: 1, p25: 2, median: 3, p75: 4, max: 5 });
});

test('WACC follows CAPM and market-value weights', () => {
  const { b } = setup();
  const w = waccBuild(b, 0.04, 0.05, 0.2);
  assert.ok(close(w.costOfEquity, 0.04 + b.beta * 0.05));
  assert.ok(close(w.weightEquity + w.weightDebt, 1));
  assert.ok(close(w.wacc, w.weightEquity * w.costOfEquity + w.weightDebt * w.preTaxKd * 0.8));
});

test('DCF: FCFF = EBIT(1-t) + D&A - CapEx - dNWC, and EV = sum PV + PV(TV)', () => {
  const { b, a } = setup();
  const r = dcf(b, a);
  for (const y of r.years) {
    assert.ok(close(y.fcff, y.ebit * (1 - a.taxRate) + y.da - y.capex - y.dNwc));
  }
  const pv = r.years.reduce((s, y, i) => s + y.fcff / (1 + a.wacc) ** (i + 1), 0);
  assert.ok(close(r.sumPvFcff, pv));
  const last = r.years[4];
  const tv = (last.fcff * (1 + a.terminalGrowth)) / (a.wacc - a.terminalGrowth);
  assert.ok(close(r.evGordon, pv + tv / (1 + a.wacc) ** 5));
  assert.ok(close(r.evExit, pv + (last.ebitda * a.exitMultiple) / (1 + a.wacc) ** 5));
  // Final-year growth lands on the terminal growth rate.
  assert.ok(close(last.growth, a.terminalGrowth));
});

test('DCF EV falls as WACC rises', () => {
  const { b, a } = setup('MSFT');
  assert.ok(dcf(b, a, 0.07).evGordon > dcf(b, a, 0.09).evGordon);
  assert.ok(dcf(b, a, 0.07).evExit > dcf(b, a, 0.09).evExit);
});

test('EV <-> price bridge round-trips', () => {
  const { b } = setup('DIS');
  assert.ok(close(evToPrice(b, priceToEv(b, 123.45)), 123.45));
  assert.ok(close(b.currentEV, b.price * b.shares + b.debt - b.cash - b.securities));
});

test('LBO floor solves to the target IRR', () => {
  const { b, a } = setup('COST');
  const r = solveLboFloor(b, a)!;
  assert.ok(r, 'solver converged');
  assert.ok(Math.abs(r.irr - a.lboTargetIrr) < 1e-4);
  assert.ok(close(r.moic, r.exitEquity / r.sponsorEquity));
  // Paying more lowers returns.
  assert.ok(runLbo(b, a, r.entryMultiple + 2).irr < r.irr);
  // Debt never goes negative and pays down monotonically under a full sweep.
  let prev = r.debt;
  for (const y of r.years) {
    assert.ok(y.endingDebt >= 0 && y.endingDebt <= prev + 1e-6);
    prev = y.endingDebt;
  }
});

test('all five methodologies produce ordered ranges for every snapshot ticker', () => {
  for (const t of SNAPSHOT_TICKERS) {
    const { b, a } = setup(t);
    const run = runValuation(b, a);
    assert.deepEqual(
      run.ranges.map((r) => r.methodology),
      [...METHODOLOGIES],
      `${t} methodologies`,
    );
    for (const r of run.ranges) {
      assert.ok(r.min <= r.p25 && r.p25 <= r.median && r.median <= r.p75 && r.p75 <= r.max, `${t} ${r.methodology} ordered`);
      assert.ok(r.min > 0, `${t} ${r.methodology} positive`);
    }
    assert.ok(run.axis.min <= run.currentEV && run.currentEV <= run.axis.max);
  }
});

test('raising the control premium raises precedent values', () => {
  const { b, a } = setup('KO');
  const lo = runValuation(b, { ...a, controlPremium: 0.15 }).ranges.find((r) => r.methodology === 'Precedent Transactions')!;
  const hi = runValuation(b, { ...a, controlPremium: 0.3 }).ranges.find((r) => r.methodology === 'Precedent Transactions')!;
  assert.ok(hi.median > lo.median);
});

test('sensitivity grid is centred on the base case', () => {
  const { b, a } = setup('NVDA');
  const g = sensitivityWaccGrowth(b, a);
  assert.ok(close(g.values[2][2], evToPrice(b, dcf(b, a).evGordon)));
  assert.ok(g.values[0][2] > g.values[4][2], 'lower WACC, higher value');
});

test('output conforms to the PRD Zod schema', () => {
  const { b, a } = setup();
  const run = runValuation(b, a);
  const out = ValuationOutputSchema.parse({
    ticker: b.ticker,
    currentSharePrice: b.price,
    enterpriseValue: run.currentEV,
    valuationRanges: run.ranges.map((r) => ({
      methodology: r.methodology,
      minEV: r.min,
      twentyFifthEV: r.p25,
      medianEV: r.median,
      seventyFifthEV: r.p75,
      maxEV: r.max,
    })),
  });
  assert.equal(out.valuationRanges.length, 5);
  assert.throws(() => ValuationOutputSchema.parse({ ...out, currentSharePrice: -1 }));
});

test('memo verifier accepts engine figures and flags invented ones', async () => {
  const { buildFactSheet, verifyNumbers } = await import('../src/lib/ai/facts.ts');
  const { b, a } = setup('AAPL');
  const run = runValuation(b, a);
  const facts = buildFactSheet(b, a, run, waccBuild(b, a.riskFree, a.erp, a.taxRate));
  const wacc = facts.find((f) => f.id === 'wacc')!.display;
  const px = facts.find((f) => f.id === 'price')!.display;
  const checks = verifyNumbers(`Shares trade at ${px}.\nThe ${wacc} WACC and a fictional 37.9x multiple. Trading in 2024 over 5 years.`, facts);
  assert.deepEqual(
    checks.map((c) => [c.token, c.verified]),
    [
      [px, true],
      [wacc, true],
      ['37.9x', false],
    ],
  );
});
