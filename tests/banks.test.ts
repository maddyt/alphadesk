import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK_SNAPSHOT_TICKERS, snapshotBank, snapshotBankMarket } from '../src/lib/banks/snapshot.ts';
import { bankInputs, capitalStack, ddm, defaultBankAssumptions, ols, regression, stressTest, type BankInputs } from '../src/lib/banks/engine.ts';
import { parseBankFacts } from '../src/lib/banks/xbrl.ts';

const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const bank = (t: string) => bankInputs({ fin: snapshotBank(t)!, market: snapshotBankMarket(t)! });

test('PRD 4.1: TCE, TBVPS and ROATCE', () => {
  const j = bank('JPM');
  assert.ok(close(j.tce, (324.7 - 52.6 - 1.4) * 1e9));
  assert.ok(close(j.tbvps, j.tce / 2797e6));
  const avg = (j.tce + (300.5 - 52.6 - 1.4) * 1e9) / 2;
  assert.ok(close(j.roatce, 57.5e9 / avg));
  assert.ok(j.tbvps > 90 && j.tbvps < 100, `JPM TBVPS ${j.tbvps}`);
  assert.ok(close(j.ptbv, 240 / j.tbvps));
});

test('OLS recovers an exact line and reports R² = 1', () => {
  const f = ols([0.05, 0.1, 0.15, 0.2], [0.75, 1.25, 1.75, 2.25]);
  assert.ok(close(f.alpha, 0.25));
  assert.ok(close(f.beta, 10));
  assert.ok(close(f.r2, 1));
  assert.ok(f.se < 1e-9);
});

test('PRD 4.2: regression excludes the target and flags rich / cheap banks', () => {
  const all = BANK_SNAPSHOT_TICKERS.map(bank);
  const t = bank('ZION');
  const r = regression(t, all, { roatce: t.roatce, excluded: [] });
  assert.equal(r.fit.n, all.length - 1);
  assert.ok(r.fit.beta > 0, 'higher returns should earn higher P/TBV');
  assert.ok(close(r.impliedPrice, r.impliedPtbv * t.tbvps));
  const target = r.points.find((p) => p.isTarget)!;
  assert.ok(close(target.residual, t.ptbv - (r.fit.alpha + r.fit.beta * t.roatce)));
  const without = regression(t, all, { roatce: t.roatce, excluded: ['KEY'] });
  assert.equal(without.fit.n, all.length - 2);
  assert.equal(without.points.find((p) => p.ticker === 'KEY')!.included, false);
});

const toy: BankInputs = { ...bank('ZION'), rwa: 100, cet1: 11, rorwa: 0.015, shares: 10, tbvps: 1 };

test('PRD 4.3: dividend capacity = NI − (RWA × target − prior CET1)', () => {
  const d = ddm(toy, { targetCet1: 0.1, loanGrowth: 0.05, ke: 0.1, terminalGrowth: 0.03 });
  const y1 = d.years[0];
  assert.ok(close(y1.rwa, 105));
  assert.ok(close(y1.netIncome, 0.015 * 105));
  assert.ok(close(y1.dividend, 0.015 * 105 - (0.1 * 105 - 11)));
  const y2 = d.years[1];
  assert.ok(close(y2.dividend, 0.015 * y2.rwa - (0.1 * y2.rwa - 0.1 * y1.rwa)));
  // Stage 2 fades growth linearly to the terminal rate.
  assert.ok(close(d.years[9].growth, 0.03));
  assert.ok(close(d.equityValue, d.pvStage1 + d.pvStage2 + d.pvTerminal));
  assert.ok(close(d.perShare, d.equityValue / 10));
  // A higher capital target can only lower the value.
  assert.ok(ddm(toy, { targetCet1: 0.12, loanGrowth: 0.05, ke: 0.1, terminalGrowth: 0.03 }).perShare < d.perShare);
});

test('DDM flags the capital raise when the bank is below target', () => {
  const d = ddm({ ...toy, cet1: 8 }, { targetCet1: 0.105, loanGrowth: 0.05, ke: 0.1, terminalGrowth: 0.03 });
  assert.ok(d.capitalRaises.length > 0 && d.capitalRaises[0].t === 1);
  assert.ok(d.excessCet1Now < 0);
  assert.ok(close(capitalStack({ ...toy, cet1: 8, cet1Ratio: 0.08 }, 0.105).injectionToTarget, 0.025 * 100));
});

