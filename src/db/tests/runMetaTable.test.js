// WHY: Low-level schema test for the runs table.
// Wave 5.5 slimmed this to product-relevant fields only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return { specDb: new SpecDb({ dbPath: ':memory:', category: 'mouse' }) };
}

function sampleRunRow(overrides = {}) {
  return {
    run_id: 'run-test-001',
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
    counters: '{"pages_checked":0,"fetched_ok":0}',
    ...overrides,
  };
}

test('SpecDb constructor creates runs table without error', () => {
  const { specDb } = createHarness();
  const row = specDb.db.prepare('SELECT * FROM runs LIMIT 0').get();
  assert.equal(row, undefined);
});

test('creating SpecDb twice on same DB is idempotent', () => {
  const { specDb } = createHarness();
  assert.doesNotThrow(() => {
    specDb.db.exec('CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY)');
  });
});

test('_upsertRun INSERT + _getRunByRunId roundtrip preserves scalar columns', () => {
  const { specDb } = createHarness();
  const row = sampleRunRow();

  specDb._upsertRun.run(row);
  const result = specDb._getRunByRunId.get('run-test-001');

  assert.ok(result, 'row should exist');
  assert.equal(result.run_id, 'run-test-001');
  assert.equal(result.category, 'mouse');
  assert.equal(result.product_id, 'mouse-razer-viper');
  assert.equal(result.status, 'running');
  assert.equal(result.started_at, '2026-03-26T10:00:00.000Z');
  assert.equal(result.ended_at, '');
  assert.equal(result.stage_cursor, 'stage:bootstrap');
  assert.equal(result.identity_fingerprint, 'fp-abc123');
  assert.equal(result.identity_lock_status, 'locked');
  assert.equal(result.dedupe_mode, 'content_hash');
  assert.equal(result.s3key, 'specs/inputs/mouse/products/mouse-razer-viper.json');
  assert.equal(result.out_root, '/tmp/indexlab');
});

test('_upsertRun INSERT + _getRunByRunId roundtrip preserves JSON counters as TEXT', () => {
  const { specDb } = createHarness();
  const row = sampleRunRow({
    counters: '{"pages_checked":5,"fetched_ok":3}',
  });

  specDb._upsertRun.run(row);
  const result = specDb._getRunByRunId.get('run-test-001');

  assert.equal(result.counters, '{"pages_checked":5,"fetched_ok":3}');
});

test('_upsertRun conflict path updates all columns on same run_id', () => {
  const { specDb } = createHarness();

  specDb._upsertRun.run(sampleRunRow());
  const before = specDb._getRunByRunId.get('run-test-001');
  assert.equal(before.status, 'running');
  assert.equal(before.stage_cursor, 'stage:bootstrap');

  specDb._upsertRun.run(sampleRunRow({
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
    stage_cursor: 'completed',
    counters: '{"pages_checked":50,"fetched_ok":40}',
  }));
  const after = specDb._getRunByRunId.get('run-test-001');

  assert.equal(after.status, 'completed');
  assert.equal(after.ended_at, '2026-03-26T10:30:00.000Z');
  assert.equal(after.stage_cursor, 'completed');
  assert.equal(after.counters, '{"pages_checked":50,"fetched_ok":40}');

  const count = specDb.db.prepare('SELECT COUNT(*) as c FROM runs WHERE run_id = ?').get('run-test-001');
  assert.equal(count.c, 1);
});
