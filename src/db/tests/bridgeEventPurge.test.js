// WHY: Verifies purgeBridgeEventsForRun deletes events for a specific run_id
// without affecting other runs.

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function insertEvent(specDb, runId, event = 'fetch_finished') {
  specDb.insertBridgeEvent({
    run_id: runId,
    category: 'mouse',
    product_id: 'p1',
    ts: new Date().toISOString(),
    stage: 'fetch',
    event,
    payload: JSON.stringify({ url: 'https://example.com' }),
  });
}

describe('purgeBridgeEventsForRun', () => {
  it('deletes all events for the specified run_id', () => {
    const specDb = createHarness();
    insertEvent(specDb, 'run-purge-001');
    insertEvent(specDb, 'run-purge-001');
    insertEvent(specDb, 'run-purge-001');

    strictEqual(specDb.getBridgeEventsByRunId('run-purge-001', 100).length, 3);

    const deleted = specDb.purgeBridgeEventsForRun('run-purge-001');
    strictEqual(deleted, 3, 'purge returns 3 changes');
    strictEqual(specDb.getBridgeEventsByRunId('run-purge-001', 100).length, 0);
  });

  it('does not affect other runs', () => {
    const specDb = createHarness();
    insertEvent(specDb, 'run-keep');
    insertEvent(specDb, 'run-keep');
    insertEvent(specDb, 'run-purge');
    insertEvent(specDb, 'run-purge');

    specDb.purgeBridgeEventsForRun('run-purge');

    strictEqual(specDb.getBridgeEventsByRunId('run-keep', 100).length, 2, 'run-keep untouched');
    strictEqual(specDb.getBridgeEventsByRunId('run-purge', 100).length, 0, 'run-purge gone');
  });

  it('returns 0 when no events match', () => {
    const specDb = createHarness();
    strictEqual(specDb.purgeBridgeEventsForRun('nonexistent'), 0);
  });

  it('returns 0 for empty runId', () => {
    const specDb = createHarness();
    insertEvent(specDb, 'run-safe');
    strictEqual(specDb.purgeBridgeEventsForRun(''), 0);
    strictEqual(specDb.getBridgeEventsByRunId('run-safe', 100).length, 1, 'events preserved');
  });
});