test('stress test: shock losses, deposit run waterfall and capital hit', () => {
  const i: BankInputs = { ...toy, afs: 20, htm: 30, htmUnrealized: 2, cash: 5, deposits: 100, cet1: 11, rwa: 100, tce: 12, totalAssets: 150, goodwill: 1, intangibles: 0 };
  const s = stressTest(i, { rateShockBps: 100, duration: 5, outflowPct: 0.3, aociInCet1: true });
  assert.ok(close(s.afsLoss, 20 * 5 * 0.01));
  assert.ok(close(s.htmLoss, 30 * 5 * 0.01));
  // Outflow 30 = cash 5 + AFS 19 + 6 of HTM (fair value 30 − 2 − 1.5 = 26.5).
  assert.deepEqual(s.sources.map((x) => Math.round(x.used * 100) / 100), [5, 19, 6]);
  assert.equal(s.shortfall, 0);
  const realizedHtm = (6 / 26.5) * (2 + 1.5) * 0.79;
  assert.ok(close(s.cet1Hit, 1 * 0.79 + realizedHtm));
  assert.ok(close(s.cet1RatioAfter, (11 - s.cet1Hit) / 100));
  const run = stressTest(i, { rateShockBps: 100, duration: 5, outflowPct: 0.6, aociInCet1: false });
  assert.ok(run.shortfall > 0 && run.coverage < 1);
});

test('bank XBRL parsing: equity build, prior-year averages and capital fallbacks', () => {
  const f = (end: string, val: number, form = '10-K', start?: string) => ({ end, val, form, filed: end, accn: 'a-' + end, ...(start ? { start } : {}) });
  const usd = (...facts: ReturnType<typeof f>[]) => ({ units: { USD: facts } });
  const json = {
    cik: 1234,
    entityName: 'Test Bancorp',
    facts: {
      'us-gaap': {
        NetIncomeLoss: usd(f('2025-12-31', 120, '10-K', '2025-01-01'), f('2024-12-31', 100, '10-K', '2024-01-01')),
        PreferredStockDividendsIncomeStatementImpact: usd(f('2025-12-31', 5, '10-K', '2025-01-01')),
        StockholdersEquity: usd(f('2025-12-31', 1000), f('2024-12-31', 900), f('2026-06-30', 1050, '10-Q')),
        PreferredStockValue: usd(f('2026-06-30', 50, '10-Q'), f('2024-12-31', 50)),
        Goodwill: usd(f('2026-06-30', 100, '10-Q'), f('2024-12-31', 100)),
        Assets: usd(f('2026-06-30', 10000, '10-Q'), f('2024-12-31', 9000)),
        Deposits: usd(f('2026-06-30', 8000, '10-Q')),
      },
      dei: { EntityCommonStockSharesOutstanding: { units: { shares: [f('2026-07-25', 50, '10-Q')] } } },
    },
  };
  const p = parseBankFacts(json, 'TEST');
  assert.equal(p.fyLabel, 'FY2025');
  assert.equal(p.balanceLabel, 'Jun-26');
  assert.equal(p.items.commonEquity!.value, 1000);
  assert.equal(p.items.commonEquityPrior!.value, 850);
  assert.equal(p.items.netIncomeToCommon!.value, 115);
  assert.equal(p.items.cet1!.estimated, true);
  assert.equal(p.items.cet1!.value, 900); // TCE = 1000 − 100
  assert.ok(close(p.items.rwa!.value, 7000));
  assert.throws(() => parseBankFacts({ ...json, facts: { 'us-gaap': { ...json.facts['us-gaap'], Deposits: { units: { USD: [] } } }, dei: json.facts.dei } }, 'NOTBANK'), /does not look like a bank/);
});

test('snapshot sanity: every bank produces finite core metrics', () => {
  for (const t of BANK_SNAPSHOT_TICKERS) {
    const i = bank(t);
    for (const k of ['tbvps', 'roatce', 'ptbv', 'cet1Ratio', 'rorwa'] as const) assert.ok(Number.isFinite(i[k]), `${t} ${k}`);
    assert.ok(i.cet1Ratio > 0.09 && i.cet1Ratio < 0.17, `${t} CET1 ${i.cet1Ratio}`);
    const d = ddm(i, defaultBankAssumptions(i, 0.043));
    assert.ok(d.valid && Number.isFinite(d.perShare), t);
  }
});
