import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';

function createMockSpecDb() {
  const rows = [];
  return {
    rows,
    insertBridgeEvent(event) { rows.push({ ...event }); },
  };
}

test('emit() writes to bridge_events SQL when state.specDb is set', async () => {
  const specDb = createMockSpecDb();
  const { bridge } = await makeBridge({ specDb });
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_queued',
    ts: '2026-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
    host: 'razer.com',
    worker_id: 'w-0',
  }));
  await bridge.queue;

  assert.ok(specDb.rows.length > 0, 'should have written at least one bridge event to SQL');
  const fetchQueued = specDb.rows.find((r) => r.event === 'fetch_queued');
  assert.ok(fetchQueued, 'bridge should rename source_fetch_queued to fetch_queued in SQL');
  assert.equal(fetchQueued.stage, 'fetch');
  assert.equal(typeof fetchQueued.payload, 'string', 'payload should be JSON-stringified');
});

test('emit() does NOT call insertBridgeEvent when specDb is null', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_queued',
    ts: '2026-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
  }));
  await bridge.queue;

  // Events still emitted to NDJSON/onEvent — just no SQL
  const fetchQueued = events.find((e) => e.event === 'fetch_queued');
  assert.ok(fetchQueued, 'event should still be emitted to NDJSON/onEvent');
});

test('emit() continues when insertBridgeEvent throws (best-effort)', async () => {
  const specDb = {
    insertBridgeEvent() { throw new Error('DB locked'); },
  };
  const { bridge, events } = await makeBridge({ specDb });
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'source_fetch_queued',
    ts: '2026-01-01T00:00:30Z',
    url: 'https://razer.com/viper',
  }));
  await bridge.queue;

  // Should not throw — event still emitted to NDJSON/onEvent
  const fetchQueued = events.find((e) => e.event === 'fetch_queued');
  assert.ok(fetchQueued, 'event should still be emitted despite SQL error');
});

test('emit() writes correct shape: run_id, category, product_id, ts, stage, event, payload', async () => {
  const specDb = createMockSpecDb();
  const { bridge } = await makeBridge({ specDb });
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'needset_computed',
    ts: '2026-01-01T00:05:00Z',
    total_fields: 42,
  }));
  await bridge.queue;

  const needset = specDb.rows.find((r) => r.event === 'needset_computed');
  assert.ok(needset, 'needset_computed should be in SQL');
  assert.equal(needset.run_id, 'run-audit-001');
  assert.equal(needset.category, 'mouse');
  assert.equal(needset.product_id, 'mouse-test-01');
  assert.ok(needset.ts, 'ts must be present');
  assert.equal(needset.stage, 'index');
  assert.equal(typeof needset.payload, 'string');
});
