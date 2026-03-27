import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

function sampleEvent(overrides = {}) {
  return {
    run_id: 'run-test-001',
    category: 'mouse',
    product_id: 'mouse-razer-viper',
    ts: '2026-01-15T10:00:00.000Z',
    stage: 'fetch',
    event: 'fetch_started',
    payload: { url: 'https://razer.com/viper', worker_id: 'w-0' },
    ...overrides,
  };
}

test('insertBridgeEvent + getBridgeEventsByRunId roundtrip preserves all fields', () => {
  const { specDb } = createHarness();
  const event = sampleEvent();

  specDb.insertBridgeEvent(event);
  const rows = specDb.getBridgeEventsByRunId('run-test-001', 100);

  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.run_id, 'run-test-001');
  assert.equal(row.category, 'mouse');
  assert.equal(row.product_id, 'mouse-razer-viper');
  assert.equal(row.ts, '2026-01-15T10:00:00.000Z');
  assert.equal(row.stage, 'fetch');
  assert.equal(row.event, 'fetch_started');
  assert.deepEqual(row.payload, { url: 'https://razer.com/viper', worker_id: 'w-0' });
});

test('getBridgeEventsByRunId returns empty array for unknown runId', () => {
  const { specDb } = createHarness();
  const rows = specDb.getBridgeEventsByRunId('nonexistent-run', 100);
  assert.deepEqual(rows, []);
});

test('getBridgeEventsByRunId respects limit and returns last N in chronological order', () => {
  const { specDb } = createHarness();

  for (let i = 0; i < 5; i++) {
    specDb.insertBridgeEvent(sampleEvent({
      ts: `2026-01-15T10:0${i}:00.000Z`,
      event: `event_${i}`,
    }));
  }

  const rows = specDb.getBridgeEventsByRunId('run-test-001', 3);
  assert.equal(rows.length, 3, 'should return exactly limit rows');
  // Should be the LAST 3 events in chronological order
  assert.equal(rows[0].event, 'event_2');
  assert.equal(rows[1].event, 'event_3');
  assert.equal(rows[2].event, 'event_4');
});

test('getBridgeEventsByRunId returns rows in chronological order (not DESC)', () => {
  const { specDb } = createHarness();

  specDb.insertBridgeEvent(sampleEvent({ ts: '2026-01-15T10:00:00.000Z', event: 'first' }));
  specDb.insertBridgeEvent(sampleEvent({ ts: '2026-01-15T10:01:00.000Z', event: 'second' }));
  specDb.insertBridgeEvent(sampleEvent({ ts: '2026-01-15T10:02:00.000Z', event: 'third' }));

  const rows = specDb.getBridgeEventsByRunId('run-test-001', 100);
  assert.equal(rows[0].event, 'first');
  assert.equal(rows[1].event, 'second');
  assert.equal(rows[2].event, 'third');
});

test('insertBridgeEvent serializes object payload to JSON string', () => {
  const { specDb } = createHarness();

  specDb.insertBridgeEvent(sampleEvent({
    payload: { nested: { key: 'value' }, count: 42 },
  }));

  const rows = specDb.getBridgeEventsByRunId('run-test-001', 100);
  assert.deepEqual(rows[0].payload, { nested: { key: 'value' }, count: 42 });
});

test('insertBridgeEvent handles string payload as-is', () => {
  const { specDb } = createHarness();

  specDb.insertBridgeEvent(sampleEvent({
    payload: '{"already":"stringified"}',
  }));

  const rows = specDb.getBridgeEventsByRunId('run-test-001', 100);
  assert.deepEqual(rows[0].payload, { already: 'stringified' });
});

test('insertBridgeEvent uses defaults for missing fields', () => {
  const { specDb } = createHarness();

  specDb.insertBridgeEvent({ ts: '2026-01-15T10:00:00.000Z', event: 'minimal' });

  const rows = specDb.getBridgeEventsByRunId('', 100);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].run_id, '');
  assert.equal(rows[0].category, '');
  assert.equal(rows[0].stage, '');
  assert.deepEqual(rows[0].payload, {});
});

test('getBridgeEventsByRunId filters by run_id', () => {
  const { specDb } = createHarness();

  specDb.insertBridgeEvent(sampleEvent({ run_id: 'run-A', event: 'a' }));
  specDb.insertBridgeEvent(sampleEvent({ run_id: 'run-B', event: 'b' }));
  specDb.insertBridgeEvent(sampleEvent({ run_id: 'run-A', event: 'c' }));

  const rowsA = specDb.getBridgeEventsByRunId('run-A', 100);
  assert.equal(rowsA.length, 2);
  assert.equal(rowsA[0].event, 'a');
  assert.equal(rowsA[1].event, 'c');

  const rowsB = specDb.getBridgeEventsByRunId('run-B', 100);
  assert.equal(rowsB.length, 1);
  assert.equal(rowsB[0].event, 'b');
});
