import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  cleanupTempRoot,
  createArchivedS3StorageStub,
  createMockRes,
  createRunFixture,
  createRuntimeOpsHandler,
  createRuntimeOpsRoot,
  createStorageStub,
  initIndexLabDataBuilders,
  parseResBody,
  readIndexLabRunEvents,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
  setupFixture,
} from './helpers/runtimeOpsRoutesHarness.js';

test('runtimeOpsRoutes: missing runId returns false (no match)', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
    });
    const res = createMockRes();
    const result = await handler(['indexlab', 'run', '', 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(result, false);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: non-existent run returns 404', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', 'non-existent-run', 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 404);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});


test('runtimeOpsRoutes: relocated s3 run remains readable after source indexlab directory is removed', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-s3-relocated-');
  const runId = 'run-ops-s3-relocated';
  const category = 'mouse';
  const productId = 'mouse-test-brand-model';
  const s3Prefix = 'spec-factory-runs';
  const archiveBase = `${s3Prefix}/${category}/${productId}/${runId}/indexlab`;
  const archiveStorage = createArchivedS3StorageStub({
    [`${archiveBase}/run.json`]: JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
      round: 2,
    }),
    [`${archiveBase}/run_events.ndjson`]: `${JSON.stringify({
      run_id: runId,
      ts: '2026-02-20T00:01:00.000Z',
      event: 'fetch_finished',
      payload: { url: 'https://a.com/1', worker_id: 'w1', status_code: 200, bytes: 5000 },
    })}\n`,
  });

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: createStorageStub(),
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
    runDataStorageState: {
      enabled: true,
      destinationType: 's3',
      localDirectory: '',
      s3Bucket: 'test-bucket',
      s3Prefix,
    },
    runDataArchiveStorage: archiveStorage,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      readIndexLabRunEvents,
      readRunSummaryEvents: readIndexLabRunEvents,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 200);
    const body = parseResBody(res);
    assert.equal(body?.run_id, runId);
    assert.equal(body?.status, 'completed');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: canonical run_id resolves back to a mismatched local live-run directory', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-run-id-alias-');
  const requestedRunId = 'live-watch-run-alias';
  const canonicalRunId = '20260309-run-alias';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId: requestedRunId,
    meta: {
      run_id: canonicalRunId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
    },
    events: [
      {
        run_id: canonicalRunId,
        ts: '2026-02-20T00:01:00.000Z',
        stage: 'fetch',
        event: 'fetch_started',
        payload: {
          scope: 'url',
          url: 'https://support.example.com/specs/mouse-pro',
          worker_id: 'fetch-1',
        },
      },
    ],
  });

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: createStorageStub(),
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
  });

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      readIndexLabRunEvents,
      readRunSummaryEvents: readIndexLabRunEvents,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', canonicalRunId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, canonicalRunId);
    assert.equal(body.status, 'completed');
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: valid run summary returns correct shape', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
      { event: 'fetch_finished', ts: '2026-02-20T00:01:02.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1', status_code: 200 } },
    ];
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok('status' in body);
    assert.ok('total_fetches' in body);
    assert.ok('error_rate' in body);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: valid run workers returns array', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
    ];
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok(Array.isArray(body.workers));
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: documents endpoint respects limit param', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1' } },
      { event: 'fetch_started', ts: '2026-02-20T00:02:00.000Z', payload: { url: 'https://b.com/2' } },
      { event: 'fetch_started', ts: '2026-02-20T00:03:00.000Z', payload: { url: 'https://c.com/3' } },
    ];
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'documents'], new URLSearchParams('limit=2'), 'GET', null, res);
    const body = parseResBody(res);
    assert.ok(body);
    assert.ok(Array.isArray(body.documents));
    assert.equal(body.documents.length, 2);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: document detail for unknown URL returns 404', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1' } },
    ];
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
    });
    const res = createMockRes();
    const encodedUrl = encodeURIComponent('https://unknown.com/missing');
    await handler(['indexlab', 'run', runId, 'runtime', 'documents', encodedUrl], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 404);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: unmatched paths return false', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
    });
    const res = createMockRes();
    const result = await handler(['other', 'route'], new URLSearchParams(), 'GET', null, res);
    assert.equal(result, false);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
