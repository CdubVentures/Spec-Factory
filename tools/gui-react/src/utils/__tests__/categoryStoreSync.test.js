import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coerceCategories,
  resolveActiveCategory,
} from '../categoryStoreSync.js';

test('coerceCategories keeps unique non-empty entries in order', () => {
  const result = coerceCategories(['mouse', 'mouse', '', ' monitor ', null, undefined, 'keyboard']);
  assert.deepEqual(result, ['mouse', 'monitor', 'keyboard']);
});

test('coerceCategories falls back to default when input is empty', () => {
  const result = coerceCategories([]);
  assert.deepEqual(result, ['mouse']);
});

test('resolveActiveCategory keeps current category when available', () => {
  const result = resolveActiveCategory({
    currentCategory: 'monitor',
    categories: ['mouse', 'monitor'],
  });
  assert.equal(result, 'monitor');
});

test('resolveActiveCategory switches to first category when current missing', () => {
  const result = resolveActiveCategory({
    currentCategory: 'unknown',
    categories: ['mouse', 'monitor'],
  });
  assert.equal(result, 'mouse');
});
