import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writeRunMeta } from '../runtimeBridgeArtifacts.js';
import { SpecDb } from '../../db/specDb.js';

async function makeTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sf-runmeta-'));
}

function buildMockState(overrides = {}) {
  return {
    runId: 'run-meta-001',
    runMetaPath: '', // set by test
    startedAt: '2026-03-26T10:00:00.000Z',
    endedAt: '',
    status: 'running',
    context: { category: 'mouse', productId: 'mouse-razer-viper', s3Key: 'specs/inputs/mouse/products/mouse-razer-viper.json' },
    outRoot: '/tmp/indexlab',
    eventsPath: '/tmp/indexlab/run-meta-001/run_events.ndjson',
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
    needSetPath: '/tmp/indexlab/run-meta-001/needset.json',
    searchProfilePath: '/tmp/indexlab/run-meta-001/search_profile.json',
    brandResolutionPath: '/tmp/indexlab/run-meta-001/brand_resolution.json',
    specDb: null,
    ...overrides,
  };
}

test('writeRunMeta default writes SQL only — no JSON file created', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state);

    const jsonExists = await fs.stat(runMetaPath).then(() => true).catch(() => false);
    assert.equal(jsonExists, false, 'run.json should NOT be created by default');

    const sqlRow = specDb.getRunByRunId('run-meta-001');
    assert.ok(sqlRow, 'SQL row should exist');
    assert.equal(sqlRow.status, 'running');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('writeRunMeta with writeJson: true writes both JSON and SQL', async () => {
  const tmpDir = await makeTmpDir();
  try {
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    const runMetaPath = path.join(tmpDir, 'run.json');
    const state = buildMockState({ runMetaPath, specDb });

    await writeRunMeta(state, {}, { writeJson: true });

    const jsonExists = await fs.stat(runMetaPath).then(() => true).catch(() => false);
    assert.ok(jsonExists, 'run.json should exist with writeJson: true');

    const jsonDoc = JSON.parse(await fs.readFile(runMetaPath, 'utf8'));
    assert.equal(jsonDoc.run_id, 'run-meta-001');

    const sqlRow = specDb.getRunByRunId('run-meta-001');
    assert.ok(sqlRow, 'SQL row should also exist');
    assert.equal(sqlRow.run_id, 'run-meta-001');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('SQL row has correct data from mid-run call without JSON', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ specDb });

  await writeRunMeta(state);

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.equal(sqlRow.category, 'mouse');
  assert.equal(sqlRow.product_id, 'mouse-razer-viper');
  assert.equal(sqlRow.phase_cursor, 'phase_02_search');
  assert.equal(sqlRow.identity_fingerprint, 'fp-test');
  assert.deepEqual(sqlRow.counters, { pages_checked: 5, fetched_ok: 3, fetched_404: 0, fetched_blocked: 0, fetched_error: 0 });
  assert.deepEqual(sqlRow.browser_pool, { browsers: 2, slots: 4 });
  assert.deepEqual(sqlRow.needset_summary, { total_fields: 12, generated_at: '2026-03-26T10:02:00.000Z', summary: 'test', rows_count: 3 });
});

test('extra fields (run_base, latest_base) land in SQL extra column', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ specDb });

  await writeRunMeta(state, {
    status: 'completed',
    ended_at: '2026-03-26T10:30:00.000Z',
    run_base: 'specs/outputs/mouse/run-meta-001',
    latest_base: 'specs/outputs/mouse/latest',
  });

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.equal(sqlRow.status, 'completed');
  assert.deepEqual(sqlRow.extra, {
    run_base: 'specs/outputs/mouse/run-meta-001',
    latest_base: 'specs/outputs/mouse/latest',
  });
});

test('SQL write is best-effort — no crash if specDb is null', async () => {
  const state = buildMockState({ specDb: null });
  // Should not throw
  await writeRunMeta(state);
});

test('guard uses runId not runMetaPath — works without runMetaPath', async () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  const state = buildMockState({ runMetaPath: '', specDb });

  await writeRunMeta(state);

  const sqlRow = specDb.getRunByRunId('run-meta-001');
  assert.ok(sqlRow, 'SQL row should exist even without runMetaPath');
  assert.equal(sqlRow.status, 'running');
});
