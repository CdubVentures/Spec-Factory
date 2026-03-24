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

test('rebuild-index runs rebuildCategoryIndex and returns summary payload', async () => {
  const calls = [];
  const commandRebuildIndex = createRebuildIndexCommand(createDeps({
    rebuildCategoryIndex: async (payload) => {
      calls.push(payload);
      return {
        indexKey: `_index/${payload.category}/catalog-index.json`,
        totalProducts: 9,
      };
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await commandRebuildIndex(config, storage, { category: 'keyboard' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config, config);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].category, 'keyboard');

  assert.equal(result.command, 'rebuild-index');
  assert.equal(result.category, 'keyboard');
  assert.equal(result.index_key, '_index/keyboard/catalog-index.json');
  assert.equal(result.total_products, 9);
});

test('rebuild-index defaults category to mouse', async () => {
  const commandRebuildIndex = createRebuildIndexCommand(createDeps());
  const result = await commandRebuildIndex({}, {}, {});

  assert.equal(result.command, 'rebuild-index');
  assert.equal(result.category, 'mouse');
  assert.equal(result.index_key, '_index/mouse/catalog-index.json');
  assert.equal(result.total_products, 42);
});
