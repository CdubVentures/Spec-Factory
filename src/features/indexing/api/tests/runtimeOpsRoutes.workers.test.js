import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  cleanupTempRoot,
  createMockRes,
  createOutputRootStorage,
  createRunFixture,
  createRuntimeOpsHandler,
  createRuntimeOpsRoot,
  parseResBody,
  statOrNull,
} from './helpers/runtimeOpsRoutesHarness.js';

test('runtimeOpsRoutes: worker detail hydrates screenshot metadata from resolved local artifact when event payload omits it', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-worker-detail-');
  const runId = 'run-ops-worker-detail';
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
    const screenshotKey = 'specs/outputs/mouse/mouse-test-brand-model/runs/run-ops-worker-detail/raw/screenshots/razer.com__0000/screenshot.png';
    const screenshotPath = path.join(outputRoot, ...screenshotKey.split('/'));
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const events = [
      {
        event: 'fetch_started',
        ts: '2026-02-20T00:01:00.000Z',
        payload: {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          worker_id: 'fetch-1',
        },
      },
      {
        event: 'parse_finished',
        ts: '2026-02-20T00:01:03.000Z',
        payload: {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          worker_id: 'fetch-1',
          screenshot_uri: screenshotKey,
        },
      },
    ];

    const runMeta = {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z',
      status: 'completed',
    };
    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: createOutputRootStorage(outputRoot),
      fs,
      safeStat: statOrNull,
      config: {},
      readRunSummaryEvents: async () => events,
      readIndexLabRunMeta: async () => runMeta,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers', 'fetch-1'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(res.statusCode, 200);
    assert.equal(body.screenshots.length, 1);
    assert.equal(body.screenshots[0].filename, screenshotKey);
    assert.equal(body.screenshots[0].bytes, screenshotBuffer.length);
    assert.equal(body.screenshots[0].width, 1);
    assert.equal(body.screenshots[0].height, 1);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});

