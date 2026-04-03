import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  initIndexLabDataBuilders,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
} from '../builders/indexlabDataBuilders.js';
import { registerIndexlabRoutes } from '../indexlabRoutes.js';

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
    readIndexLabRunEvents: () => [],
    readRunSummaryEvents: () => [],
    readIndexLabRunNeedSet: () => null,
    readIndexLabRunSearchProfile: () => null,
    readIndexLabRunPrimeSources: () => null,
    readIndexLabRunDynamicFetchDashboard: () => null,
    readIndexLabRunSourceIndexingPackets: () => null,
    readIndexLabRunItemIndexingPacket: () => null,
    readIndexLabRunRunMetaPacket: () => null,
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
    diffRunPlans: () => null,
    buildFieldMapFromPacket: () => null,
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

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: storageStub(),
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
  });

  try {
    const handler = createIndexlabRouteHandler({
      INDEXLAB_ROOT: indexLabRoot,
      processStatus: () => ({ running: false, run_id: null }),
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      readIndexLabRunEvents: async () => {
        const text = await fs.readFile(path.join(runDir, 'run_events.ndjson'), 'utf8');
        return text.trim().split('\n').map((line) => JSON.parse(line));
      },
      readRunSummaryEvents: async () => {
        const text = await fs.readFile(path.join(runDir, 'run_events.ndjson'), 'utf8');
        return text.trim().split('\n').map((line) => JSON.parse(line));
      },
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunPrimeSources: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId], new URLSearchParams(), 'GET', null, res);
    // Disk checkpoints now backfill run detail when the SQL row is missing.
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, runId);
    assert.equal(body.status, 'failed');
    assert.equal(body.terminal_reason, 'max_run_seconds_reached');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
