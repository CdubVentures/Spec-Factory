import test from 'node:test';
import assert from 'node:assert/strict';

import { createLearningReportCommand } from '../../../../src/app/cli/commands/learningReportCommand.js';

function createDeps(overrides = {}) {
  return {
    buildLearningReport: async ({ storage, category }) => ({
      storage_name: storage?.name || null,
      category,
      confidence: 0.88,
    }),
    ...overrides,
  };
}

test('learning-report forwards category/storage to builder and returns report payload', async () => {
  const calls = [];
  const commandLearningReport = createLearningReportCommand(createDeps({
    buildLearningReport: async (payload) => {
      calls.push(payload);
      return {
        category: payload.category,
        products_learned: 12,
        avg_confidence: 0.93,
      };
    },
  }));

  const storage = { name: 'stub-storage' };
  const result = await commandLearningReport({}, storage, { category: 'keyboard' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].category, 'keyboard');

  assert.equal(result.command, 'learning-report');
  assert.equal(result.category, 'keyboard');
  assert.equal(result.products_learned, 12);
  assert.equal(result.avg_confidence, 0.93);
});

test('learning-report defaults category to mouse', async () => {
  const calls = [];
  const commandLearningReport = createLearningReportCommand(createDeps({
    buildLearningReport: async (payload) => {
      calls.push(payload);
      return { category: payload.category, products_learned: 0 };
    },
  }));

  const result = await commandLearningReport({}, {}, {});

  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(result.command, 'learning-report');
  assert.equal(result.category, 'mouse');
  assert.equal(result.products_learned, 0);
});
