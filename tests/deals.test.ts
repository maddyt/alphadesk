import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotCompany, snapshotMarket } from '../src/lib/data/snapshot.ts';
import { defaultDealAssumptions, gridPremiumSynergies, riskScorecard, runDeal, setMix, toDealCompany, type DealAssumptions, type DealCompany } from '../src/lib/deals/engine.ts';
import { dealQuery, readDealOverrides, resolveDeal } from '../src/lib/deals/params.ts';

const close = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const co = (t: string) => toDealCompany(snapshotCompany(t)!, snapshotMarket(t)!);

// Hand-checkable toy deal.
const acq: DealCompany = { ...co('DIS'), price: 50, shares: 100, dilutedShares: 100, marketCap: 5000, netIncome: 500, eps: 5 };
const tgt: DealCompany = { ...co('EA'), price: 20, shares: 50, dilutedShares: 50, marketCap: 1000, netIncome: 80, eps: 1.6 };
const base: DealAssumptions = { premium: 0.3, cashPct: 0.2, stockPct: 0.5, debtPct: 0.3, synergies: 40, debtRate: 0.06, cashRate: 0.04, taxRate: 0.25, transactionCosts: 0 };

test('PRD section 4 formulas, step by step', () => {
  const r = runDeal(acq, tgt, base);
  const PE = 1000 * 1.3;
  assert.ok(close(r.equityPurchasePrice, PE));
  assert.ok(close(r.afterTaxInterest, PE * 0.3 * 0.06 * 0.75));
  assert.ok(close(r.foregoneInterest, PE * 0.2 * 0.04 * 0.75));
  assert.ok(close(r.afterTaxSynergies, 40 * 0.75));
  const ni = 500 + 80 + 30 - PE * 0.3 * 0.06 * 0.75 - PE * 0.2 * 0.04 * 0.75;
  assert.ok(close(r.proFormaNetIncome, ni));
  const shares = 100 + (PE * 0.5) / 50;
  assert.ok(close(r.proFormaShares, shares));
  assert.ok(close(r.accretion, (ni / shares - 5) / 5));
});

test('breakeven synergies give exactly zero accretion', () => {
  const r = runDeal(acq, tgt, base);
  const b = runDeal(acq, tgt, { ...base, synergies: r.breakevenSynergies });
  assert.ok(Math.abs(b.accretion) < 1e-9);
});

test('max premium is the accretion breakeven', () => {
  const r = runDeal(acq, tgt, { ...base, synergies: 200 });
  assert.ok(r.maxPremium !== null && r.maxPremium > 0);
  assert.ok(Math.abs(runDeal(acq, tgt, { ...base, synergies: 200, premium: r.maxPremium! }).accretion) < 1e-5);
});

test('financing mix always sums to 100%', () => {
  for (const [k, v] of [['cashPct', 0.7], ['stockPct', 0], ['debtPct', 1], ['cashPct', 0]] as const) {
    const m = setMix(base, k, v);
    assert.ok(close(m.cashPct + m.stockPct + m.debtPct, 1, 1e-6));
    assert.ok(close(m[k], v));
  }
  const r = resolveDeal(base, { cashPct: 1, stockPct: 1, debtPct: 2 }, 1e9);
  assert.ok(close(r.cashPct + r.stockPct + r.debtPct, 1));
});

test('URL round-trip', () => {
  const a = { ...base, premium: 0.45, synergies: 25e6 };
  const q = Object.fromEntries(new URLSearchParams(dealQuery(a, base).slice(1)));
  const back = resolveDeal(base, readDealOverrides(q), 1e9);
  assert.ok(close(back.premium, 0.45) && close(back.synergies, 25e6));
});

test('snapshot pair produces a sane teardown and scorecard', () => {
  const A = co('DIS');
  const T = co('EA');
  const a = defaultDealAssumptions(A, T);
  const r = runDeal(A, T, a);
  assert.ok(r.equityPurchasePrice > T.marketCap);
  assert.ok(Number.isFinite(r.accretion));
  const risk = riskScorecard(A, T, a, r);
  assert.deepEqual(risk.map((x) => x.id), ['antitrust', 'credit', 'integration', 'eps']);
  const g = gridPremiumSynergies(A, T, a, 1e9);
  assert.ok(g.values[0][4] > g.values[4][0], 'cheaper and more synergies is more accretive');
});

test('PRD v2: diluted-share EPS, transaction costs, Treasury-based debt rate, governance scorecard', () => {
  const A = { ...acq, dilutedShares: 110 };
  const r = runDeal(A, tgt, base);
  assert.ok(close(r.standaloneEps, 500 / 110), 'EPS uses diluted shares');
  const withCosts = runDeal(acq, tgt, { ...base, transactionCosts: 100 });
  assert.ok(close(withCosts.totalUses, 1300 + 100));
  assert.ok(close(withCosts.newDebt, 1400 * 0.3));
  assert.ok(withCosts.accretion < runDeal(acq, tgt, base).accretion, 'costs are dilutive');
  const d = defaultDealAssumptions(co('DIS'), co('EA'), 0.042);
  assert.ok(d.debtRate > 0.042 && d.debtRate <= 0.042 + 0.035 + 1e-9);
  const risk = riskScorecard(acq, tgt, base, r, { targetGovernance: { rating: 'red', flags: ['8-K Item 4.02'] }, activist: 'Activist LP' });
  const g = risk.find((x) => x.id === 'governance')!;
  assert.equal(g.rating, 'red');
  assert.ok(g.detail.includes('Activist LP'));
  assert.equal(riskScorecard(acq, tgt, base, r, { productOverlap: 0.6 })[0].headline.includes('product overlap'), true);
});

test('segment overlap: geography mix and product-line matching', async () => {
  const { geoOverlap, productOverlap } = await import('../src/lib/deals/overlap.ts');
  const bd = (axis: 'product' | 'geography', rows: [string, number][]) => ({ axis, axisQName: 'x', lines: rows.map(([label, value]) => ({ member: label, label, value })), total: rows.reduce((s, r) => s + r[1], 0), reconciles: true });
  const g1 = bd('geography', [['United States', 60], ['Europe', 40]]);
  const g2 = bd('geography', [['Americas', 60], ['EMEA', 40]]);
  assert.ok(Math.abs(geoOverlap(g1, g2)! - 1) < 1e-9);
  assert.ok(Math.abs(geoOverlap(g1, bd('geography', [['Japan', 100]]))!) < 1e-9);
  const p = productOverlap(bd('product', [['Gaming', 30], ['Streaming', 70]]), bd('product', [['Mobile games', 50], ['Console gaming', 50]]))!;
  assert.equal(p.share, 0.5);
  assert.deepEqual(p.matches, ['Console gaming']);
});
