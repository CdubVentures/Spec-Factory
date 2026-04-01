import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueryRows } from './helpers/searchProfileHarness.js';

describe('Phase 02 - normalizeQueryRows Coercion', () => {
  it('converts flat string array to structured rows', () => {
    const result = normalizeQueryRows(['q1', 'q2', 'q3']);

    assert.equal(result.length, 3);
    assert.deepEqual(result[0], { query: 'q1', target_fields: [] });
    assert.deepEqual(result[1], { query: 'q2', target_fields: [] });
  });

  it('preserves structured rows with target_fields', () => {
    const input = [
      { query: 'razer viper specs', target_fields: ['weight', 'sensor'] },
      { query: 'razer viper review', target_fields: [] }
    ];
    const result = normalizeQueryRows(input);

    assert.deepEqual(result[0].target_fields, ['weight', 'sensor']);
    assert.deepEqual(result[1].target_fields, []);
  });

  it('handles mixed array of strings and objects', () => {
    const result = normalizeQueryRows([
      'plain query',
      { query: 'structured', target_fields: ['dpi'] },
      ''
    ]);

    assert.equal(result.length, 2, 'empty string filtered out');
    assert.equal(result[0].query, 'plain query');
    assert.deepEqual(result[1].target_fields, ['dpi']);
  });

  it('strips whitespace and normalizes spacing', () => {
    const result = normalizeQueryRows(['  spaced   query  ', { query: '  another   one  ', target_fields: [' dpi '] }]);

    assert.equal(result[0].query, 'spaced query');
    assert.equal(result[1].query, 'another one');
    assert.equal(result[1].target_fields[0], 'dpi');
  });
});
