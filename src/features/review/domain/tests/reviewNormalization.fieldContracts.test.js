import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeField,
  normalizeFieldKey,
} from '../reviewNormalization.js';

test('normalizeFieldKey strips non-alphanumeric-underscore and trims underscores', () => {
  const cases = [
    ['dpi', 'dpi'],
    ['DPI', 'dpi'],
    ['click_latency', 'click_latency'],
    ['fields.weight', 'fields_weight'],
    ['  sensor  ', 'sensor'],
    ['a--b++c', 'a_b_c'],
    ['__leading__', 'leading'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['$special!chars@', 'special_chars'],
    ['hello world', 'hello_world'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeFieldKey(input), expected, `normalizeFieldKey(${JSON.stringify(input)})`);
  }
});

test('normalizeField strips fields. prefix then normalizes', () => {
  const cases = [
    ['fields.weight', 'weight'],
    ['fields.click_latency', 'click_latency'],
    ['weight', 'weight'],
    ['FIELDS.DPI', 'dpi'],
    ['fields.DPI', 'dpi'],
    ['', ''],
    [null, ''],
    [undefined, ''],
    ['fields.', ''],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeField(input), expected, `normalizeField(${JSON.stringify(input)})`);
  }
});
