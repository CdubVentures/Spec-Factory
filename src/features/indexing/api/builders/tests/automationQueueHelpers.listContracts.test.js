import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addUniqueStrings,
  toStringList,
} from '../automationQueueHelpers.js';

test('toStringList trims filters and limits string arrays', () => {
  assert.deepEqual(toStringList(['a', ' b ', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(toStringList([null, '', 'x', 0, 'y']), ['x', 'y']);
  assert.deepEqual(toStringList(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
});

test('toStringList returns an empty array for non-array input', () => {
  assert.deepEqual(toStringList('not-array'), []);
  assert.deepEqual(toStringList(null), []);
  assert.deepEqual(toStringList(undefined), []);
});

test('addUniqueStrings merges deduplicated strings and honors the limit', () => {
  assert.deepEqual(addUniqueStrings(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(addUniqueStrings(['a'], ['b', 'c', 'd'], 2), ['a', 'b']);
});

test('addUniqueStrings handles invalid and empty inputs gracefully', () => {
  assert.deepEqual(addUniqueStrings(null, null), []);
  assert.deepEqual(addUniqueStrings('x', 'y'), []);
  assert.deepEqual(addUniqueStrings([], []), []);
  assert.deepEqual(addUniqueStrings([], ['a']), ['a']);
});
