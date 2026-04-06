import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';

import {
  cleanupTempRoot,
  createMockRes,
  createRunFixture,
  createRuntimeOpsHandler,
  createRuntimeOpsRoot,
  initIndexLabDataBuilders,
  createStorageStub,
  parseResBody,
} from './helpers/runtimeOpsRoutesHarness.js';

test('prefetch returns SQL artifacts when specDb has data', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-sql-prefetch-');
  const runId = 'run-sql-prefetch-001';
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: { run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
            started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z' },
    events: [],
  });

  // WHY: readIndexLabRunMeta is SQL-only — seed the run so meta resolves.
  specDb.upsertRun({
    run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
    started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z',
    stage_cursor: '', identity_fingerprint: '', identity_lock_status: '',
    dedupe_mode: '', s3key: '', out_root: '', counters: {},
  });
  specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'needset', category: 'mouse',
    payload: { total_fields: 12, fields: [], summary: { total: 12, resolved: 8 } } });
  specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'search_profile', category: 'mouse',
    payload: { status: 'executed', query_count: 5 } });
  specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'brand_resolution', category: 'mouse',
    payload: { brand: 'TestBrand', status: 'resolved' } });

  initIndexLabDataBuilders({
    indexLabRoot, outputRoot, storage: createStorageStub(), config: {},
    getSpecDbReady: async () => specDb, isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot, outputRoot,
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      getSpecDbReady: async () => specDb,
      // WHY: readIndexLabRunMeta is SQL-only; provide mock so the route doesn't 404.
      readIndexLabRunMeta: async () => ({ run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed' }),
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body, 'response should exist');
    assert.ok(body.needset, 'needset should be populated from SQL');
    assert.equal(body.needset.total_fields, 12);
    assert.ok(body.brand_resolution, 'brand_resolution should be populated from SQL');
    assert.equal(body.brand_resolution.brand, 'TestBrand');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('prefetch returns null needset when specDb has no artifact data (no file fallback)', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-sql-fallback-');
  const runId = 'run-sql-fallback-001';
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: { run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
            started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z' },
    events: [],
  });

  // WHY: readIndexLabRunMeta is SQL-only — seed the run so meta resolves.
  specDb.upsertRun({
    run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
    started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z',
    stage_cursor: '', identity_fingerprint: '', identity_lock_status: '',
    dedupe_mode: '', s3key: '', out_root: '', counters: {},
  });

  initIndexLabDataBuilders({
    indexLabRoot, outputRoot, storage: createStorageStub(), config: {},
    getSpecDbReady: async () => specDb, isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot, outputRoot,
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      getSpecDbReady: async () => specDb,
      // WHY: readIndexLabRunMeta is SQL-only; provide mock so the route doesn't 404.
      readIndexLabRunMeta: async () => ({ run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed' }),
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body);
    // WHY: Wave 5.5 killed file fallbacks — SQL is sole source. No SQL data → empty needset.
    assert.equal(body.needset?.total_fields ?? 0, 0, 'needset should have no fields when SQL has no data');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('prefetch returns null needset when getSpecDbReady is null (no file fallback)', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-sql-null-');
  const runId = 'run-sql-null-001';

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: { run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
            started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z' },
    events: [],
  });

  initIndexLabDataBuilders({
    indexLabRoot, outputRoot, storage: createStorageStub(), config: {},
    getSpecDbReady: () => false, isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot, outputRoot,
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      // WHY: readIndexLabRunMeta is SQL-only; no specDb available, provide mock so route doesn't 404.
      readIndexLabRunMeta: async () => ({ run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed' }),
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body);
    // WHY: Wave 5.5 killed file fallbacks — no specDb means no artifacts → empty needset.
    assert.equal(body.needset?.total_fields ?? 0, 0, 'needset should have no fields without specDb');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
