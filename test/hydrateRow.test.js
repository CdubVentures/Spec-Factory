// WHY: Unit tests for the generic DB row boolean hydration helper.
// Ensures 0/1 integers from SQLite are correctly converted to JS booleans.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { hydrateRow, hydrateRows } from '../src/db/specDbHelpers.js';

const BOOL_KEYS = ['flag_a', 'flag_b'];

describe('hydrateRow', () => {
  it('converts integer 1 to true', () => {
    const row = { id: 1, flag_a: 1, flag_b: 0, name: 'test' };
    const result = hydrateRow(BOOL_KEYS, row);
    strictEqual(result.flag_a, true);
    strictEqual(result.flag_b, false);
  });

  it('preserves non-boolean fields', () => {
    const row = { id: 42, flag_a: 1, name: 'hello' };
    const result = hydrateRow(BOOL_KEYS, row);
    strictEqual(result.id, 42);
    strictEqual(result.name, 'hello');
  });

  it('returns null/undefined unchanged', () => {
    strictEqual(hydrateRow(BOOL_KEYS, null), null);
    strictEqual(hydrateRow(BOOL_KEYS, undefined), undefined);
  });

  it('skips keys not present in row', () => {
    const row = { id: 1, flag_a: 1 };
    const result = hydrateRow(BOOL_KEYS, row);
    strictEqual(result.flag_a, true);
    ok(!('flag_b' in result), 'flag_b should not be injected');
  });

  it('handles string "1" via Number() coercion', () => {
    const row = { flag_a: '1', flag_b: '0' };
    const result = hydrateRow(BOOL_KEYS, row);
    strictEqual(result.flag_a, true);
    strictEqual(result.flag_b, false);
  });

  it('does not mutate original row', () => {
    const row = { flag_a: 1 };
    const result = hydrateRow(BOOL_KEYS, row);
    strictEqual(row.flag_a, 1, 'original should be unchanged');
    strictEqual(result.flag_a, true);
  });

  it('handles empty boolean keys array', () => {
    const row = { id: 1, flag_a: 1 };
    const result = hydrateRow([], row);
    strictEqual(result.flag_a, 1, 'no conversion when no keys');
  });
});

describe('hydrateRows', () => {
  it('maps all rows through hydrateRow', () => {
    const rows = [
      { id: 1, flag_a: 1, flag_b: 0 },
      { id: 2, flag_a: 0, flag_b: 1 },
    ];
    const result = hydrateRows(BOOL_KEYS, rows);
    strictEqual(result.length, 2);
    strictEqual(result[0].flag_a, true);
    strictEqual(result[0].flag_b, false);
    strictEqual(result[1].flag_a, false);
    strictEqual(result[1].flag_b, true);
  });

  it('handles empty array', () => {
    deepStrictEqual(hydrateRows(BOOL_KEYS, []), []);
  });
});
