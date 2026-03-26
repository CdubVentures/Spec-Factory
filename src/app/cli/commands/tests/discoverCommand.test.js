import test from 'node:test';
import assert from 'node:assert/strict';

import { createDiscoverCommand } from '../discoverCommand.js';

function createDeps(overrides = {}) {
  return {
    loadCategoryConfig: async () => ({ schema: { critical_fields: ['dpi', 'sensor'] } }),
    runDiscoverySeedPlan: async ({ job, runId }) => ({
      candidatesKey: `_discovery/${runId}/${job.productId}.json`,
      candidates: [{ url: 'https://example.com/product' }],
    }),
    EventLogger: class EventLoggerStub {
      constructor(_params) {
        this.flushCount = 0;
      }
      async flush() {
        this.flushCount += 1;
      }
    },
    buildRunId: () => 'run-fixed',
    ...overrides,
  };
}

test('discover command applies brand filter and returns selected run summaries', async () => {
  const discoverCalls = [];
  const loggerInstances = [];

  class EventLoggerRecorder {
    constructor(params) {
      this.params = params;
      this.flushCount = 0;
      loggerInstances.push(this);
    }
    async flush() {
      this.flushCount += 1;
    }
  }

  const storage = {
    async listInputKeys() {
      return ['input/a.json', 'input/b.json'];
    },
    async readJsonOrNull(key) {
      if (key.endsWith('a.json')) {
        return { identityLock: { brand: 'Logitech' } };
      }
      return { identityLock: { brand: 'Razer' } };
    },
    async readJson(key) {
      if (key.endsWith('a.json')) return { productId: 'mouse-a' };
      return { productId: 'mouse-b' };
    },
  };

  const commandDiscover = createDiscoverCommand(createDeps({
    EventLogger: EventLoggerRecorder,
    runDiscoverySeedPlan: async (payload) => {
      discoverCalls.push(payload);
      return {
        candidatesKey: `_discovery/${payload.runId}.json`,
        candidates: [{ url: 'https://example.com/a' }, { url: 'https://example.com/b' }],
      };
    },
    buildRunId: () => 'run-001',
  }));

  const result = await commandDiscover({
    runtimeEventsKey: '_runtime/events.jsonl',
  }, storage, {
    category: 'mouse',
    brand: 'Logitech',
  });

  assert.equal(discoverCalls.length, 1);
  assert.deepEqual(discoverCalls[0].roundContext, { missing_critical_fields: ['dpi', 'sensor'] });

  assert.equal(loggerInstances.length, 1);
  assert.equal(loggerInstances[0].flushCount, 1);
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
    async listInputKeys() {
      return ['input/a.json'];
    },
    async readJsonOrNull() {
      return { identityLock: { brand: 'Logitech' } };
    },
    async readJson() {
      return { productId: 'mouse-a' };
    },
  };

  const commandDiscover = createDiscoverCommand(createDeps());

  const result = await commandDiscover({}, storage, {
    category: 'mouse',
  });

  assert.equal(result.total_inputs, 1);
  assert.equal(result.selected_inputs, 1);
});

test('discover command flushes buffered events before rethrowing discovery failures', async () => {
  const loggerInstances = [];
  const expectedError = new Error('seed_plan_failed');

  class EventLoggerRecorder {
    constructor(params) {
      this.params = params;
      this.flushCount = 0;
      loggerInstances.push(this);
    }
    async flush() {
      this.flushCount += 1;
    }
  }

  const storage = {
    async listInputKeys() {
      return ['input/a.json'];
    },
    async readJsonOrNull() {
      return { identityLock: { brand: 'Logitech' } };
    },
    async readJson() {
      return { productId: 'mouse-a' };
    },
  };

  const commandDiscover = createDiscoverCommand(createDeps({
    EventLogger: EventLoggerRecorder,
    runDiscoverySeedPlan: async () => {
      throw expectedError;
    },
  }));

  await assert.rejects(
    commandDiscover({ runtimeEventsKey: '_runtime/events.jsonl' }, storage, {
      category: 'mouse',
    }),
    expectedError,
  );

  assert.equal(loggerInstances.length, 1);
  assert.equal(loggerInstances[0].flushCount, 1);
});
