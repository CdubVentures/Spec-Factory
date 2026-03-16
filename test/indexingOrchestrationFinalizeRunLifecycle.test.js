import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeRunLifecycle } from '../src/features/indexing/orchestration/index.js';

test('finalizeRunLifecycle emits field decisions, saves frontier, then flushes logger', async () => {
  const calls = [];
  const logger = {
    async flush() {
      calls.push('flush');
    },
  };
  const frontierDb = {
    async save() {
      calls.push('frontier_save');
    },
  };
  await finalizeRunLifecycle({
    logger,
    frontierDb,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    fieldReasoning: { dpi: 'ok' },
    trafficLight: { counts: {} },
    emitFieldDecisionEventsFn: () => {
      calls.push('emit_field_decisions');
    },
  });

  assert.deepEqual(calls, ['emit_field_decisions', 'frontier_save', 'flush']);
});

test('finalizeRunLifecycle skips frontier save when frontier db is absent', async () => {
  const calls = [];
  const logger = {
    async flush() {
      calls.push('flush');
    },
  };
  await finalizeRunLifecycle({
    logger,
    frontierDb: null,
    fieldOrder: ['dpi'],
    normalized: { fields: { dpi: 32000 } },
    provenance: { dpi: [] },
    fieldReasoning: { dpi: 'ok' },
    trafficLight: { counts: {} },
    emitFieldDecisionEventsFn: () => {
      calls.push('emit_field_decisions');
    },
  });

  assert.deepEqual(calls, ['emit_field_decisions', 'flush']);
});
