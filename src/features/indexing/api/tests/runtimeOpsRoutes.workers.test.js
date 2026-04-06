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

test('runtimeOpsRoutes: worker detail surfaces provisional extraction fields from live llm extraction previews before packet persistence', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-live-llm-preview-');
  const runId = 'run-ops-live-llm-preview';
  const url = 'https://support.example.com/specs/mouse-1';
  const screenshotKey = `specs/outputs/mouse/mouse-test-brand-model/runs/${runId}/raw/screenshots/support.example.com__0000/screenshot.png`;
  const screenshotPath = path.join(outputRoot, ...screenshotKey.split('/'));
  const screenshotBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
    'base64',
  );
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, screenshotBuffer);

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      status: 'running',
    },
    events: [],
  });

  try {
    const events = [
      {
        event: 'fetch_started',
        ts: '2026-02-20T00:01:00.000Z',
        payload: {
          url,
          worker_id: 'fetch-1',
        },
      },
      {
        event: 'llm_started',
        ts: '2026-02-20T00:01:01.000Z',
        payload: {
          worker_id: 'llm-1',
          call_type: 'extraction',
          reason: 'extract_reasoning_batch',
          prompt_preview: JSON.stringify({
            extraction_context: {
              prime_sources: {
                by_field: {
                  dpi: [{ url }],
                  weight: [{ url }],
                },
              },
            },
          }),
        },
      },
      {
        event: 'llm_finished',
        ts: '2026-02-20T00:01:02.000Z',
        payload: {
          worker_id: 'llm-1',
          call_type: 'extraction',
          reason: 'extract_reasoning_batch',
          prompt_preview: JSON.stringify({
            extraction_context: {
              prime_sources: {
                by_field: {
                  dpi: [{ url }],
                  weight: [{ url }],
                },
              },
            },
          }),
          response_preview: JSON.stringify({
            fieldCandidates: [
              { field: 'dpi', value: '44000', confidence: 0.98 },
              { field: 'weight', value: '60', confidence: 0.96 },
            ],
          }),
        },
      },
      {
        event: 'index_finished',
        ts: '2026-02-20T00:01:03.000Z',
        payload: {
          url,
          worker_id: 'fetch-1',
          count: 2,
          filled_fields: ['dpi', 'weight'],
        },
      },
      {
        event: 'parse_finished',
        ts: '2026-02-20T00:01:04.000Z',
        payload: {
          url,
          worker_id: 'fetch-1',
          status: 200,
          article_extraction_method: 'readability',
          screenshot_uri: screenshotKey,
        },
      },
      {
        event: 'source_processed',
        ts: '2026-02-20T00:01:04.100Z',
        payload: {
          url,
          worker_id: 'fetch-1',
          status: 200,
          candidate_count: 2,
          content_type: 'text/html',
        },
      },
    ];

    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: createOutputRootStorage(outputRoot),
      fs,
      safeStat: statOrNull,
      config: {},
      readRunSummaryEvents: async () => events,
      readIndexLabRunMeta: async () => ({
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        status: 'running',
      }),
    });

    const detailRes = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers', 'fetch-1'], new URLSearchParams(), 'GET', null, detailRes);
    const detailBody = parseResBody(detailRes);

    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailBody.extraction_fields.length, 2);
    assert.deepEqual(
      detailBody.extraction_fields.map((row) => [row.field, row.value, row.method, row.source_url]),
      [
        ['dpi', '44000', 'llm_extract', url],
        ['weight', '60', 'llm_extract', url],
      ],
    );
    assert.equal(detailBody.screenshots.length, 1);
    assert.equal(detailBody.screenshots[0].filename, screenshotKey);
    assert.equal(detailBody.phase_lineage.phases.find((row) => row.phase_id === 'extract:post-process')?.field_count, 2);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
