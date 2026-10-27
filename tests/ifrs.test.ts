import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanyFacts, type CompanyFactsJson } from '../src/lib/sec/xbrl.ts';
import { adrRatio, toAdrShares, toUsd } from '../src/lib/deals/foreign.ts';
import { toDealCompany } from '../src/lib/deals/engine.ts';
import { snapshotMarket } from '../src/lib/data/snapshot.ts';

// A trimmed 20-F filer reporting under IFRS in TWD (TSMC-style).
const fy = (tag: string, val: number, end = '2024-12-31', start = '2024-01-01') => ({ start, end, val, accn: 'a-25', filed: '2025-04-10', form: '20-F', fy: 2024, fp: 'FY', tag });
const inst = (val: number, end = '2024-12-31') => ({ end, val, accn: 'a-25', filed: '2025-04-10', form: '20-F', fy: 2024, fp: 'FY' });
const json: CompanyFactsJson = {
  cik: 1046179,
  entityName: 'Taiwan Semiconductor Manufacturing Co Ltd',
  facts: {
    dei: { EntityCommonStockSharesOutstanding: { units: { shares: [inst(25_000)] } } },
    'ifrs-full': {
      Revenue: { units: { TWD: [fy('Revenue', 2_000), fy('Revenue', 1_600, '2023-12-31', '2023-01-01')] } },
      ProfitLossFromOperatingActivities: { units: { TWD: [fy('x', 900)] } },
      ProfitLossAttributableToOwnersOfParent: { units: { TWD: [fy('x', 800)] } },
      DepreciationAndAmortisationExpense: { units: { TWD: [fy('x', 300)] } },
      PaymentsOfLeaseLiabilitiesClassifiedAsFinancingActivities: { units: { TWD: [fy('x', 20)] } },
      CashAndCashEquivalents: { units: { TWD: [inst(1_500)] } },
      Borrowings: { units: { TWD: [inst(400)] } },
      LeaseLiabilities: { units: { TWD: [inst(150)] } },
      Assets: { units: { TWD: [inst(6_000)] } },
      EquityAndLiabilities: { units: { TWD: [inst(6_000)] } },
      AdjustedWeightedAverageShares: { units: { shares: [fy('x', 25_000)] } },
    },
  },
};

test('IFRS 20-F parsing: ifrs-full tags, reporting currency, annual-only', () => {
  const c = parseCompanyFacts(json, 'TSM');
  assert.equal(c.accounting.standard, 'IFRS');
  assert.equal(c.accounting.currency, 'TWD');
  assert.equal(c.accounting.annualForm, '20-F');
  assert.deepEqual(c.years.map((y) => [y.label, y.items.revenue?.value]), [['FY2023', 1600], ['FY2024', 2000]]);
  const last = c.years[1].items;
  assert.equal(last.ebit?.value, 900);
  assert.equal(last.netIncome?.value, 800);
  assert.equal(last.leasePayments?.value, 20);
  assert.equal(c.ltm.label, 'FY2024 (annual)');
  assert.equal(c.balance.items.debt?.value, 400, 'borrowings exclude IFRS 16 lease liabilities');
  assert.equal(c.balance.items.leaseLiabilities?.value, 150);
});

test('USD conversion keeps share counts and ADR ratio converts ordinary shares', () => {
  const raw = { ...parseCompanyFacts(json, 'TSM'), sic: '3674', sicDescription: 'Semiconductors', source: 'sec-live' as const, fetchedAt: '' };
  const usd = toUsd(raw, { rate: 0.03, asOf: '2026-10-27', source: 'test' });
  assert.ok(Math.abs(usd.years[1].items.revenue!.value - 60) < 1e-9);
  assert.equal(usd.years[1].items.revenue!.facts[0].value, 2000, 'audit facts stay in TWD');
  assert.equal(usd.balance.items.sharesOutstanding!.value, 25_000);
  assert.equal(usd.accounting?.fx?.rate, 0.03);
  assert.deepEqual(adrRatio('TSM'), { ratio: 5, known: true });
  const adr = toAdrShares(usd, 5);
  assert.equal(adr.balance.items.sharesOutstanding!.value, 5_000);
  const d = toDealCompany(adr, { ...snapshotMarket('AAPL')!, price: 10 });
  assert.equal(d.marketCap, 50_000, 'ADR price x ADR-equivalent shares');
});

test('US GAAP 10-K payloads are unaffected', () => {
  const g = parseCompanyFacts({ cik: 1, entityName: 'X', facts: { 'us-gaap': { Revenues: { units: { USD: [{ ...fy('x', 10), form: '10-K' }] } } } } }, 'X');
  assert.equal(g.accounting.standard, 'US GAAP');
  assert.equal(g.accounting.currency, 'USD');
});

test('cross-border deal: IFRS target in EUR, lease-adjusted EBITDA, merger-control note', async () => {
  const { snapshotCompany } = await import('../src/lib/data/snapshot.ts');
  const { defaultDealAssumptions, riskScorecard, runDeal } = await import('../src/lib/deals/engine.ts');
  const asml = toDealCompany(toUsd(snapshotCompany('ASML')!, { rate: 1.08, asOf: 'test', source: 'test' }), snapshotMarket('ASML')!);
  assert.equal(asml.accounting.standard, 'IFRS');
  assert.ok(asml.accounting.foreign);
  assert.ok(Math.abs(asml.revenue - 28263e6 * 1.08) < 1);
  assert.ok(Math.abs(asml.leaseAdjustment - 90e6 * 1.08) < 1);
  assert.ok(Math.abs(asml.ebitda - (asml.ebitdaReported - asml.leaseAdjustment)) < 1);
  assert.ok(Math.abs(asml.marketCap - 662.62 * 393.3e6) < 1e3, 'ADR price x shares (1:1)');
  const nvda = toDealCompany(snapshotCompany('NVDA')!, snapshotMarket('NVDA')!);
  assert.equal(nvda.accounting.foreign, false);
  const a = defaultDealAssumptions(nvda, asml);
  const r = runDeal(nvda, asml, a);
  assert.ok(Number.isFinite(r.accretion));
  assert.ok(riskScorecard(nvda, asml, a, r)[0].detail.includes('foreign merger-control'));
  assert.ok(riskScorecard(asml, nvda, a, runDeal(asml, nvda, a))[0].detail.includes('CFIUS'));
});
