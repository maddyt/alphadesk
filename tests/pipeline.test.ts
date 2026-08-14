/** Pipeline tests use a stub provider, so ingestion logic is verified without network access. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { auditCompany, collect, valueAll } from '../src/lib/pipeline/ingest.ts';
import { prepare } from '../src/lib/engine/corrections.ts';
import type { CompanyData } from '../src/lib/engine/types.ts';
import type { DataProvider, ProviderCompany } from '../src/lib/providers/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(join(here, 'fixtures/raw.json'), 'utf8')) as Record<string, CompanyData>;

class StubProvider implements DataProvider {
  readonly name = 'stub';
  private readonly failOn: string[];
  constructor(failOn: string[] = []) { this.failOn = failOn; }
  async universe(spec: string) { return spec.split(',').map((s) => s.trim().toUpperCase()); }
  async fetchCompany(ticker: string): Promise<ProviderCompany> {
    if (this.failOn.includes(ticker)) throw new Error('provider exploded');
    const c = raw[ticker];
    if (!c) throw new Error('unknown ticker');
    return { meta: c.meta, income_statement: c.income_statement, balance_sheet: c.balance_sheet, cash_flow: c.cash_flow, raw: { income: [], balance: [], cash: [], profile: {} } };
  }
}

describe('quality audit', () => {
  test('detects reported balance sheets that fail the accounting identity', () => {
    const findings = auditCompany(prepare(raw.AAPL));
    const gaps = findings.filter((f) => f.code === 'BALANCE_GAP');
    assert.ok(gaps.length >= 0);
    for (const g of gaps) assert.ok(typeof g.fiscalYear === 'number' && g.message.includes('Assets'));
  });
  test('flags a company with no market price', () => {
    const c = prepare(raw.AAPL);
    const noPrice: CompanyData = { ...c, meta: { ...c.meta, current_price: null } };
    assert.ok(auditCompany(noPrice).some((f) => f.code === 'NO_PRICE'));
  });
  test('flags thin history', () => {
    const c = prepare(raw.AAPL);
    const thin: CompanyData = { ...c, income_statement: c.income_statement.slice(-3) };
    assert.ok(auditCompany(thin).some((f) => f.code === 'THIN_HISTORY'));
  });
  test('notes zero interest expense alongside material debt', () => {
    const findings = auditCompany(prepare(raw.AAPL));
    assert.ok(findings.some((f) => f.code === 'ZERO_INTEREST_WITH_DEBT'), 'AAPL reports no interest in its latest years despite >$100bn of debt');
  });
});

describe('collection', () => {
  test('collects every ticker and isolates failures', async () => {
    const { companies, failed } = await collect({ universe: 'AAPL,MSFT,XOM', years: 10, provider: new StubProvider(['MSFT']) });
    assert.equal(companies.length, 2);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].ticker, 'MSFT');
    assert.ok(companies.every((c) => c.data.income_statement.length > 0));
  });
  test('values the batch against medians derived from that batch', async () => {
    const { companies } = await collect({ universe: 'AAPL,MSFT,COHR', years: 10, provider: new StubProvider() });
    const valued = valueAll(companies.map((c) => ({ ticker: c.ticker, data: c.data })));
    assert.equal(valued.length, 3);
    const aapl = valued.find((v) => v.ticker === 'AAPL')!;
    assert.ok(aapl.result, 'AAPL should value successfully');
    assert.ok(aapl.result!.fcfe.perShare! > 0);
    assert.ok(aapl.result!.fcff!.perShare! > 0);
  });
  test('a company that cannot be valued reports an error instead of throwing', () => {
    const broken: CompanyData = { meta: { ticker: 'BAD', company_name: 'Broken', sector: 'Technology', current_price: 10, shares_outstanding: 100, beta: 1 }, income_statement: [], balance_sheet: [], cash_flow: [] };
    const valued = valueAll([{ ticker: 'BAD', data: broken }]);
    assert.equal(valued[0].result, null);
    assert.ok(valued[0].error?.includes('insufficient history'));
  });
});
