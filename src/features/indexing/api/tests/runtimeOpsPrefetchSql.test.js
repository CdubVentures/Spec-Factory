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
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      getSpecDbReady: async () => specDb,
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

test('prefetch falls back to file I/O when specDb has no artifact data', async () => {
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

  // Write needset.json on disk but NOT in SQL — should fall back to file
  const fs = await import('node:fs/promises');
  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(path.join(runDir, 'needset.json'),
    JSON.stringify({ total_fields: 99, fields: [], summary: {} }), 'utf8');

  initIndexLabDataBuilders({
    indexLabRoot, outputRoot, storage: createStorageStub(), config: {},
    getSpecDbReady: async () => specDb, isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot, outputRoot,
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      getSpecDbReady: async () => specDb,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body);
    assert.equal(body.needset?.total_fields, 99, 'should get needset from file fallback');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('prefetch falls back to file I/O when getSpecDbReady is null', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-sql-null-');
  const runId = 'run-sql-null-001';

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: { run_id: runId, category: 'mouse', product_id: 'mouse-test', status: 'completed',
            started_at: '2026-03-26T10:00:00Z', ended_at: '2026-03-26T10:30:00Z' },
    events: [],
  });

  const fs = await import('node:fs/promises');
  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(path.join(runDir, 'needset.json'),
    JSON.stringify({ total_fields: 77 }), 'utf8');

  initIndexLabDataBuilders({
    indexLabRoot, outputRoot, storage: createStorageStub(), config: {},
    getSpecDbReady: () => false, isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot, outputRoot,
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      // No getSpecDbReady — should gracefully fall back
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body);
    assert.equal(body.needset?.total_fields, 77, 'should get needset from file without specDb');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
