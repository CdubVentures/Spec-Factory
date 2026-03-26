import test from 'node:test';
import assert from 'node:assert/strict';

import { createLearningReportCommand } from '../learningReportCommand.js';

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

test('learning-report returns the requested category in its command payload', async () => {
  const reportCalls = [];
  const commandLearningReport = createLearningReportCommand(createDeps({
    buildLearningReport: async ({ storage, category }) => {
      reportCalls.push({ storage, category });
      return ({
      category,
      products_learned: 12,
      avg_confidence: 0.93,
    });
    },
  }));

  const storage = { name: 'stub-storage' };
  const result = await commandLearningReport({}, storage, { category: ' keyboard ' });

  assert.deepEqual(result, {
    command: 'learning-report',
    category: 'keyboard',
    products_learned: 12,
    avg_confidence: 0.93,
  });
  assert.deepEqual(reportCalls, [{
    storage,
    category: 'keyboard',
  }]);
});

test('learning-report defaults category to mouse', async () => {
  const commandLearningReport = createLearningReportCommand(createDeps({
    buildLearningReport: async ({ category }) => ({
      category,
      products_learned: 0,
    }),
  }));

  const result = await commandLearningReport({}, {}, {});

  assert.deepEqual(result, {
    command: 'learning-report',
    category: 'mouse',
    products_learned: 0,
  });
});
