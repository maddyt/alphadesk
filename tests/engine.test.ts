/**
 * Engine verification against fixtures captured from the reference implementation.
 * Fixtures are RAW vendor rows (duplicates and all), so this exercises the whole pipeline:
 * dedupe -> residual-bucket correction -> forecast -> triangulated valuation.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { prepare, balanceGap } from '../src/lib/engine/corrections.ts';
import { defaultAssumptions } from '../src/lib/engine/assumptions.ts';
import { runScenario } from '../src/lib/engine/valuation.ts';
import { backtest, cases, monteCarlo, reverseDcf, sensitivity } from '../src/lib/engine/analytics.ts';
import type { CompanyData, SectorMedians } from '../src/lib/engine/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, 'fixtures/raw.json'), 'utf8')) as Record<string, CompanyData>;
const expected = JSON.parse(readFileSync(join(here, 'fixtures/expected.json'), 'utf8')) as Record<string, any>;
const medians = JSON.parse(readFileSync(join(here, 'fixtures/sector-medians.json'), 'utf8')) as SectorMedians;

const TICKERS = Object.keys(expected);
const near = (actual: number | null, want: number | null, tol: number, label: string) => {
  if (want === null || want === undefined) { assert.equal(actual, null, `${label}: expected null`); return; }
  assert.ok(actual !== null, `${label}: got null, wanted ${want}`);
  const diff = Math.abs(actual! - want) / (Math.abs(want) || 1);
  assert.ok(diff <= tol, `${label}: got ${actual}, wanted ${want} (rel diff ${(diff * 100).toFixed(6)}%)`);
};

function scenarioFor(t: string) {
  const data = prepare(raw[t]);
  const a = defaultAssumptions(data.meta);
  const med = medians[data.meta.sector ?? 'Other'] ?? { gross: null, op: null, ebitda: null };
  return { data, a, med, result: runScenario(data, a, med) };
}

describe('correction layer', () => {
  for (const t of TICKERS) {
    test(`${t}: residual buckets match the reference correction`, () => {
      const data = prepare(raw[t]);
      const acts = data.balance_sheet.filter((r) => !r.is_projected);
      const last = acts[acts.length - 1];
      const e = expected[t].correctedLastActual;
      near(last.other_current_assets as number, e.other_current_assets, 1e-9, `${t} other_current_assets`);
      near(last.other_non_current_assets as number, e.other_non_current_assets, 1e-9, `${t} other_non_current_assets`);
      near(last.other_current_liabilities as number, e.other_current_liabilities, 1e-9, `${t} other_current_liabilities`);
      near(last.other_non_current_liabilities as number, e.other_non_current_liabilities, 1e-9, `${t} other_non_current_liabilities`);
    });
    test(`${t}: dedupe yields the expected number of reported years`, () => {
      const data = prepare(raw[t]);
      assert.equal(data.income_statement.filter((r) => !r.is_projected).length, expected[t].nActualYears);
    });
  }
});

describe('forecast', () => {
  for (const t of TICKERS) {
    test(`${t}: projected revenue, net income and OCF tie to the reference`, () => {
      const { result } = scenarioFor(t);
      const e = expected[t];
      result.projIS.forEach((p, i) => {
        near(p.revenue, e.projRevenue[i], 1e-9, `${t} FY+${i + 1} revenue`);
        near(p.net_income, e.projNetIncome[i], 1e-9, `${t} FY+${i + 1} net income`);
      });
      result.projCF.forEach((c, i) => near(c.ocf, e.projOcf[i], 1e-9, `${t} FY+${i + 1} OCF`));
    });
    test(`${t}: margin mode matches (cyclicals switch to full-cycle averages)`, () => {
      const { result } = scenarioFor(t);
      assert.equal(result.diagnostics.marginMode, expected[t].marginMode);
    });
  }
});

describe('triangulated valuation', () => {
  for (const t of TICKERS) {
    test(`${t}: FCFE / FCFF / residual income all tie`, () => {
      const { result } = scenarioFor(t);
      const e = expected[t];
      near(result.costOfEquity, e.coe, 1e-9, `${t} cost of equity`);
      near(result.fcfe.perShare, e.fcfeIV, 1e-9, `${t} FCFE per share`);
      near(result.fcff?.perShare ?? null, e.fcffIV, 1e-9, `${t} FCFF per share`);
      near(result.residualIncome?.perShare ?? null, e.riIV, 1e-9, `${t} residual income per share`);
      near(result.fcff?.wacc ?? null, e.wacc, 1e-9, `${t} WACC`);
      near(result.fcff?.enterpriseValue ?? null, e.ev, 1e-9, `${t} enterprise value`);
      assert.equal(result.fcfe.terminalOk, e.terminalOk, `${t} terminalOk`);
    });
    test(`${t}: terminal-value concentration ties`, () => {
      const { result } = scenarioFor(t);
      near(result.fcfe.tvShare, expected[t].tvShareEquity, 1e-9, `${t} TV share of equity`);
      near(result.fcff?.tvShare ?? null, expected[t].tvShareEV, 1e-9, `${t} TV share of EV`);
    });
    test(`${t}: sanity flags fire as expected`, () => {
      const { result } = scenarioFor(t);
      // The fixture counts the reference implementation's four *warning* checks. This engine
      // emits a superset (it also reports no-terminal-value, financial-sector routing and
      // net-borrowing clamps as informational), so compare like with like.
      const referenceCodes = new Set(['EXTREME_RESULT', 'WACC_BAND', 'METHOD_DISAGREEMENT', 'TV_CONCENTRATION']);
      const comparable = result.flags.filter((f) => f.severity === 'warn' && referenceCodes.has(f.code));
      assert.equal(comparable.length, expected[t].nFlags, `${t} warning flags: ${result.flags.map((f) => `${f.code}:${f.severity}`).join(', ')}`);
      assert.equal(result.diagnostics.isFinancial, expected[t].isFin);
      near(result.diagnostics.spread, expected[t].spread, 1e-9, `${t} method spread`);
    });
  }
});

describe('known structural cases', () => {
  test('JPM: cash-flow DCF fails, residual income carries the valuation', () => {
    const { result } = scenarioFor('JPM');
    assert.equal(result.fcfe.terminalOk, false, 'FCFE should have no valid terminal value for a bank');
    assert.ok(result.residualIncome?.perShare && result.residualIncome.perShare > 0, 'residual income should still produce a value');
    assert.ok(result.flags.some((f) => f.code === 'FINANCIAL_SECTOR'));
  });
  test('XOM: cyclical detection switches the margin base and the model flags itself', () => {
    const { result } = scenarioFor('XOM');
    assert.equal(result.diagnostics.marginMode, 'cycle');
    assert.ok(result.flags.some((f) => f.code === 'EXTREME_RESULT'));
    assert.ok(result.flags.some((f) => f.code === 'TV_CONCENTRATION'));
  });
  test('AAPL: value far below market triggers the extreme-result flag', () => {
    const { result } = scenarioFor('AAPL');
    assert.ok(result.diagnostics.ivToPrice! < 0.5);
    assert.ok(result.flags.some((f) => f.code === 'EXTREME_RESULT'));
  });
  test('projected balance sheets are reported with their gap, not silently plugged', () => {
    const { result } = scenarioFor('AAPL');
    const gaps = result.projBS.map((b) => b.balanceCheck);
    assert.ok(gaps.every((g) => Number.isFinite(g)), 'every projected year exposes a balance check');
    assert.ok(Math.abs(gaps[gaps.length - 1]) > 0, 'the known imbalance is surfaced rather than hidden');
  });
  test('reported balance gaps are detectable on historical rows', () => {
    const data = prepare(raw.AAPL);
    const last = data.balance_sheet.filter((r) => !r.is_projected).slice(-1)[0];
    assert.ok(balanceGap(last) !== null);
  });
});

describe('analytics', () => {
  test('sensitivity grid is 7x6 and its base cell equals the headline FCFF value', () => {
    const { result, a, data } = scenarioFor('AAPL');
    const grid = sensitivity(result, a, data.meta.shares_outstanding!);
    assert.equal(grid.waccRows.length, 7);
    assert.equal(grid.growthCols.length, 6);
    const wi = grid.waccRows.findIndex((w) => Math.abs(w - result.fcff!.wacc) < 1e-12);
    const gi = grid.growthCols.findIndex((g) => Math.abs(g - a.dcf.terminalGrowth) < 1e-12);
    near(grid.grid[wi][gi], result.fcff!.perShare, 1e-9, 'sensitivity base cell vs headline');
  });
  test('monte carlo is deterministic under a fixed seed and ordered', () => {
    const { data, a, med } = scenarioFor('AAPL');
    const one = monteCarlo(data, a, med, 120, 7);
    const two = monteCarlo(data, a, med, 120, 7);
    assert.deepEqual(one.p50, two.p50);
    assert.ok(one.p10! <= one.p50! && one.p50! <= one.p90!);
    assert.equal(one.trials, 120);
  });
  test('reverse DCF recovers a growth path that reprices to the market', () => {
    const { data, a, med } = scenarioFor('AAPL');
    const rev = reverseDcf(data, a, med);
    assert.ok(rev && rev.status === 'ok');
    if (rev.status === 'ok') {
      assert.ok(rev.impliedAvgGrowth > rev.modelAvgGrowth, 'AAPL trades above the model, so implied growth must exceed base');
      const check = runScenario(data, a, med, { gShift: rev.growthShift });
      near(check.fcfe.perShare, data.meta.current_price, 1e-3, 'reverse-solved value vs market price');
    }
  });
  test('backtest holds out real years and reports a non-trivial error', () => {
    const { data, a } = scenarioFor('AAPL');
    const bt = backtest(data, a);
    assert.ok(bt && bt.rows.length >= 1);
    assert.ok(bt!.revenueMape !== null && bt!.revenueMape > 0);
  });
  test('bull case exceeds bear case', () => {
    const { data, a, med } = scenarioFor('MSFT');
    const c = cases(data, a, med);
    assert.ok(c.bull.perShare! > c.bear.perShare!);
  });
});
