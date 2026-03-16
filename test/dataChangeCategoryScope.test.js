import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDataChangeCategory,
  collectDataChangeCategories,
} from '../tools/gui-react/src/features/data-change/categoryScope.js';

test('normalizeDataChangeCategory lowercases and trims category tokens', () => {
  assert.equal(normalizeDataChangeCategory('  Mouse  '), 'mouse');
});

test('normalizeDataChangeCategory drops blank and all tokens', () => {
  assert.equal(normalizeDataChangeCategory(''), '');
  assert.equal(normalizeDataChangeCategory('all'), '');
});

test('collectDataChangeCategories dedupes valid categories and excludes all', () => {
  assert.deepEqual(
    collectDataChangeCategories({ categories: ['mouse', 'Mouse', 'all', 'keyboard'] }),
    ['mouse', 'keyboard'],
  );
});

test('collectDataChangeCategories falls back when scoped categories are empty', () => {
  assert.deepEqual(
    collectDataChangeCategories({ categories: ['all', ''], fallbackCategory: 'Trackball' }),
    ['trackball'],
  );
});
