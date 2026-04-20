// RED (WS-2): comma-parse a string override value into an array when the
// field rule declares contract.list_rules.item_union === 'set_union'.
// Reuses parseList() from publisher/validation/normalizers.js.

import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOverrideValue } from '../itemMutationService.js';

const SCALAR_RULE = { type: 'string' };
const SET_UNION_RULE = {
  type: 'array',
  contract: { list_rules: { item_union: 'set_union' } },
};
const WINNER_ONLY_LIST_RULE = {
  type: 'array',
  contract: { list_rules: { item_union: 'winner_only' } },
};

test('scalar field: string value passes through unchanged', () => {
  assert.equal(normalizeOverrideValue({ value: 'hello', fieldRule: SCALAR_RULE }), 'hello');
});

test('set_union list + comma-separated string → array', () => {
  const result = normalizeOverrideValue({ value: 'a, b, c', fieldRule: SET_UNION_RULE });
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('set_union list + already-array → pass-through unchanged', () => {
  const input = ['x', 'y'];
  const result = normalizeOverrideValue({ value: input, fieldRule: SET_UNION_RULE });
  assert.deepEqual(result, ['x', 'y']);
});

test('set_union list + extra whitespace → trimmed', () => {
  const result = normalizeOverrideValue({ value: '  a  ,   b ,c', fieldRule: SET_UNION_RULE });
  assert.deepEqual(result, ['a', 'b', 'c']);
});

test('set_union list + empty entries filtered', () => {
  const result = normalizeOverrideValue({ value: 'a, , b, ,', fieldRule: SET_UNION_RULE });
  assert.deepEqual(result, ['a', 'b']);
});

test('winner_only list rule: string value passes through (no split)', () => {
  // winner_only is single-value even if the field is list-typed; don't split it.
  assert.equal(
    normalizeOverrideValue({ value: 'a, b', fieldRule: WINNER_ONLY_LIST_RULE }),
    'a, b',
  );
});

test('missing fieldRule: pass-through (defensive)', () => {
  assert.equal(normalizeOverrideValue({ value: 'x', fieldRule: undefined }), 'x');
});

test('set_union + non-string, non-array value: pass-through', () => {
  // Hard rejection happens later in validateField. Normalizer only coerces strings.
  assert.equal(normalizeOverrideValue({ value: 42, fieldRule: SET_UNION_RULE }), 42);
});
