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

function createArchivedS3StorageStub(files = {}) {
  const normalized = new Map(
    Object.entries(files).map(([key, value]) => [String(key), Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')]),
  );
  return {
    async listKeys(prefix) {
      const token = String(prefix || '');
      return [...normalized.keys()].filter((key) => key.startsWith(token)).sort();
    },
    async readJsonOrNull(key) {
      if (!normalized.has(key)) return null;
      return JSON.parse(normalized.get(key).toString('utf8'));
    },
    async readTextOrNull(key) {
      if (!normalized.has(key)) return null;
      return normalized.get(key).toString('utf8');
    },
    async readBuffer(key) {
      if (!normalized.has(key)) {
        const error = new Error('not_found');
        error.code = 'ENOENT';
        throw error;
      }
      return Buffer.from(normalized.get(key));
    },
    async objectExists(key) {
      return normalized.has(key);
    },
  };
}

test('indexlabRoutes: relocated local run meta remains readable after source indexlab directory is removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-routes-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const archiveRoot = path.join(tempRoot, 'archive');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-relocated-meta';
  const category = 'mouse';
  const productId = 'mouse-run-relocated-meta';
  const archivedIndexLabRoot = path.join(archiveRoot, category, productId, runId, 'indexlab');
  await fs.mkdir(archivedIndexLabRoot, { recursive: true });
  await fs.writeFile(path.join(archivedIndexLabRoot, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category,
    product_id: productId,
    status: 'completed',
    started_at: '2026-02-22T00:00:00.000Z',
    ended_at: '2026-02-22T00:01:00.000Z',
  })}\n`, 'utf8');

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: storageStub(),
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
    runDataStorageState: {
      enabled: true,
      destinationType: 'local',
      localDirectory: archiveRoot,
    },
  });

  try {
    const handler = registerIndexlabRoutes({
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
      INDEXLAB_ROOT: indexLabRoot,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      readIndexLabRunEvents: async () => [],
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunPhase07Retrieval: async () => null,
      readIndexLabRunPhase08Extraction: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunLlmTraces: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
      readIndexLabRunEvidenceIndex: async () => null,
      listIndexLabRuns: async () => [],
      buildRoundSummaryFromEvents: () => ({}),
      buildSearchHints: () => [],
      buildAnchorsSuggestions: () => [],
      buildKnownValuesSuggestions: () => [],
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parseResBody(res), {
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:01:00.000Z',
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('indexlabRoutes: relocated s3 run meta remains readable after source indexlab directory is removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-routes-s3-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-relocated-s3-meta';
  const category = 'mouse';
  const productId = 'mouse-run-relocated-s3-meta';
  const s3Prefix = 'spec-factory-runs';
  const archiveBase = `${s3Prefix}/${category}/${productId}/${runId}/indexlab`;
  const archiveStorage = createArchivedS3StorageStub({
    [`${archiveBase}/run.json`]: JSON.stringify({
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:01:00.000Z',
    }),
  });

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: storageStub(),
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
    const handler = registerIndexlabRoutes({
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
      INDEXLAB_ROOT: indexLabRoot,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      readIndexLabRunEvents: async () => [],
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunPhase07Retrieval: async () => null,
      readIndexLabRunPhase08Extraction: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunLlmTraces: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
      readIndexLabRunEvidenceIndex: async () => null,
      listIndexLabRuns: async () => [],
      buildRoundSummaryFromEvents: () => ({}),
      buildSearchHints: () => [],
      buildAnchorsSuggestions: () => [],
      buildKnownValuesSuggestions: () => [],
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parseResBody(res), {
      run_id: runId,
      category,
      product_id: productId,
      status: 'completed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:01:00.000Z',
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('indexlabRoutes: run listing forwards category scope alongside limit', async () => {
  const calls = [];
  const handler = registerIndexlabRoutes({
    jsonRes,
    toInt,
    toFloat,
    safeJoin: () => '',
    safeReadJson: async () => null,
    path,
    INDEXLAB_ROOT: '/tmp/indexlab',
    processStatus: () => ({ running: false }),
    readIndexLabRunMeta: async () => null,
    resolveIndexLabRunDirectory: async () => '',
    readIndexLabRunEvents: async () => [],
    readIndexLabRunNeedSet: async () => null,
    readIndexLabRunSearchProfile: async () => null,
    readIndexLabRunPhase07Retrieval: async () => null,
    readIndexLabRunPhase08Extraction: async () => null,
    readIndexLabRunDynamicFetchDashboard: async () => null,
    readIndexLabRunSourceIndexingPackets: async () => null,
    readIndexLabRunItemIndexingPacket: async () => null,
    readIndexLabRunRunMetaPacket: async () => null,
    readIndexLabRunSerpExplorer: async () => null,
    readIndexLabRunLlmTraces: async () => null,
    readIndexLabRunAutomationQueue: async () => null,
    readIndexLabRunEvidenceIndex: async () => null,
    listIndexLabRuns: async (args) => {
      calls.push(args);
      return [];
    },
    buildRoundSummaryFromEvents: () => ({}),
    buildSearchHints: () => [],
    buildAnchorsSuggestions: () => [],
    buildKnownValuesSuggestions: () => [],
    queryIndexSummary: async () => null,
    urlIndexSummary: async () => null,
    highYieldUrls: async () => [],
    promptIndexSummary: async () => null,
    readKnobSnapshots: async () => null,
    evaluateAllSections: async () => null,
    buildEvidenceReport: async () => null,
    buildEffectiveSettingsSnapshot: async () => null,
    buildScreenshotManifestFromEvents: async () => null,
    computeCompoundCurve: async () => null,
    diffRunPlans: async () => null,
    buildFieldMapFromPacket: async () => null,
    aggregateCrossRunMetrics: async () => null,
    aggregateHostHealth: async () => null,
  });

  const res = createMockRes();
  await handler(['indexlab', 'runs'], new URLSearchParams('limit=25&category=mouse'), 'GET', null, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, [{ limit: 25, category: 'mouse' }]);
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
    const handler = registerIndexlabRoutes({
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
      INDEXLAB_ROOT: indexLabRoot,
      processStatus: () => ({ running: false, run_id: null }),
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      readIndexLabRunEvents: async () => {
        const text = await fs.readFile(path.join(runDir, 'run_events.ndjson'), 'utf8');
        return text.trim().split('\n').map((line) => JSON.parse(line));
      },
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunPhase07Retrieval: async () => null,
      readIndexLabRunPhase08Extraction: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunLlmTraces: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
      readIndexLabRunEvidenceIndex: async () => null,
      listIndexLabRuns: async () => [],
      buildRoundSummaryFromEvents: () => ({}),
      buildSearchHints: () => [],
      buildAnchorsSuggestions: () => [],
      buildKnownValuesSuggestions: () => [],
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parseResBody(res), {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-run-terminal-state',
      status: 'failed',
      started_at: '2026-02-22T00:00:00.000Z',
      ended_at: '2026-02-22T00:00:10.000Z',
      terminal_reason: 'max_run_seconds_reached',
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
