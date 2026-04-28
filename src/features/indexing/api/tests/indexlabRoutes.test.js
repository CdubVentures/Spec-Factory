import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';

import {
  initIndexLabDataBuilders,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
} from '../builders/indexlabDataBuilders.js';
import { registerIndexlabRoutes } from '../indexlabRoutes.js';
import { SpecDb } from '../../../../db/specDb.js';
import { scanAndSeedCheckpoints } from '../../../../pipeline/checkpoint/scanAndSeedCheckpoints.js';

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      res.headers[key.toLowerCase()] = value;
    },
    writeHead(code, headers) {
      res.statusCode = code;
      if (headers) {
        Object.entries(headers).forEach(([k, v]) => {
          res.headers[k.toLowerCase()] = v;
        });
      }
    },
    end(data) {
      res.body = data;
    },
  };
  return res;
}

function parseResBody(res) {
  try {
    return JSON.parse(String(res.body || ''));
  } catch {
    return null;
  }
}

function jsonRes(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function storageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null,
  };
}

function urlHash8(url) {
  return createHash('sha256').update(String(url || '')).digest('hex').slice(0, 8);
}

function createRunMeta(overrides = {}) {
  return {
    run_id: 'run-1',
    category: 'mouse',
    product_id: 'mouse-run-1',
    status: 'completed',
    started_at: '2026-02-22T00:00:00.000Z',
    ended_at: '2026-02-22T00:01:00.000Z',
    ...overrides,
  };
}

const mockSpecDb = {
  getQueryIndexByCategory: () => [],
  getUrlIndexByCategory: () => [],
  getPromptIndexByCategory: () => [],
  getKnobSnapshots: () => [],
};

function createIndexlabRouteHandler(overrides = {}) {
  return registerIndexlabRoutes({
    jsonRes,
    toInt,
    toFloat,
    safeJoin: (base, sub) => {
      const token = String(sub || '').trim();
      if (!token) return '';
      return path.join(base, token);
    },
    safeReadJson: async (filePath) => {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    },
    path,
    INDEXLAB_ROOT: '/tmp/indexlab',
    processStatus: () => ({ running: false, run_id: null }),
    getSpecDb: () => mockSpecDb,
    readIndexLabRunMeta: () => null,
    resolveIndexLabRunDirectory: () => '',
    readRunSummaryEvents: () => [],
    readIndexLabRunNeedSet: () => null,
    readIndexLabRunSearchProfile: () => null,
    readIndexLabRunSerpExplorer: () => null,
    readIndexLabRunAutomationQueue: () => null,
    listIndexLabRuns: () => [],
    buildRoundSummaryFromEvents: () => ({}),
    buildSearchHints: () => [],
    buildAnchorsSuggestions: () => [],
    buildKnownValuesSuggestions: () => [],
    evaluateAllSections: () => null,
    buildEvidenceReport: () => null,
    buildEffectiveSettingsSnapshot: () => null,
    buildScreenshotManifestFromEvents: () => null,
    computeCompoundCurve: () => null,
    aggregateCrossRunMetrics: () => null,
    aggregateHostHealth: () => null,
    ...overrides,
  });
}

