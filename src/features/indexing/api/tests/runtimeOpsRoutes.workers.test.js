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

    const handler = createRuntimeOpsHandler({
      indexLabRoot,
      outputRoot,
      storage: createOutputRootStorage(outputRoot),
      fs,
      safeStat: statOrNull,
      config: {},
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
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

test('runtimeOpsRoutes: workers and worker detail hydrate from source indexing packets', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-worker-packets-');
  const runId = 'run-ops-worker-packets';
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
    const url = 'https://support.example.com/specs/mouse-pro';
    const screenshotKey = 'specs/outputs/mouse/mouse-test-brand-model/runs/run-ops-worker-packets/raw/screenshots/support.example.com__0000/screenshot.png';
    const screenshotPath = path.join(outputRoot, ...screenshotKey.split('/'));
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const packetCollection = {
      packets: [
        {
          canonical_url: url,
          source_key: url,
          source_metadata: { source_url: url },
          parser_execution: {
            phase_lineage: {
              phase_01_static_html: false,
              phase_02_dynamic_js: false,
              phase_03_main_article: false,
              phase_04_html_spec_table: true,
              phase_05_embedded_json: true,
              phase_06_text_pdf: false,
              phase_07_scanned_pdf_ocr: false,
              phase_08_image_ocr: false,
              phase_09_chart_graph: false,
              phase_10_office_mixed_doc: false,
            },
            phase_stats: {
              phase_04_html_spec_table: { executed: true, assertion_count: 2, evidence_count: 2 },
              phase_05_embedded_json: { executed: true, assertion_count: 1, evidence_count: 1 },
            },
          },
          artifact_index: {
            shot_1: {
              artifact_kind: 'screenshot',
              local_path: screenshotKey,
            },
          },
          field_key_map: {
            weight: {
              contexts: [
                {
                  assertions: [
                    {
                      field_key: 'weight',
                      value_raw: '60g',
                      value_normalized: '60g',
                      confidence: 0.94,
                      extraction_method: 'spec_table_match',
                      parser_phase: 'phase_04_html_spec_table',
                    },
                  ],
                },
              ],
            },
            polling_rate: {
              contexts: [
                {
                  assertions: [
                    {
                      field_key: 'polling_rate',
                      value_raw: '8000 Hz',
                      value_normalized: '8000 Hz',
                      confidence: 0.88,
                      extraction_method: 'network_json',
                      parser_phase: 'phase_05_embedded_json',
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    };

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
        event: 'source_processed',
        ts: '2026-02-20T00:01:04.000Z',
        payload: {
          url,
          worker_id: 'fetch-1',
          status: 200,
          candidate_count: 650,
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
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
      readIndexLabRunSourceIndexingPackets: async () => packetCollection,
    });

    const workersRes = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers'], new URLSearchParams(), 'GET', null, workersRes);
    const workersBody = parseResBody(workersRes);

    assert.equal(workersRes.statusCode, 200);
    assert.equal(workersBody.workers.find((row) => row.worker_id === 'fetch-1')?.fields_extracted, 2);

    const detailRes = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers', 'fetch-1'], new URLSearchParams(), 'GET', null, detailRes);
    const detailBody = parseResBody(detailRes);

    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailBody.extraction_fields.length, 2);
    assert.equal(detailBody.screenshots.length, 1);
    assert.equal(detailBody.screenshots[0].filename, screenshotKey);
    assert.equal(detailBody.screenshots[0].bytes, screenshotBuffer.length);
    assert.equal(detailBody.screenshots[0].width, 1);
    assert.equal(detailBody.screenshots[0].height, 1);
    assert.equal(detailBody.phase_lineage.phases.find((row) => row.phase_id === 'phase_04_html_spec_table')?.field_count, 2);
    assert.equal(detailBody.phase_lineage.phases.find((row) => row.phase_id === 'phase_05_embedded_json')?.field_count, 1);
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
      readIndexLabRunEvents: async () => events,
      readRunSummaryEvents: async () => events,
      readIndexLabRunSourceIndexingPackets: async () => null,
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
    assert.equal(detailBody.phase_lineage.phases.find((row) => row.phase_id === 'cross_cutting')?.field_count, 2);
  } finally {
    await cleanupTempRoot(tempRoot);
  }
});
