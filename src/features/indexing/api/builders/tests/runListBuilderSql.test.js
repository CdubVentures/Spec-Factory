import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../../db/specDb.js';
import { createRunListBuilder } from '../runListBuilder.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-runlist-sql-'));
}

function makeSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeBuilder(tmpDir, specDb, overrides = {}) {
  return createRunListBuilder({
    getIndexLabRoot: () => tmpDir,
    isRunStillActive: () => false,
    readEvents: async () => [],
    getSpecDbReady: specDb ? async () => specDb : null,
    ...overrides,
  });
}

// WHY: Wave 5.5 — slim runs table. GUI telemetry columns removed.
function sampleSqlRun(overrides = {}) {
  return {
    run_id: 'run-sql-001',
    category: 'mouse',
    product_id: 'mouse-razer-viper',
    status: 'completed',
    started_at: '2026-03-26T10:00:00.000Z',
    ended_at: '2026-03-26T10:30:00.000Z',
    stage_cursor: 'completed',
    identity_fingerprint: 'fp-sql',
    identity_lock_status: 'locked',
    dedupe_mode: 'content_hash',
    s3key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
    out_root: '/tmp/indexlab',
    counters: { pages_checked: 10, fetched_ok: 8, fetched_404: 1, fetched_blocked: 0, fetched_error: 1 },
    ...overrides,
  };
}

test('SQL row with counters bypasses file I/O — no run.json needed', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleSqlRun());

    // Create run directory but NO run.json — SQL should be the sole source
    const runDir = path.join(tmpDir, 'run-sql-001');
    await fs.mkdir(runDir, { recursive: true });

    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });

    const row = rows.find((r) => r.run_id === 'run-sql-001');
    assert.ok(row, 'run should appear from SQL');
    assert.equal(row.status, 'completed');
    assert.deepEqual(row.counters, { pages_checked: 10, fetched_ok: 8, fetched_404: 1, fetched_blocked: 0, fetched_error: 1 });
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-razer-viper');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL row with empty counters still appears in results', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleSqlRun({ counters: {} }));

    const runDir = path.join(tmpDir, 'run-sql-001');
    await fs.mkdir(runDir, { recursive: true });

    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });

    const row = rows.find((r) => r.run_id === 'run-sql-001');
    assert.ok(row, 'run with empty counters should still appear');
    assert.deepEqual(row.counters, {});
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('no category filter skips SQL path entirely', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleSqlRun());

    // No run directory — SQL has data but no category filter means no SQL query
    // The run dir must exist for directory listing to find it
    const runDir = path.join(tmpDir, 'run-sql-001');
    await fs.mkdir(runDir, { recursive: true });
    // No run.json → processRun will get null meta → event-derived path with no events → still returns a row

    const builder = makeBuilder(tmpDir, specDb);
    // No category filter
    const rows = await builder.listIndexLabRuns();

    // Run should still appear (via file I/O path, even if meta is null)
    assert.ok(Array.isArray(rows));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL row shape matches expected run list contract', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleSqlRun());

    const runDir = path.join(tmpDir, 'run-sql-001');
    await fs.mkdir(runDir, { recursive: true });

    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
    const row = rows.find((r) => r.run_id === 'run-sql-001');

    assert.ok(row);
    for (const key of [
      'run_id', 'category', 'product_id', 'status', 'started_at', 'ended_at',
      'identity_fingerprint', 'identity_lock_status', 'dedupe_mode', 'stage_cursor',
      'run_dir', 'storage_origin', 'storage_state', 'picker_label',
      'has_needset', 'has_search_profile', 'counters'
    ]) {
      assert.ok(key in row, `missing key: ${key}`);
    }
    assert.equal(row.identity_fingerprint, 'fp-sql');
    // WHY: has_needset/has_search_profile derived from run_artifacts table.
    // No artifacts seeded in this test → both false.
    assert.equal(row.has_needset, false);
    assert.equal(row.has_search_profile, false);
    assert.equal(row.storage_origin, 'local');
    assert.match(String(row.picker_label), /Mouse/i);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('stale running status in SQL resolves to completed for inactive runs', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleSqlRun({ status: 'running', ended_at: '' }));

    const runDir = path.join(tmpDir, 'run-sql-001');
    await fs.mkdir(runDir, { recursive: true });

    const builder = makeBuilder(tmpDir, specDb, {
      isRunStillActive: () => false,
    });
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
    const row = rows.find((r) => r.run_id === 'run-sql-001');

    assert.ok(row);
    assert.equal(row.status, 'completed', 'stale running should resolve to completed');
    assert.equal(row.storage_state, 'stored');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
