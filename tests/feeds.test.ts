import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dropSubtotals,
  filerFromHeader,
  governanceFlags,
  governanceRating,
  parseForm4,
  parseFredCsv,
  parseLabels,
  parseSegments,
  parseTreasuryCsv,
  prettifyMember,
  rawForm4Path,
  recentFilings,
  summarizeInsiders,
} from '../src/lib/sec/parsers.ts';

const now = new Date('2026-10-27T00:00:00Z');

test('submissions -> filings -> 8-K governance flags', () => {
  const filings = recentFilings({
    filings: {
      recent: {
        form: ['8-K', '8-K', '10-K/A', '8-K', '4'],
        filingDate: ['2026-05-01', '2025-11-03', '2025-06-01', '2023-01-01', '2026-09-01'],
        accessionNumber: ['a', 'b', 'c', 'd', 'e'],
        primaryDocument: ['x.htm', 'y.htm', 'z.htm', 'w.htm', 'xslF345X05/f4.xml'],
        items: ['2.02,9.01', '4.02', '', '4.01', ''],
        reportDate: ['', '', '', '', ''],
      },
    },
  });
  assert.equal(filings.length, 5);
  const flags = governanceFlags(filings, now);
  assert.deepEqual(flags.map((f) => f.code), ['8-K Item 4.02', '10-K/A'], 'old 4.01 outside 24 months is ignored');
  assert.equal(governanceRating(flags), 'red');
  assert.equal(governanceRating([]), 'green');
  assert.equal(rawForm4Path('xslF345X05/f4.xml'), 'f4.xml');
});

test('Form 4 parsing and insider summary', () => {
  const xml = `<ownershipDocument><reportingOwner><reportingOwnerId><rptOwnerName>Doe Jane</rptOwnerName></reportingOwnerId>
  <reportingOwnerRelationship><isOfficer>1</isOfficer><officerTitle>Chief Financial Officer</officerTitle></reportingOwnerRelationship></reportingOwner>
  <nonDerivativeTable>
   <nonDerivativeTransaction><transactionDate><value>2026-08-01</value></transactionDate><transactionCoding><transactionCode>S</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>50.5</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
   <nonDerivativeTransaction><transactionDate><value>2026-08-02</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding>
    <transactionAmounts><transactionShares><value>200</value></transactionShares><transactionPricePerShare><value>40</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
  </nonDerivativeTable></ownershipDocument>`;
  const t = parseForm4(xml, 'acc');
  assert.equal(t.length, 2);
  assert.equal(t[0].owner, 'Doe Jane');
  assert.equal(t[0].title, 'Chief Financial Officer');
  assert.equal(t[0].value, 50500);
  const s = summarizeInsiders(t, 1);
  assert.equal(s.buys, 8000);
  assert.equal(s.sells, 50500);
  assert.equal(s.signal, 'selling');
});

test('13D/G filer name from header', () => {
  assert.equal(filerFromHeader('SUBJECT COMPANY:\n COMPANY CONFORMED NAME: TARGET INC\nFILED BY:\n\tCOMPANY DATA:\n\t\tCOMPANY CONFORMED NAME:\t\t\tELLIOTT INVESTMENT MANAGEMENT L.P.\n'), 'ELLIOTT INVESTMENT MANAGEMENT L.P.');
});

test('segment revenue from a 10-K instance, subtotals removed, labels applied', () => {
  const ctx = (id: string, member?: [string, string], start = '2023-10-01', end = '2024-09-28') => `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>${
    member ? `<xbrli:segment><xbrldi:explicitMember dimension="${member[0]}">${member[1]}</xbrldi:explicitMember></xbrli:segment>` : ''
  }</xbrli:entity><xbrli:period><xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate></xbrli:period></xbrli:context>`;
  const fact = (c: string, v: number) => `<us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax contextRef="${c}" decimals="-6" unitRef="usd">${v}</us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax>`;
  const P = 'srt:ProductOrServiceAxis';
  const G = 'srt:StatementGeographicalAxis';
  const xml = [
    ctx('t'),
    ctx('p1', [P, 'aapl:IPhoneMember']),
    ctx('p2', [P, 'aapl:MacMember']),
    ctx('p3', [P, 'us-gaap:ProductMember']),
    ctx('p4', [P, 'us-gaap:ServiceMember']),
    ctx('g1', [G, 'country:US']),
    ctx('g2', [G, 'aapl:OtherCountriesMember']),
    ctx('old', [P, 'aapl:IPhoneMember'], '2022-09-25', '2023-09-30'),
    fact('t', 1000),
    fact('p1', 500),
    fact('p2', 200),
    fact('p3', 700),
    fact('p4', 300),
    fact('g1', 400),
    fact('g2', 600),
    fact('old', 999),
  ].join('\n');
  const labels = new Map([['aapl:IPhoneMember', 'iPhone']]);
  const s = parseSegments(xml, '2024-09-28', labels);
  assert.equal(s.length, 2);
  assert.equal(s[0].axis, 'product');
  assert.deepEqual(s[0].lines.map((l) => [l.label, l.value]), [['iPhone', 500], ['Service', 300], ['Mac', 200]]);
  assert.ok(s[0].reconciles);
  assert.equal(s[1].axis, 'geography');
  assert.equal(s[1].total, 1000);
});

test('subtotal detection and member prettifying', () => {
  const l = dropSubtotals([
    { member: 'a', label: 'A', value: 10 },
    { member: 'b', label: 'B', value: 5 },
    { member: 'c', label: 'C', value: 15 },
    { member: 'd', label: 'D', value: 7 },
  ]);
  assert.deepEqual(l.map((x) => x.member), ['a', 'd', 'b']);
  assert.equal(prettifyMember('aapl:WearablesHomeandAccessoriesMember'), 'Wearables Homeand Accessories');
});

test('label linkbase', () => {
  const lab = `<link:loc xlink:type="locator" xlink:href="aapl-20240928.xsd#aapl_IPhoneMember" xlink:label="loc_1"/>
  <link:labelArc xlink:type="arc" xlink:from="loc_1" xlink:to="lab_1"/>
  <link:label xlink:type="resource" xlink:label="lab_1" xlink:role="http://www.xbrl.org/2003/role/label">iPhone [Member]</link:label>
  <link:label xlink:type="resource" xlink:label="lab_1" xlink:role="http://www.xbrl.org/2003/role/terseLabel">iPhone</link:label>`;
  assert.equal(parseLabels(lab).get('aapl:IPhoneMember'), 'iPhone');
});

test('Treasury and FRED yield parsing', () => {
  const csv = 'Date,"1 Mo","2 Mo","3 Mo","6 Mo","1 Yr","2 Yr","5 Yr","10 Yr","30 Yr"\n10/24/2026,4.10,4.08,4.05,3.95,3.80,3.60,3.70,4.15,4.60\n10/23/2026,4.11,4.09,4.06,3.96,3.81,3.61,3.71,4.18,4.62';
  const y = parseTreasuryCsv(csv)!;
  assert.equal(y.date, '2026-10-24');
  assert.ok(Math.abs(y.tenYear - 0.0415) < 1e-12);
  assert.equal(y.points.length, 9);
  assert.deepEqual(parseFredCsv('observation_date,DGS10\n2026-10-23,4.18\n2026-10-24,.\n'), { date: '2026-10-23', rate: 0.0418 });
});
