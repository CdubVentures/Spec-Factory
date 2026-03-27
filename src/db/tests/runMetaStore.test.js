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
    phase_cursor: 'phase_00_bootstrap',
    boot_step: 'loading_config',
    boot_progress: 25,
    identity_fingerprint: 'fp-abc123',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
    s3key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
    out_root: '/tmp/indexlab',
    counters: { pages_checked: 0, fetched_ok: 0 },
    stages: { search: { started_at: '', ended_at: '' }, fetch: { started_at: '', ended_at: '' } },
    startup_ms: { first_event: null, search_started: null },
    browser_pool: null,
    needset_summary: null,
    search_profile_summary: null,
    artifacts: { has_needset: false, has_search_profile: false },
    extra: {},
    ...overrides,
  };
}

test('upsertRun + getRunByRunId roundtrip — objects auto-serialized', () => {
  const { specDb } = createHarness();
  const row = sampleRun({
    counters: { pages_checked: 5, fetched_ok: 3 },
    stages: { search: { started_at: '2026-03-26T10:01:00.000Z', ended_at: '' } },
    startup_ms: { first_event: 120, search_started: 450 },
    artifacts: { has_needset: true, has_search_profile: false },
    extra: { run_base: 'specs/outputs/mouse/run-store-001' },
  });

  specDb.upsertRun(row);
  const result = specDb.getRunByRunId('run-store-001');

  assert.ok(result, 'row should exist');
  assert.equal(result.run_id, 'run-store-001');
  assert.equal(result.status, 'running');
  assert.deepEqual(result.counters, { pages_checked: 5, fetched_ok: 3 });
  assert.deepEqual(result.stages, { search: { started_at: '2026-03-26T10:01:00.000Z', ended_at: '' } });
  assert.deepEqual(result.startup_ms, { first_event: 120, search_started: 450 });
  assert.deepEqual(result.artifacts, { has_needset: true, has_search_profile: false });
  assert.deepEqual(result.extra, { run_base: 'specs/outputs/mouse/run-store-001' });
});

test('upsertRun accepts pre-serialized string JSON columns', () => {
  const { specDb } = createHarness();
  specDb.upsertRun(sampleRun({
    counters: '{"pages_checked":10}',
    stages: '{"search":{"started_at":"T","ended_at":""}}',
    artifacts: '{"has_needset":true}',
  }));

  const result = specDb.getRunByRunId('run-store-001');
  assert.deepEqual(result.counters, { pages_checked: 10 });
  assert.deepEqual(result.stages, { search: { started_at: 'T', ended_at: '' } });
  assert.deepEqual(result.artifacts, { has_needset: true });
});

test('upsertRun conflict path updates all columns on same run_id', () => {
  const { specDb } = createHarness();

  specDb.upsertRun(sampleRun());
  const before = specDb.getRunByRunId('run-store-001');
  assert.equal(before.status, 'running');

  specDb.upsertRun(sampleRun({
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
    phase_cursor: 'completed',
    boot_progress: 100,
    counters: { pages_checked: 50, fetched_ok: 40 },
    extra: { run_base: 'base', latest_base: 'latest' },
  }));
  const after = specDb.getRunByRunId('run-store-001');

  assert.equal(after.status, 'completed');
  assert.equal(after.ended_at, '2026-03-26T10:30:00.000Z');
  assert.equal(after.phase_cursor, 'completed');
  assert.equal(after.boot_progress, 100);
  assert.deepEqual(after.counters, { pages_checked: 50, fetched_ok: 40 });
  assert.deepEqual(after.extra, { run_base: 'base', latest_base: 'latest' });

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

test('nullable JSON columns — browser_pool, needset_summary, search_profile_summary', () => {
  const { specDb } = createHarness();

  specDb.upsertRun(sampleRun({
    browser_pool: null,
    needset_summary: null,
    search_profile_summary: null,
  }));
  const withNulls = specDb.getRunByRunId('run-store-001');
  assert.equal(withNulls.browser_pool, null);
  assert.equal(withNulls.needset_summary, null);
  assert.equal(withNulls.search_profile_summary, null);

  specDb.upsertRun(sampleRun({
    browser_pool: { browsers: 2, slots: 4 },
    needset_summary: { total_fields: 12 },
    search_profile_summary: { status: 'planned', query_count: 8 },
  }));
  const withValues = specDb.getRunByRunId('run-store-001');
  assert.deepEqual(withValues.browser_pool, { browsers: 2, slots: 4 });
  assert.deepEqual(withValues.needset_summary, { total_fields: 12 });
  assert.deepEqual(withValues.search_profile_summary, { status: 'planned', query_count: 8 });
});
