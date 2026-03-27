import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeRunMeta } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-dual-write-'));
}

function buildMockState(overrides = {}) {
  return {
    runId: 'run-dual-001',
    runMetaPath: '', // set by test
    startedAt: '2026-03-26T10:00:00.000Z',
    endedAt: '',
    status: 'running',
    context: { category: 'mouse', productId: 'mouse-razer-viper', s3Key: 'specs/inputs/mouse/products/mouse-razer-viper.json' },
    outRoot: '/tmp/indexlab',
    eventsPath: '/tmp/indexlab/run-dual-001/run_events.ndjson',
    counters: { pages_checked: 5, fetched_ok: 3, fetched_404: 0, fetched_blocked: 0, fetched_error: 0 },
    stageState: { search: { started_at: '2026-03-26T10:01:00.000Z', ended_at: '' }, fetch: { started_at: '', ended_at: '' } },
    identityFingerprint: 'fp-test',
    identityLockStatus: 'locked',
    dedupeMode: 'content_hash',
    phaseCursor: 'phase_02_search',
    bootStep: 'ready',
    bootProgress: 100,
    browserPool: { browsers: 2, slots: 4 },
    startupMs: { first_event: 120, search_started: 450 },
    needSet: { total_fields: 12, generated_at: '2026-03-26T10:02:00.000Z', summary: 'test', rows: [1, 2, 3] },
    searchProfile: { status: 'planned', query_count: 8, generated_at: '2026-03-26T10:02:00.000Z' },
    needSetPath: '/tmp/indexlab/run-dual-001/needset.json',
    searchProfilePath: '/tmp/indexlab/run-dual-001/search_profile.json',
    brandResolutionPath: '/tmp/indexlab/run-dual-001/brand_resolution.json',
    specDb: null, // set by test
    ...overrides,
  };
}

test('writeRunMeta writes both JSON file and SQL row', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state);

    const jsonExists = await fs.stat(runMetaPath).then(() => true).catch(() => false);
    assert.ok(jsonExists, 'run.json should exist');

    const sqlRow = specDb.getRunByRunId('run-dual-001');
    assert.ok(sqlRow, 'SQL row should exist');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('JSON doc and SQL row have matching scalar fields', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state);

    const jsonDoc = JSON.parse(await fs.readFile(runMetaPath, 'utf8'));
    const sqlRow = specDb.getRunByRunId('run-dual-001');

    assert.equal(sqlRow.run_id, jsonDoc.run_id);
    assert.equal(sqlRow.category, jsonDoc.category);
    assert.equal(sqlRow.product_id, jsonDoc.product_id);
    assert.equal(sqlRow.status, jsonDoc.status);
    assert.equal(sqlRow.started_at, jsonDoc.started_at);
    assert.equal(sqlRow.ended_at, jsonDoc.ended_at);
    assert.equal(sqlRow.phase_cursor, jsonDoc.phase_cursor);
    assert.equal(sqlRow.boot_step, jsonDoc.boot_step);
    assert.equal(sqlRow.boot_progress, jsonDoc.boot_progress);
    assert.equal(sqlRow.identity_fingerprint, jsonDoc.identity_fingerprint);
    assert.equal(sqlRow.identity_lock_status, jsonDoc.identity_lock_status);
    assert.equal(sqlRow.dedupe_mode, jsonDoc.dedupe_mode);
    assert.equal(sqlRow.s3key, jsonDoc.s3key);
    assert.equal(sqlRow.out_root, jsonDoc.out_root);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('JSON doc and SQL row have matching JSON fields', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state);

    const jsonDoc = JSON.parse(await fs.readFile(runMetaPath, 'utf8'));
    const sqlRow = specDb.getRunByRunId('run-dual-001');

    assert.deepEqual(sqlRow.counters, jsonDoc.counters);
    assert.deepEqual(sqlRow.stages, jsonDoc.stages);
    assert.deepEqual(sqlRow.startup_ms, jsonDoc.startup_ms);
    assert.deepEqual(sqlRow.browser_pool, jsonDoc.browser_pool);
    assert.deepEqual(sqlRow.needset_summary, jsonDoc.needset);
    assert.deepEqual(sqlRow.search_profile_summary, jsonDoc.search_profile);
    assert.deepEqual(sqlRow.artifacts, jsonDoc.artifacts);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extra fields (run_base, latest_base) land in SQL extra column', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state, {
      status: 'completed',
      ended_at: '2026-03-26T10:30:00.000Z',
      run_base: 'specs/outputs/mouse/run-dual-001',
      latest_base: 'specs/outputs/mouse/latest',
    });

    const sqlRow = specDb.getRunByRunId('run-dual-001');
    assert.equal(sqlRow.status, 'completed');
    assert.equal(sqlRow.ended_at, '2026-03-26T10:30:00.000Z');
    assert.deepEqual(sqlRow.extra, {
      run_base: 'specs/outputs/mouse/run-dual-001',
      latest_base: 'specs/outputs/mouse/latest',
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL write is best-effort — JSON still written if specDb is null', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb: null });

    await writeRunMeta(state);

    const jsonExists = await fs.stat(runMetaPath).then(() => true).catch(() => false);
    assert.ok(jsonExists, 'run.json should still be written');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL write is best-effort — JSON still written if specDb.upsertRun throws', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const fakeSpecDb = {
      upsertRun() { throw new Error('simulated SQL failure'); }
    };
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb: fakeSpecDb });

    await writeRunMeta(state);

    const jsonExists = await fs.stat(runMetaPath).then(() => true).catch(() => false);
    assert.ok(jsonExists, 'run.json should still be written despite SQL failure');

    const jsonDoc = JSON.parse(await fs.readFile(runMetaPath, 'utf8'));
    assert.equal(jsonDoc.run_id, 'run-dual-001');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
