import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractItem, findQuote, lineAt, searchText } from '../src/lib/agents/filing-text.ts';

const filler = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word} sentence ${i}.`).join(' ');
const tenK = [
  'TABLE OF CONTENTS',
  'Item 1. Business 3',
  'Item 1A. Risk Factors 10',
  'Item 7. Management’s Discussion and Analysis 30',
  'PART I',
  'Item 1. Business',
  filler(120, 'Business'),
  'Item 1A. Risk Factors',
  'Our supply chain depends on a limited number of suppliers in Asia.',
  filler(120, 'Risk'),
  'Item 1B. Unresolved Staff Comments',
  'None.',
  'Item 7. Management’s Discussion and Analysis of Financial Condition',
  filler(120, 'MDA'),
  'Item 8. Financial Statements and Supplementary Data',
  'Notes',
].join('\n');

test('extractItem takes the real section, not the table of contents', () => {
  const r = extractItem(tenK, '10-K', 'risk_factors')!;
  assert.ok(r.text.startsWith('Item 1A. Risk Factors\nOur supply chain'));
  assert.ok(!r.text.includes('Unresolved'));
  const m = extractItem(tenK, '10-K', 'mdna')!;
  assert.ok(m.text.includes('MDA sentence 5.') && !m.text.includes('Notes'));
});

test('findQuote tolerates whitespace and curly quotes, and returns a line number', () => {
  const hit = findQuote(tenK, 'our  supply chain depends on a limited number of suppliers in asia');
  assert.ok(hit);
  assert.equal(hit!.line, tenK.split('\n').findIndex((l) => l.startsWith('Our supply chain')) + 1);
  assert.equal(findQuote(tenK, 'Management\'s Discussion and Analysis of Financial Condition')!.line, lineAt(tenK, tenK.indexOf('Item 7. Management’s Discussion and Analysis of Financial')));
  assert.equal(findQuote(tenK, 'we have no suppliers anywhere in the world at all'), null);
});

test('searchText returns passages with line numbers', () => {
  const r = searchText(tenK, 'suppliers Asia');
  assert.ok(r.length >= 1);
  assert.ok(r[0].passage.includes('suppliers in Asia'));
});

// ---------------------------------------------------------------- MCP server

import { z } from 'zod';
import { handleRpc, type McpTool } from '../src/lib/mcp/jsonrpc.ts';

const echo: McpTool = {
  name: 'echo_ticker',
  description: 'Echo a ticker',
  schema: z.object({ ticker: z.string() }),
  run: (async ({ ticker }: { ticker: string }) => {
    if (ticker === 'BOOM') throw new Error('kaput');
    return `ticker=${ticker}`;
  }) as McpTool['run'],
};

test('MCP: initialize, notifications, tools/list and tools/call', async () => {
  const init = (await handleRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, [echo])) as { result: { protocolVersion: string; serverInfo: { name: string }; capabilities: object } };
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'dealpulse-sec-edgar');
  assert.ok('tools' in init.result.capabilities);
  assert.equal(await handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, [echo]), null);

  const list = (await handleRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, [echo])) as { result: { tools: { name: string; inputSchema: { type: string; required: string[] } }[] } };
  assert.equal(list.result.tools[0].name, 'echo_ticker');
  assert.equal(list.result.tools[0].inputSchema.type, 'object');
  assert.deepEqual(list.result.tools[0].inputSchema.required, ['ticker']);

  const call = (await handleRpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo_ticker', arguments: { ticker: 'AAPL' } } }, [echo])) as { result: { content: { text: string }[]; isError: boolean } };
  assert.equal(call.result.content[0].text, 'ticker=AAPL');
  assert.equal(call.result.isError, false);

  const bad = (await handleRpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo_ticker', arguments: {} } }, [echo])) as { result: { isError: boolean } };
  assert.equal(bad.result.isError, true);
  const boom = (await handleRpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'echo_ticker', arguments: { ticker: 'BOOM' } } }, [echo])) as { result: { isError: boolean; content: { text: string }[] } };
  assert.equal(boom.result.isError, true);
  assert.match(boom.result.content[0].text, /kaput/);

  const unknown = (await handleRpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'nope' } }, [echo])) as { error: { code: number } };
  assert.equal(unknown.error.code, -32602);
  const missing = (await handleRpc({ jsonrpc: '2.0', id: 7, method: 'resources/list' }, [echo])) as { error: { code: number } };
  assert.equal(missing.error.code, -32601);
});

// ------------------------------------------------- Citations, phase-in, cost

import { snapshotCompany, snapshotMarket } from '../src/lib/data/snapshot.ts';
import { defaultDealAssumptions, runDeal, toDealCompany } from '../src/lib/deals/engine.ts';
import { cleanSynergy, costUsd, phaseInSchedule, verifyCite, type SourceDoc } from '../src/lib/agents/verify.ts';

const src = (text: string, label: string): SourceDoc => ({ text, label, form: '10-K', accessionNumber: '0000000000-25-000001', filingDate: '2025-01-01', url: 'https://www.sec.gov/x' });

test('citations are verified against the filing they came from', () => {
  const docs = {
    acquirer_annual: src('Line one\nWe operate 120 distribution centers across North America.\nEnd', 'AAA 10-K'),
    target_annual: src('Intro\n\nOur selling, general and administrative expenses were driven by headcount.', 'BBB 10-K'),
  };
  const ok = verifyCite({ doc: 'target_annual', quote: 'selling, general and administrative expenses were driven by headcount' }, docs);
  assert.equal(ok.verified, true);
  assert.equal(ok.line, 3);
  assert.equal(ok.source?.label, 'BBB 10-K');
  // Attributed to the wrong filing: still found, re-labelled to the right one.
  const moved = verifyCite({ doc: 'target_annual', quote: 'We operate 120 distribution centers' }, docs);
  assert.equal(moved.verified, true);
  assert.equal(moved.doc, 'acquirer_annual');
  // Paraphrase fails.
  assert.equal(verifyCite({ doc: 'target_annual', quote: 'SG&A costs are mostly people costs at the target' }, docs).verified, false);
});

test('synergy phase-in reruns the engine year by year', () => {
  const A = toDealCompany(snapshotCompany('MSFT')!, snapshotMarket('MSFT')!);
  const T = toDealCompany(snapshotCompany('EA')!, snapshotMarket('EA')!);
  const a = defaultDealAssumptions(A, T);
  const syn = cleanSynergy({
    overlapSummary: '',
    costSynergies: [
      { area: 'Overhead', rationale: '', runRateUsd: 300e6, phaseIn: { year1: 0.5, year2: 0.3, year3: 1.4 }, cite: { doc: 'tool', quote: '' } },
      { area: 'R&D', rationale: '', runRateUsd: 100e6, phaseIn: { year1: 0, year2: 0.5, year3: 1 }, cite: { doc: 'tool', quote: '' } },
      { area: 'Bogus', rationale: '', runRateUsd: -5, phaseIn: { year1: 1, year2: 1, year3: 1 }, cite: { doc: 'tool', quote: '' } },
    ],
    revenueSynergies: [],
    regionalOverlap: [],
    hsrRisk: { score: 9, rationale: '' },
    confidence: 140,
    methodology: '',
  });
  assert.equal(syn.costSynergies.length, 2);
  assert.deepEqual(syn.costSynergies[0].phaseIn, { year1: 0.5, year2: 0.5, year3: 1 }); // monotonic, capped at 1
  assert.equal(syn.hsrRisk.score, 5);
  assert.equal(syn.confidence, 100);
  const rows = phaseInSchedule(A, T, a, syn.costSynergies);
  assert.ok(Math.abs(rows[0].agentSynergies - 150e6) < 1);
  assert.ok(Math.abs(rows[2].agentSynergies - 400e6) < 1);
  assert.ok(Math.abs(rows[0].phase - 150 / 400) < 1e-9);
  assert.ok(Math.abs(rows[2].agentAccretion - runDeal(A, T, { ...a, synergies: 400e6 }).accretion) < 1e-12);
  assert.ok(rows[0].agentAccretion <= rows[1].agentAccretion && rows[1].agentAccretion <= rows[2].agentAccretion);
});

test('token cost estimate', () => {
  assert.ok(Math.abs(costUsd({ input: 1e6, output: 1e5, cacheRead: 0, cacheWrite: 0 }) - 6) < 1e-9);
});
