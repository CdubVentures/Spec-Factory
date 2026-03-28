import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  cleanupTempRoot,
  createMockRes,
  createOutputRootStorage,
  createRuntimeOpsHandler,
  createRuntimeOpsRoot,
  createRunFixture,
  createStreamingMockRes,
  parseResBody,
  statOrNull,
  waitForStreamFinish,
} from './helpers/runtimeOpsRoutesHarness.js';

test('runtimeOpsRoutes: screencast endpoint returns cached last frame for run worker', async () => {
  const { tempRoot, indexLabRoot, outputRoot, runId } = await (async () => {
    const fixture = await createRuntimeOpsRoot('runtime-ops-routes-');
    const runId = 'run-ops-test';
    await createRunFixture({
      rootDir: fixture.indexLabRoot,
      runId,
      meta: {
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        ended_at: '2026-02-20T00:10:00.000Z',
        status: 'completed',
        round: 2,
      },
      events: [],
    });
    return { ...fixture, runId };
  })();

  try {
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      config: {},
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
      getLastScreencastFrame: (requestedRunId, workerId) => (
        requestedRunId === runId && workerId === 'fetch-9'
          ? {
            run_id: requestedRunId,
            worker_id: workerId,
            data: 'abc123',
            width: 1280,
            height: 720,
            ts: '2026-03-08T08:10:00.000Z',
          }
          : null
      ),
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'screencast', 'fetch-9', 'last'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body, {
      run_id: runId,
      worker_id: 'fetch-9',
      frame: {
        run_id: runId,
        worker_id: 'fetch-9',
        data: 'abc123',
        width: 1280,
        height: 720,
        ts: '2026-03-08T08:10:00.000Z',
      },
    });
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: screencast endpoint synthesizes proof frame for ended browser-backed fetch worker when no real frame exists', async () => {
  const { tempRoot, indexLabRoot, outputRoot, runId } = await (async () => {
    const fixture = await createRuntimeOpsRoot('runtime-ops-routes-');
    const runId = 'run-ops-test';
    await createRunFixture({
      rootDir: fixture.indexLabRoot,
      runId,
      meta: {
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        ended_at: '2026-02-20T00:10:00.000Z',
        status: 'completed',
        round: 2,
      },
      events: [],
    });
    return { ...fixture, runId };
  })();

  try {
    const events = [
      {
        event: 'fetch_started',
        ts: '2026-02-20T00:01:00.000Z',
        payload: {
          scope: 'url',
          url: 'https://razer.com/products/viper-v3-pro',
          worker_id: 'fetch-2',
          fetcher_kind: 'crawlee',
        },
      },
      {
        event: 'fetch_finished',
        ts: '2026-02-20T00:01:05.000Z',
        payload: {
          scope: 'url',
          url: 'https://razer.com/products/viper-v3-pro',
          worker_id: 'fetch-2',
          status_code: 0,
          error: 'Crawlee fetch failed: no_result',
          fetcher_kind: 'crawlee',
        },
      },
    ];
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      config: {},
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
      getLastScreencastFrame: () => null,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'screencast', 'fetch-2', 'last'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, runId);
    assert.equal(body.worker_id, 'fetch-2');
    assert.equal(body.frame.worker_id, 'fetch-2');
    assert.equal(body.frame.mime_type, 'image/svg+xml');
    assert.equal(body.frame.synthetic, true);
    assert.equal(typeof body.frame.data, 'string');
    assert.equal(body.frame.data.length > 0, true);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

test('runtimeOpsRoutes: runtime asset route serves output-root screenshot keys requested by the worker drawer', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-asset-output-root-');
  const runId = 'run-ops-asset-output-root';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
    },
    events: [],
  });

  try {
    const screenshotKey = 'specs/outputs/mouse/mouse-test-brand-model/runs/run-ops-asset-output-root/raw/screenshots/razer.com__0000/screenshot.png';
    const screenshotPath = path.join(outputRoot, ...screenshotKey.split('/'));
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: createOutputRootStorage(outputRoot),
      config: {},
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
    });

    const res = createStreamingMockRes();
    await handler(
      ['indexlab', 'run', runId, 'runtime', 'assets', encodeURIComponent(screenshotKey)],
      new URLSearchParams(),
      'GET',
      null,
      res,
    );
    await waitForStreamFinish(res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.deepEqual(res.body, screenshotBuffer);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

