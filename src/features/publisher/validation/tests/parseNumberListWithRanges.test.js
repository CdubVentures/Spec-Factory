import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberListWithRanges } from '../normalizers.js';

describe('parseNumberListWithRanges', () => {
  // ── Absence / empty ─────────────────────────────────────────────────
  it('null → []', () => assert.deepStrictEqual(parseNumberListWithRanges(null), []));
  it('undefined → []', () => assert.deepStrictEqual(parseNumberListWithRanges(undefined), []));
  it('"" → []', () => assert.deepStrictEqual(parseNumberListWithRanges(''), []));
  it('"unk" → []', () => assert.deepStrictEqual(parseNumberListWithRanges('unk'), []));
  it('"n/a" → []', () => assert.deepStrictEqual(parseNumberListWithRanges('n/a'), []));
  it('"N/A" → []', () => assert.deepStrictEqual(parseNumberListWithRanges('N/A'), []));

  // ── Single number ───────────────────────────────────────────────────
  it('"1.2" → [1.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2'), [1.2]));
  it('42 (number) → [42]', () => assert.deepStrictEqual(parseNumberListWithRanges(42), [42]));
  it('"1.2 mm" → [1.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2 mm'), [1.2]));
  it('"1.2mm" → [1.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2mm'), [1.2]));

  // ── Comma-separated list ────────────────────────────────────────────
  it('"1.0, 1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0, 1.5'), [1.0, 1.5]));
  it('"1.2, 2.4, 3.2" → [1.2, 2.4, 3.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2, 2.4, 3.2'), [1.2, 2.4, 3.2]));

  // ── Other delimiters ────────────────────────────────────────────────
  it('"1.0 / 1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0 / 1.5'), [1.0, 1.5]));
  it('"1.0 | 1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0 | 1.5'), [1.0, 1.5]));
  it('"1.0 ; 1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0 ; 1.5'), [1.0, 1.5]));

  // ── Ranges (hyphen) ─────────────────────────────────────────────────
  it('"1.0-1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0-1.5'), [1.0, 1.5]));
  it('"1.0 - 1.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0 - 1.5'), [1.0, 1.5]));

  // ── Ranges (en-dash) ────────────────────────────────────────────────
  it('"1.0\u20131.5" → [1.0, 1.5]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.0\u20131.5'), [1.0, 1.5]));

  // ── Mixed: single + range ───────────────────────────────────────────
  it('"1.2, 2.4-3.2" → [1.2, 2.4, 3.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2, 2.4-3.2'), [1.2, 2.4, 3.2]));

  // ── With unit suffixes ──────────────────────────────────────────────
  it('"1.2 mm, 2.4-3.2 mm" → [1.2, 2.4, 3.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2 mm, 2.4-3.2 mm'), [1.2, 2.4, 3.2]));
  it('"1.2mm, 2.4mm-3.2mm" → [1.2, 2.4, 3.2]', () => assert.deepStrictEqual(parseNumberListWithRanges('1.2mm, 2.4mm-3.2mm'), [1.2, 2.4, 3.2]));

  // ── Array passthrough ───────────────────────────────────────────────
  it('[1.2, 3.5] → [1.2, 3.5]', () => assert.deepStrictEqual(parseNumberListWithRanges([1.2, 3.5]), [1.2, 3.5]));
  it('["1.2", "3.5"] → [1.2, 3.5]', () => assert.deepStrictEqual(parseNumberListWithRanges(['1.2', '3.5']), [1.2, 3.5]));
  it('["1.2 mm"] → [1.2]', () => assert.deepStrictEqual(parseNumberListWithRanges(['1.2 mm']), [1.2]));
  it('[] → []', () => assert.deepStrictEqual(parseNumberListWithRanges([]), []));

  // ── Garbage filtering ───────────────────────────────────────────────
  it('"abc" → []', () => assert.deepStrictEqual(parseNumberListWithRanges('abc'), []));
  it('["abc", 1.2] → [1.2]', () => assert.deepStrictEqual(parseNumberListWithRanges(['abc', 1.2]), [1.2]));

  // ── Integer values ──────────────────────────────────────────────────
  it('"1" → [1]', () => assert.deepStrictEqual(parseNumberListWithRanges('1'), [1]));
  it('"1, 2, 3" → [1, 2, 3]', () => assert.deepStrictEqual(parseNumberListWithRanges('1, 2, 3'), [1, 2, 3]));
});
