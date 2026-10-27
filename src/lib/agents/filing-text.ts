// Pure helpers for the agentic Deal Room: split annual-report text into Items,
// search it, and verify that quotes the agents cite really appear in the filing.

export type SectionKey = 'business' | 'risk_factors' | 'mdna' | 'segments';

/** Item headings: 10-K uses Item 1 / 1A / 7; 20-F uses Item 4 / 3.D / 5. */
const PATTERNS: Record<'10-K' | '20-F', Record<Exclude<SectionKey, 'segments'>, [RegExp, RegExp]>> = {
  '10-K': {
    business: [/item\s*1\.?\s*(?:[-–—:]\s*)?business\b/gi, /item\s*1a\.?/gi],
    risk_factors: [/item\s*1a\.?\s*(?:[-–—:]\s*)?risk\s+factors/gi, /item\s*1b\.?|item\s*1c\.?|item\s*2\.?\s*(?:[-–—:]\s*)?properties/gi],
    mdna: [/item\s*7\.?\s*(?:[-–—:]\s*)?management['’]s\s+discussion/gi, /item\s*7a\.?|item\s*8\.?\s*(?:[-–—:]\s*)?financial\s+statements/gi],
  },
  '20-F': {
    business: [/item\s*4\.?\s*(?:[-–—:]\s*)?information\s+on\s+the\s+company/gi, /item\s*4a\.?|item\s*5\.?\s*(?:[-–—:]\s*)?operating/gi],
    risk_factors: [/(?:item\s*3\.?\s*)?d\.\s*risk\s+factors|item\s*3d\.?\s*risk\s+factors/gi, /item\s*4\.?\s*(?:[-–—:]\s*)?information\s+on\s+the\s+company/gi],
    mdna: [/item\s*5\.?\s*(?:[-–—:]\s*)?operating\s+and\s+financial\s+review/gi, /item\s*6\.?\s*(?:[-–—:]\s*)?directors/gi],
  },
};

const ANY_ITEM = /\n[ \t]*item[ \t]*\d+[a-z]?\b/gi;

/**
 * The body of an Item. Headings appear twice (table of contents, then the real
 * section), so take the longest span between a start heading and the next end heading.
 */
export function extractItem(text: string, form: string, key: Exclude<SectionKey, 'segments'>): { start: number; end: number; text: string } | null {
  const fam = form.startsWith('20-F') || form.startsWith('40-F') ? '20-F' : '10-K';
  const [startRe, endRe] = PATTERNS[fam][key];
  let best: { start: number; end: number } | null = null;
  const starts = [...text.matchAll(startRe)].map((m) => ({ at: m.index ?? 0, len: m[0].length }));
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i].at;
    endRe.lastIndex = s + starts[i].len;
    const e = endRe.exec(text);
    // A span also stops at the next occurrence of its own heading (TOC entry -> real section).
    const nextStart = starts[i + 1]?.at ?? Infinity;
    // ...and at the next "Item N" heading that starts a line (TOC entries end almost immediately).
    ANY_ITEM.lastIndex = s + starts[i].len;
    const nextItem = ANY_ITEM.exec(text);
    const end = Math.min(e ? e.index : Infinity, nextStart, nextItem ? nextItem.index + 1 : Infinity, s + 400_000, text.length);
    if (!best || end - s > best.end - best.start) best = { start: s, end };
  }
  if (!best || best.end - best.start < 1_500) return null;
  return { ...best, text: text.slice(best.start, best.end) };
}

/** Segment / revenue-disaggregation note: the passage around the first "segment information" heading in the notes. */
export function extractSegmentNote(text: string, max = 25_000): { start: number; end: number; text: string } | null {
  const re = /(segment information|reportable segments|operating segments|disaggregation of revenue)/gi;
  const hits = [...text.matchAll(re)].map((m) => m.index ?? 0);
  if (!hits.length) return null;
  // Prefer a mention in the second half (financial-statement notes) over the business overview.
  const start = hits.find((h) => h > text.length * 0.5) ?? hits[hits.length - 1];
  return { start, end: Math.min(text.length, start + max), text: text.slice(start, start + max) };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9%$.,'-]+/g, ' ')
    .trim();

/** 1-based line number of a character offset. */
export function lineAt(text: string, offset: number): number {
  let n = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Locate a quoted passage in the filing text, tolerant of whitespace, punctuation
 * and curly-quote differences. Returns the 1-based line of the match, or null.
 */
export function findQuote(text: string, quote: string): { line: number; offset: number } | null {
  const q = norm(quote);
  if (q.length < 12) return null;
  // Build the normalised text together with a map back to original offsets.
  const map: number[] = [];
  let out = '';
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let c = text[i].toLowerCase();
    if ('‘’“”'.includes(c)) c = "'";
    else if ('–—'.includes(c)) c = '-';
    if (/[a-z0-9%$.,'-]/.test(c)) {
      out += c;
      map.push(i);
      lastSpace = false;
    } else if (!lastSpace) {
      out += ' ';
      map.push(i);
      lastSpace = true;
    }
  }
  // Exact normalised match first, then the longest leading 80-char fragment (models sometimes trim).
  let idx = out.indexOf(q);
  if (idx < 0 && q.length > 80) idx = out.indexOf(q.slice(0, 80));
  if (idx < 0) return null;
  const offset = map[idx] ?? 0;
  return { line: lineAt(text, offset), offset };
}

/** Keyword search returning short passages with line numbers (for the MCP search tool). */
export function searchText(text: string, query: string, limit = 8, width = 600): { line: number; passage: string }[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!terms.length) return [];
  const lower = text.toLowerCase();
  const scored: { at: number; score: number }[] = [];
  for (const m of lower.matchAll(new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'))) {
    const at = m.index ?? 0;
    const window = lower.slice(Math.max(0, at - width / 2), at + width / 2);
    scored.push({ at, score: terms.reduce((s, t) => s + (window.includes(t) ? 1 : 0), 0) });
  }
  scored.sort((a, b) => b.score - a.score || a.at - b.at);
  const picked: { at: number; score: number }[] = [];
  for (const s of scored) {
    if (picked.length >= limit) break;
    if (picked.every((p) => Math.abs(p.at - s.at) > width)) picked.push(s);
  }
  return picked
    .sort((a, b) => a.at - b.at)
    .map((p) => ({ line: lineAt(text, p.at), passage: text.slice(Math.max(0, p.at - width / 2), p.at + width / 2).replace(/\s+/g, ' ').trim() }));
}

/** Rough token estimate for budgeting (about 4 characters per token for English filings). */
export const estimateTokens = (chars: number) => Math.round(chars / 4);
