import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepare } from '../src/lib/engine/corrections.ts';
import { defaultAssumptions } from '../src/lib/engine/assumptions.ts';
import { runScenario } from '../src/lib/engine/valuation.ts';
import { backtest, reverseDcf, sensitivity } from '../src/lib/engine/analytics.ts';
import { dcfReport, modelCsv, tearsheet } from '../src/lib/deliverables/report.ts';
import type { CompanyData, SectorMedians } from '../src/lib/engine/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, 'fixtures/raw.json'), 'utf8')) as Record<string, CompanyData>;
const medians = JSON.parse(readFileSync(join(here, 'fixtures/sector-medians.json'), 'utf8')) as SectorMedians;

function build(ticker: string) {
  const data = prepare(raw[ticker]);
  const a = defaultAssumptions(data.meta);
  const med = medians[data.meta.sector ?? 'Other'];
  const result = runScenario(data, a, med);
  return { data, a, med, result };
}

describe('deliverables', () => {
  test('DCF report contains the summary, bridge, sensitivity and self-challenge sections', () => {
    const { data, a, med, result } = build('AAPL');
    const html = dcfReport({
      data, result,
      sensitivity: sensitivity(result, a, data.meta.shares_outstanding!),
      reverse: reverseDcf(data, a, med), backtest: backtest(data, a),
    });
    for (const section of ['Executive summary', 'Cost of capital', 'Projections', 'Valuation bridge', 'Sensitivity', 'Self-challenge']) {
      assert.ok(html.includes(section), `missing section: ${section}`);
    }
    assert.ok(html.includes('not investment advice'), 'must carry the advice disclaimer');
    assert.ok(html.includes('EXTREME RESULT') || html.includes('extreme'), 'AAPL flags should reach the report');
    assert.ok(!html.includes('undefined') && !html.includes('NaN'), 'no undefined/NaN leakage');
  });

  test('report escapes company names rather than interpolating raw HTML', () => {
    const { data, result } = build('AAPL');
    const evil: CompanyData = { ...data, meta: { ...data.meta, company_name: 'Ac<script>alert(1)</script>me' } };
    const html = tearsheet({ data: evil, result });
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  test('tearsheet renders for a company whose cash-flow DCF fails', () => {
    const { data, result } = build('JPM');
    const html = tearsheet({ data, result });
    assert.ok(html.includes('JPM'));
    assert.ok(!html.includes('NaN'));
    assert.equal(result.fcfe.terminalOk, false);
  });

  test('CSV export is well formed and carries the valuation summary', () => {
    const { data, result } = build('MSFT');
    const csv = modelCsv({ data, result });
    const lines = csv.split('\n');
    assert.ok(lines[0].startsWith('Line item ($mm),FY'));
    assert.ok(lines.some((l) => l.startsWith('Revenue,')));
    assert.ok(lines.some((l) => l.startsWith('FCFE value per share,')));
    const widths = new Set(lines.filter((l) => l.startsWith('Revenue,') || l.startsWith('Net income,')).map((l) => l.split(',').length));
    assert.equal(widths.size, 1, 'all data rows share a column count');
  });
});
