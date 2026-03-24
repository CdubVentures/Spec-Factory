import test from 'node:test';
import assert from 'node:assert/strict';

import { createRebuildIndexCommand } from '../rebuildIndexCommand.js';

function createDeps(overrides = {}) {
  return {
    rebuildCategoryIndex: async ({ category }) => ({
      indexKey: `_index/${category}/catalog-index.json`,
      totalProducts: 42,
    }),
    ...overrides,
  };
}

test('rebuild-index returns the rebuilt index summary payload', async () => {
  const commandRebuildIndex = createRebuildIndexCommand(createDeps({
    rebuildCategoryIndex: async ({ category }) => ({
      indexKey: `_index/${category}/catalog-index.json`,
      totalProducts: 9,
    }),
  }));

  const result = await commandRebuildIndex(
    { mode: 'test' },
    { name: 'stub-storage' },
    { category: 'keyboard' },
  );

  assert.deepEqual(result, {
    command: 'rebuild-index',
    category: 'keyboard',
    index_key: '_index/keyboard/catalog-index.json',
    total_products: 9,
  });
});

test('rebuild-index defaults category to mouse', async () => {
  const commandRebuildIndex = createRebuildIndexCommand(createDeps());
  const result = await commandRebuildIndex({}, {}, {});

  assert.deepEqual(result, {
    command: 'rebuild-index',
    category: 'mouse',
    index_key: '_index/mouse/catalog-index.json',
    total_products: 42,
  });
});
