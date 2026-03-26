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
  const rebuildCalls = [];
  const commandRebuildIndex = createRebuildIndexCommand(createDeps({
    rebuildCategoryIndex: async ({ storage, config, category }) => {
      rebuildCalls.push({ storage, config, category });
      return {
        indexKey: `_index/${category}/catalog-index.json`,
        totalProducts: 9,
      };
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await commandRebuildIndex(
    config,
    storage,
    { category: ' keyboard ' },
  );

  assert.deepEqual(result, {
    command: 'rebuild-index',
    category: 'keyboard',
    index_key: '_index/keyboard/catalog-index.json',
    total_products: 9,
  });
  assert.deepEqual(rebuildCalls, [{
    storage,
    config,
    category: 'keyboard',
  }]);
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
