// WHY: Wave 5.5 — runs table slimmed to product-relevant fields only.
// GUI telemetry columns removed. Tests verify the slim schema.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

function sampleRun(overrides = {}) {
  return {
    run_id: 'run-store-001',
    category: 'mouse',
    product_id: 'mouse-razer-viper',
    status: 'running',
    started_at: '2026-03-26T10:00:00.000Z',
    ended_at: '',
    stage_cursor: 'stage:bootstrap',
    identity_fingerprint: 'fp-abc123',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
    s3key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
    out_root: '/tmp/indexlab',
    counters: { pages_checked: 0, fetched_ok: 0 },
    ...overrides,
  };
}

test('upsertRun + getRunByRunId roundtrip — objects auto-serialized', () => {
  const { specDb } = createHarness();
  const row = sampleRun({
    counters: { pages_checked: 5, fetched_ok: 3 },
  });

  specDb.upsertRun(row);
  const result = specDb.getRunByRunId('run-store-001');

  assert.ok(result, 'row should exist');
  assert.equal(result.run_id, 'run-store-001');
  assert.equal(result.status, 'running');
  assert.deepEqual(result.counters, { pages_checked: 5, fetched_ok: 3 });
});

test('upsertRun accepts pre-serialized string JSON for counters', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({
    counters: '{"pages_checked":10}',
  }));

  const result = specDb.getRunByRunId('run-store-001');
  assert.deepEqual(result.counters, { pages_checked: 10 });
});

test('upsertRun conflict path updates all columns on same run_id', () => {
  const { specDb } = createHarness();

  specDb.upsertRun(sampleRun());
  const before = specDb.getRunByRunId('run-store-001');
  assert.equal(before.status, 'running');

  specDb.upsertRun(sampleRun({
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
    stage_cursor: 'completed',
    counters: { pages_checked: 50, fetched_ok: 40 },
  }));
  const after = specDb.getRunByRunId('run-store-001');

  assert.equal(after.status, 'completed');
  assert.equal(after.ended_at, '2026-03-26T10:30:00.000Z');
  assert.equal(after.stage_cursor, 'completed');
  assert.deepEqual(after.counters, { pages_checked: 50, fetched_ok: 40 });

  const count = specDb.db.prepare('SELECT COUNT(*) as c FROM runs WHERE run_id = ?').get('run-store-001');
  assert.equal(count.c, 1);
});

test('getRunByRunId returns null for unknown run_id', () => {
  const { specDb } = createHarness();
  const result = specDb.getRunByRunId('nonexistent-run');
  assert.equal(result, null);
});

test('getRunsByCategory returns runs filtered by category, newest first', () => {
  const { specDb } = createHarness();

  specDb.upsertRun(sampleRun({ run_id: 'run-a', category: 'mouse' }));
  specDb.upsertRun(sampleRun({ run_id: 'run-b', category: 'keyboard' }));
  specDb.upsertRun(sampleRun({ run_id: 'run-c', category: 'mouse' }));

  const mouseRuns = specDb.getRunsByCategory('mouse');
  assert.equal(mouseRuns.length, 2);
  assert.equal(mouseRuns[0].run_id, 'run-c', 'newest first');
  assert.equal(mouseRuns[1].run_id, 'run-a');

  const keyboardRuns = specDb.getRunsByCategory('keyboard');
  assert.equal(keyboardRuns.length, 1);
  assert.equal(keyboardRuns[0].run_id, 'run-b');
});

test('getRunsByCategory respects limit', () => {
  const { specDb } = createHarness();

  for (let i = 0; i < 5; i++) {
    specDb.upsertRun(sampleRun({ run_id: `run-${i}` }));
  }

  const limited = specDb.getRunsByCategory('mouse', 3);
  assert.equal(limited.length, 3);
});

test('getRunsByCategory returns empty array for unknown category', () => {
  const { specDb } = createHarness();
  const result = specDb.getRunsByCategory('nonexistent');
  assert.deepEqual(result, []);
});

test('identity fields roundtrip correctly', () => {
  const { specDb } = createHarness();

  specDb.upsertRun(sampleRun({
    identity_fingerprint: 'fp-xyz',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
  }));
  const result = specDb.getRunByRunId('run-store-001');
  assert.equal(result.identity_fingerprint, 'fp-xyz');
  assert.equal(result.identity_lock_status, 'locked');
  assert.equal(result.dedupe_mode, 'content_hash');
});
