import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanyFacts, type CompanyFactsJson } from '../src/lib/sec/xbrl.ts';

// A trimmed companyfacts payload in the exact shape SEC returns, covering the cases
// the parser has to get right: tag switches, comparatives in later 10-Ks,
// restatements, 10-Q YTD facts for LTM, and multi-part debt.
const fy = (start: string, end: string, val: number, accn: string, filed: string, form = '10-K') => ({
  start, end, val, accn, filed, form, fy: Number(filed.slice(0, 4)), fp: 'FY',
});
const q = (start: string, end: string, val: number, accn: string, filed: string) => ({
  start, end, val, accn, filed, form: '10-Q', fy: 2025, fp: 'Q2',
});
const inst = (end: string, val: number, accn: string, filed: string, form = '10-K') => ({ end, val, accn, filed, form, fy: 2024, fp: 'FY' });

const json: CompanyFactsJson = {
  cik: 12345,
  entityName: 'Example Corp',
  facts: {
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: { shares: [inst('2024-02-01', 990, 'a-24', '2024-02-10'), { ...inst('2025-07-20', 1000, 'q-25', '2025-08-01', '10-Q') }] },
      },
    },
    'us-gaap': {
      // Older years tagged "Revenues", newer years use the ASC 606 tag.
      Revenues: { units: { USD: [fy('2020-01-01', '2020-12-31', 800, 'a-21', '2021-02-01')] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            fy('2021-01-01', '2021-12-31', 900, 'a-22', '2022-02-01'),
            fy('2022-01-01', '2022-12-31', 950, 'a-23', '2023-02-01'),
            fy('2023-01-01', '2023-12-31', 1000, 'a-24', '2024-02-01'),
            // Restated in the following 10-K: the later filing wins.
            fy('2023-01-01', '2023-12-31', 1010, 'a-25', '2025-02-01'),
            fy('2024-01-01', '2024-12-31', 1100, 'a-25', '2025-02-01'),
            q('2025-01-01', '2025-06-30', 600, 'q-25', '2025-08-01'),
            q('2024-01-01', '2024-06-30', 520, 'q-25', '2025-08-01'),
            // A quarter-only fact must not be mistaken for YTD.
            q('2025-04-01', '2025-06-30', 310, 'q-25', '2025-08-01'),
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            fy('2024-01-01', '2024-12-31', 220, 'a-25', '2025-02-01'),
            q('2025-01-01', '2025-06-30', 130, 'q-25', '2025-08-01'),
            q('2024-01-01', '2024-06-30', 100, 'q-25', '2025-08-01'),
          ],
        },
      },
      LongTermDebtNoncurrent: { units: { USD: [inst('2024-12-31', 400, 'a-25', '2025-02-01'), inst('2025-06-30', 380, 'q-25', '2025-08-01', '10-Q')] } },
      LongTermDebtCurrent: { units: { USD: [inst('2024-12-31', 50, 'a-25', '2025-02-01'), inst('2025-06-30', 60, 'q-25', '2025-08-01', '10-Q')] } },
      CommercialPaper: { units: { USD: [inst('2025-06-30', 25, 'q-25', '2025-08-01', '10-Q')] } },
      Assets: { units: { USD: [inst('2024-12-31', 5000, 'a-25', '2025-02-01'), inst('2025-06-30', 5200, 'q-25', '2025-08-01', '10-Q')] } },
      CashAndCashEquivalentsAtCarryingValue: { units: { USD: [inst('2025-06-30', 300, 'q-25', '2025-08-01', '10-Q')] } },
    },
  },
};

const out = parseCompanyFacts(json, 'EXMP');

test('annual series merges tag switches and keeps five years ascending', () => {
  assert.deepEqual(
    out.years.map((y) => [y.label, y.items.revenue?.value]),
    [
      ['FY2020', 800],
      ['FY2021', 900],
      ['FY2022', 950],
      ['FY2023', 1010],
      ['FY2024', 1100],
    ],
  );
  assert.equal(out.cik, '0000012345');
});

test('restated values come from the latest filing, with its accession number', () => {
  const f = out.years[3].items.revenue!.facts[0];
  assert.equal(f.accn, 'a-25');
  assert.equal(f.tag, 'RevenueFromContractWithCustomerExcludingAssessedTax');
});

test('LTM = FY + current YTD - prior YTD', () => {
  assert.equal(out.ltm.label, 'LTM Jun-25');
  assert.equal(out.ltm.items.revenue!.value, 1100 + 600 - 520);
  assert.equal(out.ltm.items.ebit!.value, 220 + 130 - 100);
  assert.equal(out.ltm.items.revenue!.facts.length, 3);
});

test('balance sheet uses the latest 10-Q and builds total debt from its parts', () => {
  assert.equal(out.balance.end, '2025-06-30');
  assert.equal(out.balance.items.debt!.value, 380 + 60 + 25);
  assert.equal(out.balance.items.cash!.value, 300);
  assert.equal(out.balance.items.sharesOutstanding!.value, 1000);
});