test('indexlabRoutes: run listing reflects category scope and limit in the returned rows', async () => {
  const handler = createIndexlabRouteHandler({
    listIndexLabRuns: ({ limit, category }) => [
      createRunMeta({
        run_id: `run-${category}-${limit}`,
        category,
        product_id: `${category}-run-${limit}`,
      }),
    ],
  });

  const res = createMockRes();
  await handler(['indexlab', 'runs'], new URLSearchParams('limit=25&category=mouse'), 'GET', null, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(parseResBody(res), {
    root: '/tmp/indexlab',
    runs: [
      createRunMeta({
        run_id: 'run-mouse-25',
        category: 'mouse',
        product_id: 'mouse-run-25',
      }),
    ],
  });
});

test('indexlabRoutes: inactive run with stale running meta resolves to failed terminal payload', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-routes-terminal-state-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-terminal-state-meta';
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category: 'mouse',
    product_id: 'mouse-run-terminal-state',
    status: 'running',
    started_at: '2026-02-22T00:00:00.000Z',
    ended_at: '',
  })}\n`, 'utf8');
  await fs.writeFile(
    path.join(runDir, 'run_events.ndjson'),
    [
      JSON.stringify({ run_id: runId, ts: '2026-02-22T00:00:05.000Z', event: 'fetch_started', payload: { url: 'https://example.com/pdp' } }),
      JSON.stringify({ run_id: runId, ts: '2026-02-22T00:00:10.000Z', stage: 'error', event: 'error', payload: { event: 'max_run_seconds_reached' } }),
    ].join('\n') + '\n',
    'utf8',
  );

  // WHY: readIndexLabRunMeta is SQL-only — seed an in-memory SpecDb so the run resolves.
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  specDb.upsertRun({
    run_id: runId,
    category: 'mouse',
    product_id: 'mouse-run-terminal-state',
    status: 'running',
    started_at: '2026-02-22T00:00:00.000Z',
    ended_at: '',
    stage_cursor: '',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: '',
    out_root: '',
    counters: {},
  });

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: storageStub(),
    config: {},
    getSpecDbReady: async () => specDb,
    isProcessRunning: () => false,
  });

  try {
    const handler = createIndexlabRouteHandler({
      INDEXLAB_ROOT: indexLabRoot,
      processStatus: () => ({ running: false, run_id: null }),
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      readRunSummaryEvents: async () => {
        const text = await fs.readFile(path.join(runDir, 'run_events.ndjson'), 'utf8');
        return text.trim().split('\n').map((line) => JSON.parse(line));
      },
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, runId);
    assert.equal(body.status, 'failed');
    assert.equal(body.terminal_reason, 'max_run_seconds_reached');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('indexlabRoutes: storage run detail uses run_sources rebuilt from durable checkpoints', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-run-detail-rebuild-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const runId = 'run-storage-detail-rebuild';
  const productId = 'mouse-storage-detail-rebuild';
  const runDir = path.join(indexLabRoot, runId);
  const url = 'https://razer.com/manual.pdf';
  const contentHash = 'd'.repeat(64);
  const screenshotName = `screenshot-fetch-1-${urlHash8(url)}-00-page.jpg`;

  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  try {
    await fs.mkdir(path.join(runDir, 'screenshots'), { recursive: true });
    await fs.mkdir(path.join(runDir, 'video'), { recursive: true });
    await fs.writeFile(path.join(runDir, 'screenshots', screenshotName), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await fs.writeFile(path.join(runDir, 'video', 'fetch-1.webm'), Buffer.from([0, 1, 2, 3, 4, 5]));
    await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
      schema_version: 3,
      checkpoint_type: 'crawl',
      created_at: '2026-04-01T04:30:00.000Z',
      run: {
        run_id: runId,
        category: 'mouse',
        product_id: productId,
        status: 'completed',
        s3_key: '',
        duration_ms: 5000,
      },
      counters: { urls_crawled: 1, urls_successful: 1 },
      artifacts: { html_dir: 'html', screenshot_dir: 'screenshots', video_dir: 'video' },
      sources: [
        {
          url,
          final_url: url,
          status: 200,
          success: true,
          worker_id: 'fetch-1',
          content_hash: contentHash,
          html_file: 'dddddddddddd.html.gz',
          screenshot_count: 1,
          video_file: 'fetch-1.webm',
          source_tier: 1,
          doc_kind: 'manual',
          content_type: 'application/pdf',
          size_bytes: 4096,
          has_pdf: true,
          has_ldjson: true,
          has_dom_snippet: true,
        },
      ],
      needset: null,
      search_profile: null,
      run_summary: null,
    }, null, 2)}\n`, 'utf8');

    const seedStats = await scanAndSeedCheckpoints({ specDb, indexLabRoot });
    assert.equal(seedStats.runs_seeded, 1);
    assert.equal(seedStats.sources_seeded, 1);
    assert.equal(seedStats.screenshots_seeded, 1);
    assert.equal(seedStats.videos_seeded, 1);
    assert.equal(specDb.getRunSourcesByRunId(runId).length, 1);

    const handler = createIndexlabRouteHandler({
      INDEXLAB_ROOT: indexLabRoot,
      readJsonBody: async () => ({}),
      getSpecDb: (category) => (category === 'mouse' ? specDb : null),
      readIndexLabRunMeta: async (id) => specDb.getRunByRunId(id),
      listIndexLabRuns: async () => [specDb.getRunByRunId(runId)].filter(Boolean),
    });

    const res = createMockRes();
    await handler(['storage', 'runs', runId], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, runId);
    assert.equal(body.sources.length, 1);
    assert.equal(body.sources[0].url, url);
    assert.equal(body.sources[0].content_hash, contentHash);
    assert.equal(body.sources[0].source_tier, 1);
    assert.equal(body.sources[0].doc_kind, 'manual');
    assert.equal(body.sources[0].content_type, 'application/pdf');
    assert.equal(body.sources[0].html_size, 4096);
    assert.equal(body.sources[0].screenshot_count, 1);
    assert.equal(body.sources[0].video_file, 'fetch-1.webm');
    assert.equal(body.sources[0].total_size, 4106);
  } finally {
    specDb.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('indexlabRoutes: storage source HTML route serves SQL-indexed gzipped artifact', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-source-html-route-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const runId = 'run-storage-source-html';
  const productId = 'mouse-storage-source-html';
  const contentHash = 'e'.repeat(64);
  const runDir = path.join(indexLabRoot, runId);
  const htmlDir = path.join(runDir, 'html');
  const htmlFilename = `${contentHash.slice(0, 12)}.html.gz`;
  const htmlPath = path.join(htmlDir, htmlFilename);
  const html = '<html><body>spec proof</body></html>';

  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  try {
    await fs.mkdir(htmlDir, { recursive: true });
    await fs.writeFile(htmlPath, gzipSync(Buffer.from(html, 'utf8')));
    specDb.upsertRun({
      run_id: runId,
      category: 'mouse',
      product_id: productId,
      status: 'completed',
      started_at: '2026-04-01T04:30:00.000Z',
      ended_at: '2026-04-01T04:31:00.000Z',
      counters: {},
    });
    specDb.insertRunSource({
      run_id: runId,
      content_hash: contentHash,
      category: 'mouse',
      product_id: productId,
      source_url: 'https://example.com/specs',
      final_url: 'https://example.com/specs',
      content_type: 'text/html',
      size_bytes: Buffer.byteLength(html, 'utf8'),
      file_path: htmlPath,
      crawled_at: '2026-04-01T04:30:30.000Z',
    });

    const handler = createIndexlabRouteHandler({
      INDEXLAB_ROOT: indexLabRoot,
      readJsonBody: async () => ({}),
      getSpecDb: (category) => (category === 'mouse' ? specDb : null),
      readIndexLabRunMeta: async (id) => specDb.getRunByRunId(id),
      listIndexLabRuns: async () => [specDb.getRunByRunId(runId)].filter(Boolean),
    });

    const res = createMockRes();
    await handler(
      ['storage', 'runs', runId, 'sources', contentHash, 'html'],
      new URLSearchParams(),
      'GET',
      { headers: {} },
      res,
    );

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['content-encoding'], 'gzip');
    assert.equal(gunzipSync(Buffer.from(res.body)).toString('utf8'), html);
  } finally {
    specDb.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
