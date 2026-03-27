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
    phase_cursor: 'phase_00_bootstrap',
    boot_step: 'loading_config',
    boot_progress: 25,
    identity_fingerprint: 'fp-abc123',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
    s3key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
    out_root: '/tmp/indexlab',
    counters: '{"pages_checked":0,"fetched_ok":0}',
    stages: '{"search":{"started_at":"","ended_at":""},"fetch":{"started_at":"","ended_at":""}}',
    startup_ms: '{"first_event":null,"search_started":null}',
    browser_pool: null,
    needset_summary: null,
    search_profile_summary: null,
    artifacts: '{"has_needset":false,"has_search_profile":false}',
    extra: '{}',
    ...overrides,
  };
}

test('SpecDb constructor creates runs table without error', () => {
  const { specDb } = createHarness();
  // Should not throw — table exists
  const row = specDb.db.prepare('SELECT * FROM runs LIMIT 0').get();
  assert.equal(row, undefined);
});

test('creating SpecDb twice on same DB is idempotent', () => {
  const { specDb } = createHarness();
  // Re-exec schema on same db handle — should not throw
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
  assert.equal(result.phase_cursor, 'phase_00_bootstrap');
  assert.equal(result.boot_step, 'loading_config');
  assert.equal(result.boot_progress, 25);
  assert.equal(result.identity_fingerprint, 'fp-abc123');
  assert.equal(result.identity_lock_status, 'locked');
  assert.equal(result.dedupe_mode, 'content_hash');
  assert.equal(result.s3key, 'specs/inputs/mouse/products/mouse-razer-viper.json');
  assert.equal(result.out_root, '/tmp/indexlab');
});

test('_upsertRun INSERT + _getRunByRunId roundtrip preserves JSON columns as TEXT', () => {
  const { specDb } = createHarness();
  const row = sampleRunRow({
    counters: '{"pages_checked":5,"fetched_ok":3}',
    stages: '{"search":{"started_at":"2026-03-26T10:01:00.000Z","ended_at":""}}',
    startup_ms: '{"first_event":120,"search_started":450}',
    browser_pool: '{"browsers":2,"slots":4}',
    needset_summary: '{"total_fields":12,"generated_at":"2026-03-26T10:02:00.000Z"}',
    search_profile_summary: '{"status":"planned","query_count":8}',
    artifacts: '{"has_needset":true,"has_search_profile":true}',
    extra: '{"run_base":"specs/outputs/mouse/run-test-001"}',
  });

  specDb._upsertRun.run(row);
  const result = specDb._getRunByRunId.get('run-test-001');

  assert.equal(result.counters, '{"pages_checked":5,"fetched_ok":3}');
  assert.equal(result.stages, '{"search":{"started_at":"2026-03-26T10:01:00.000Z","ended_at":""}}');
  assert.equal(result.startup_ms, '{"first_event":120,"search_started":450}');
  assert.equal(result.browser_pool, '{"browsers":2,"slots":4}');
  assert.equal(result.needset_summary, '{"total_fields":12,"generated_at":"2026-03-26T10:02:00.000Z"}');
  assert.equal(result.search_profile_summary, '{"status":"planned","query_count":8}');
  assert.equal(result.artifacts, '{"has_needset":true,"has_search_profile":true}');
  assert.equal(result.extra, '{"run_base":"specs/outputs/mouse/run-test-001"}');
});

test('_upsertRun conflict path updates all columns on same run_id', () => {
  const { specDb } = createHarness();

  specDb._upsertRun.run(sampleRunRow());
  const before = specDb._getRunByRunId.get('run-test-001');
  assert.equal(before.status, 'running');
  assert.equal(before.phase_cursor, 'phase_00_bootstrap');

  specDb._upsertRun.run(sampleRunRow({
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
    phase_cursor: 'completed',
    boot_progress: 100,
    counters: '{"pages_checked":50,"fetched_ok":40}',
    extra: '{"run_base":"specs/outputs/mouse/run-test-001","latest_base":"specs/outputs/mouse/latest"}',
  }));
  const after = specDb._getRunByRunId.get('run-test-001');

  assert.equal(after.status, 'completed');
  assert.equal(after.ended_at, '2026-03-26T10:30:00.000Z');
  assert.equal(after.phase_cursor, 'completed');
  assert.equal(after.boot_progress, 100);
  assert.equal(after.counters, '{"pages_checked":50,"fetched_ok":40}');
  assert.equal(after.extra, '{"run_base":"specs/outputs/mouse/run-test-001","latest_base":"specs/outputs/mouse/latest"}');
  // Verify only 1 row exists (upsert, not duplicate)
  const count = specDb.db.prepare('SELECT COUNT(*) as c FROM runs WHERE run_id = ?').get('run-test-001');
  assert.equal(count.c, 1);
});

test('_getRunByRunId returns undefined for unknown run_id', () => {
  const { specDb } = createHarness();
  const result = specDb._getRunByRunId.get('nonexistent-run');
  assert.equal(result, undefined);
});
