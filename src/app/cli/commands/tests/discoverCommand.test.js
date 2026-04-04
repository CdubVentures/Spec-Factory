import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscoverCommand } from '../discoverCommand.js';

function createDeps(overrides = {}) {
  return {
    loadCategoryConfig: async () => ({ schema: { critical_fields: ['dpi', 'sensor'] } }),
    runDiscoverySeedPlan: async () => ({
      candidates: [{ url: 'https://example.com/product' }],
    }),
    EventLogger: class EventLoggerStub {
      constructor(_params) { this.flushCount = 0; }
      async flush() { this.flushCount += 1; }
    },
    buildRunId: () => 'run-fixed',
    openSpecDbForCategory: () => ({
      getAllProducts: () => [
        { product_id: 'mouse-a', brand: 'Logitech', model: 'G502' },
        { product_id: 'mouse-b', brand: 'Razer', model: 'Viper' },
      ],
    }),
    ...overrides,
  };
}

test('discover command applies brand filter and returns selected run summaries', async () => {
  const discoverCalls = [];
  const loggerInstances = [];

  class EventLoggerRecorder {
    constructor(params) { this.params = params; this.flushCount = 0; loggerInstances.push(this); }
    async flush() { this.flushCount += 1; }
  }

  const storage = {
    async readJson(key) {
      if (key === 'mouse-a') return { productId: 'mouse-a' };
      return { productId: 'mouse-b' };
    },
    async readJsonOrNull(key) {
      if (key === 'mouse-a') return { identityLock: { brand: 'Logitech' } };
      return { identityLock: { brand: 'Razer' } };
    },
  };

  const commandDiscover = createDiscoverCommand(createDeps({
    EventLogger: EventLoggerRecorder,
    runDiscoverySeedPlan: async (payload) => {
      discoverCalls.push(payload);
      return {
        candidates: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }],
      };
    },
    buildRunId: () => 'run-001',
  }));

  const result = await commandDiscover({}, storage, {
    category: 'mouse',
    brand: 'Logitech',
  });

  assert.equal(discoverCalls.length, 1);
  assert.equal(result.command, 'discover');
  assert.equal(result.category, 'mouse');
  assert.equal(result.brand, 'Logitech');
  assert.equal(result.total_inputs, 2);
  assert.equal(result.selected_inputs, 1);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].productId, 'mouse-a');
  assert.equal(result.runs[0].runId, 'run-001');
  assert.equal(result.runs[0].candidate_count, 2);
});

test('discover command runs all inputs when no brand filter', async () => {
  const storage = {
    async readJson() { return { productId: 'mouse-a' }; },
    async readJsonOrNull() { return { identityLock: { brand: 'Logitech' } }; },
  };

  const commandDiscover = createDiscoverCommand(createDeps({
    openSpecDbForCategory: () => ({
      getAllProducts: () => [{ product_id: 'mouse-a', brand: 'Logitech', model: 'G502' }],
    }),
  }));

  const result = await commandDiscover({}, storage, { category: 'mouse' });

  assert.equal(result.total_inputs, 1);
  assert.equal(result.selected_inputs, 1);
});

test('discover command flushes buffered events before rethrowing discovery failures', async () => {
  const loggerInstances = [];
  const expectedError = new Error('seed_plan_failed');

  class EventLoggerRecorder {
    constructor(params) { this.params = params; this.flushCount = 0; loggerInstances.push(this); }
    async flush() { this.flushCount += 1; }
  }

  const storage = {
    async readJson() { return { productId: 'mouse-a' }; },
    async readJsonOrNull() { return { identityLock: { brand: 'Logitech' } }; },
  };

  const commandDiscover = createDiscoverCommand(createDeps({
    EventLogger: EventLoggerRecorder,
    openSpecDbForCategory: () => ({
      getAllProducts: () => [{ product_id: 'mouse-a', brand: 'Logitech', model: 'G502' }],
    }),
    runDiscoverySeedPlan: async () => { throw expectedError; },
  }));

  await assert.rejects(
    commandDiscover({}, storage, { category: 'mouse' }),
    expectedError,
  );

  assert.equal(loggerInstances.length, 1);
  assert.equal(loggerInstances[0].flushCount, 1);
});
