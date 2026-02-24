import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDataChangeScopedCategories,
  applyDataChangeInvalidation,
} from '../tools/gui-react/src/components/layout/dataChangeScope.js';

test('resolveDataChangeScopedCategories uses explicit category from field-studio-map event', () => {
  const categories = resolveDataChangeScopedCategories({
    type: 'data-change',
    event: 'field-studio-map-saved',
    category: 'mouse',
    categories: ['mouse'],
  }, 'keyboard');

  assert.deepEqual(categories, ['mouse']);
});

test('resolveDataChangeScopedCategories falls back to current category when message is global', () => {
  const categories = resolveDataChangeScopedCategories({
    type: 'data-change',
    event: 'process-completed',
    category: 'all',
    categories: [],
  }, 'mouse');

  assert.deepEqual(categories, ['mouse']);
});

test('applyDataChangeInvalidation invalidates each scoped category once', () => {
  const invalidated = [];
  const scoped = applyDataChangeInvalidation({
    message: {
      type: 'data-change',
      event: 'catalog-bulk-add',
      categories: ['mouse', 'keyboard', 'mouse'],
    },
    fallbackCategory: 'monitor',
    invalidateForCategory: (category) => invalidated.push(category),
  });

  assert.deepEqual(scoped, ['mouse', 'keyboard']);
  assert.deepEqual(invalidated, ['mouse', 'keyboard']);
});
