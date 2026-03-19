import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
} from '../../../../src/features/indexing/api/builders/indexlabDataBuilders.js';
import { registerRuntimeOpsRoutes } from '../../../../src/features/indexing/api/runtimeOpsRoutes.js';

function createStorageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join('/'),
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

async function createRunFixture({ rootDir, runId, meta, events }) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(meta)}\n`, 'utf8');
  const eventText = events.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${eventText}\n`, 'utf8');
}

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

function createStreamingMockRes() {
  class MockWritable extends Writable {
    constructor() {
      super();
      this.statusCode = 200;
      this.headers = {};
      this.chunks = [];
      this.body = null;
    }

    setHeader(key, value) {
      this.headers[String(key).toLowerCase()] = value;
    }

    writeHead(code, headers) {
      this.statusCode = code;
      if (headers) {
        Object.entries(headers).forEach(([k, v]) => {
          this.headers[String(k).toLowerCase()] = v;
        });
      }
    }

    _write(chunk, _encoding, callback) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }

    end(chunk, encoding, callback) {
      if (chunk) {
        this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
      }
      this.body = Buffer.concat(this.chunks);
      return super.end(null, undefined, callback);
    }
  }

  return new MockWritable();
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

async function setupFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-routes-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-ops-test';
  const runDir = path.join(indexLabRoot, runId);
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
      round: 2,
    },
    events: [
      { run_id: runId, ts: '2026-02-20T00:01:00.000Z', event: 'fetch_started', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
      { run_id: runId, ts: '2026-02-20T00:01:02.000Z', event: 'fetch_finished', payload: { url: 'https://a.com/1', worker_id: 'w1', status_code: 200, bytes: 5000 } },
      { run_id: runId, ts: '2026-02-20T00:01:03.000Z', event: 'parse_started', payload: { url: 'https://a.com/1' } },
      { run_id: runId, ts: '2026-02-20T00:01:04.000Z', event: 'parse_finished', payload: { url: 'https://a.com/1', parse_method: 'cheerio' } },
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

  return { tempRoot, indexLabRoot, runId, runDir };
}

test('runtimeOpsRoutes: feature flag off returns false for all routes', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: false },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
      path,
    });
    const res = createMockRes();
    const result = await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(result, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: missing runId returns false (no match)', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    const result = await handler(['indexlab', 'run', '', 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(result, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: non-existent run returns 404', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', 'non-existent-run', 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 404);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: inactive run with stale running meta resolves to failed terminal summary', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-terminal-state-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-terminal-state';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '',
      status: 'running',
      round: 2,
    },
    events: [
      { run_id: runId, ts: '2026-02-20T00:01:00.000Z', event: 'fetch_started', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
      { run_id: runId, ts: '2026-02-20T00:01:05.000Z', stage: 'error', event: 'error', payload: { event: 'max_run_seconds_reached' } },
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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      processStatus: () => ({ running: false, run_id: null }),
      readIndexLabRunEvents,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body?.status, 'failed');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: relocated local run remains readable after source indexlab directory is removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const archiveRoot = path.join(tempRoot, 'archive');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-ops-relocated';
  const category = 'mouse';
  const productId = 'mouse-test-brand-model';
  const archivedIndexLabRoot = path.join(archiveRoot, category, productId, runId, 'indexlab');
  await fs.mkdir(archivedIndexLabRoot, { recursive: true });
  await fs.writeFile(path.join(archivedIndexLabRoot, 'run.json'), `${JSON.stringify({
    run_id: runId,
    category,
    product_id: productId,
    started_at: '2026-02-20T00:00:00.000Z',
    ended_at: '2026-02-20T00:10:00.000Z',
    status: 'completed',
    round: 2,
  })}\n`, 'utf8');
  await fs.writeFile(
    path.join(archivedIndexLabRoot, 'run_events.ndjson'),
    `${JSON.stringify({
      run_id: runId,
      ts: '2026-02-20T00:01:00.000Z',
      event: 'fetch_finished',
      payload: { url: 'https://a.com/1', worker_id: 'w1', status_code: 200, bytes: 5000 },
    })}\n`,
    'utf8',
  );

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: createStorageStub(),
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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      runDataStorageState: {
        enabled: true,
        destinationType: 'local',
        localDirectory: archiveRoot,
      },
      storage: createStorageStub(),
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body?.run_id, runId);
    assert.equal(body?.status, 'completed');
    assert.equal(body?.total_fetches, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: relocated s3 run remains readable after source indexlab directory is removed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-s3-relocated-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: createStorageStub(),
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 200);
    const body = parseResBody(res);
    assert.equal(body?.run_id, runId);
    assert.equal(body?.status, 'completed');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: canonical run_id resolves back to a mismatched local live-run directory', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-run-id-alias-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      readIndexLabRunEvents,
      readIndexLabRunMeta,
      resolveIndexLabRunDirectory,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', canonicalRunId, 'runtime', 'summary'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(res.statusCode, 200);
    assert.equal(body.run_id, canonicalRunId);
    assert.equal(body.status, 'completed');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: valid run summary returns correct shape', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
      { event: 'fetch_finished', ts: '2026-02-20T00:01:02.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1', status_code: 200 } },
    ];
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: valid run workers returns array', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1', worker_id: 'w1' } },
    ];
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok(Array.isArray(body.workers));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: screencast endpoint returns cached last frame for run worker', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
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
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: screencast endpoint falls back to persisted run frame when live cache is empty', async () => {
  const { tempRoot, indexLabRoot, runId, runDir } = await setupFixture();
  try {
    const frameDir = path.join(runDir, 'runtime_screencast');
    await fs.mkdir(frameDir, { recursive: true });
    await fs.writeFile(
      path.join(frameDir, 'fetch-9.json'),
      JSON.stringify({
        run_id: runId,
        worker_id: 'fetch-9',
        data: 'persistedabc',
        width: 1440,
        height: 900,
        ts: '2026-03-08T08:11:00.000Z',
      }),
      'utf8',
    );

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      getLastScreencastFrame: () => null,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
        data: 'persistedabc',
        width: 1440,
        height: 900,
        ts: '2026-03-08T08:11:00.000Z',
      },
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: screencast endpoint synthesizes proof frame for ended browser-backed fetch worker when no real frame exists', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      getLastScreencastFrame: () => null,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
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
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'documents'], new URLSearchParams('limit=2'), 'GET', null, res);
    const body = parseResBody(res);
    assert.ok(body);
    assert.ok(Array.isArray(body.documents));
    assert.equal(body.documents.length, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: document detail for unknown URL returns 404', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'fetch_started', ts: '2026-02-20T00:01:00.000Z', payload: { url: 'https://a.com/1' } },
    ];
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });
    const res = createMockRes();
    const encodedUrl = encodeURIComponent('https://unknown.com/missing');
    await handler(['indexlab', 'run', runId, 'runtime', 'documents', encodedUrl], new URLSearchParams(), 'GET', null, res);
    assert.equal(res.statusCode, 404);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: worker detail hydrates screenshot metadata from resolved local artifact when event payload omits it', async () => {
  const { tempRoot, indexLabRoot, runId, outputRoot } = await (async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-worker-detail-'));
    const indexRoot = path.join(temp, 'indexlab');
    const outRoot = path.join(temp, 'out');
    await fs.mkdir(indexRoot, { recursive: true });
    await fs.mkdir(outRoot, { recursive: true });
    const createdRunId = 'run-ops-worker-detail';
    await createRunFixture({
      rootDir: indexRoot,
      runId: createdRunId,
      meta: {
        run_id: createdRunId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        ended_at: '2026-02-20T00:10:00.000Z',
        status: 'completed',
      },
      events: [],
    });
    return { tempRoot: temp, indexLabRoot: indexRoot, runId: createdRunId, outputRoot: outRoot };
  })();

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

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      fs,
      safeStat: async (filePath) => {
        try {
          return await fs.stat(filePath);
        } catch {
          return null;
        }
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: workers and worker detail hydrate from source indexing packets', async () => {
  const { tempRoot, indexLabRoot, runId, outputRoot } = await (async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-worker-packets-'));
    const indexRoot = path.join(temp, 'indexlab');
    const outRoot = path.join(temp, 'out');
    await fs.mkdir(indexRoot, { recursive: true });
    await fs.mkdir(outRoot, { recursive: true });
    const createdRunId = 'run-ops-worker-packets';
    await createRunFixture({
      rootDir: indexRoot,
      runId: createdRunId,
      meta: {
        run_id: createdRunId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        ended_at: '2026-02-20T00:10:00.000Z',
        status: 'completed',
      },
      events: [],
    });
    return { tempRoot: temp, indexLabRoot: indexRoot, runId: createdRunId, outputRoot: outRoot };
  })();

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

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      fs,
      safeStat: async (filePath) => {
        try {
          return await fs.stat(filePath);
        } catch {
          return null;
        }
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      readIndexLabRunSourceIndexingPackets: async () => packetCollection,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: worker detail surfaces provisional extraction fields from live llm extraction previews before packet persistence', async () => {
  const { tempRoot, indexLabRoot, outputRoot } = await (async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-live-llm-preview-'));
    const indexRoot = path.join(temp, 'indexlab');
    const outRoot = path.join(temp, 'out');
    await fs.mkdir(indexRoot, { recursive: true });
    await fs.mkdir(outRoot, { recursive: true });
    return { tempRoot: temp, indexLabRoot: indexRoot, outputRoot: outRoot };
  })();

  try {
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

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      fs,
      safeStat: async (filePath) => {
        try {
          return await fs.stat(filePath);
        } catch {
          return null;
        }
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => events,
      readIndexLabRunSourceIndexingPackets: async () => null,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
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
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: runtime asset route serves output-root screenshot keys requested by the worker drawer', async () => {
  const { tempRoot, indexLabRoot, runId, outputRoot } = await (async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-asset-output-root-'));
    const indexRoot = path.join(temp, 'indexlab');
    const outRoot = path.join(temp, 'out');
    await fs.mkdir(indexRoot, { recursive: true });
    await fs.mkdir(outRoot, { recursive: true });
    const createdRunId = 'run-ops-asset-output-root';
    await createRunFixture({
      rootDir: indexRoot,
      runId: createdRunId,
      meta: {
        run_id: createdRunId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        started_at: '2026-02-20T00:00:00.000Z',
        ended_at: '2026-02-20T00:10:00.000Z',
        status: 'completed',
      },
      events: [],
    });
    return { tempRoot: temp, indexLabRoot: indexRoot, runId: createdRunId, outputRoot: outRoot };
  })();

  try {
    const screenshotKey = 'specs/outputs/mouse/mouse-test-brand-model/runs/run-ops-asset-output-root/raw/screenshots/razer.com__0000/screenshot.png';
    const screenshotPath = path.join(outputRoot, ...screenshotKey.split('/'));
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createStreamingMockRes();
    await handler(
      ['indexlab', 'run', runId, 'runtime', 'assets', encodeURIComponent(screenshotKey)],
      new URLSearchParams(),
      'GET',
      null,
      res,
    );
    await new Promise((resolve, reject) => {
      if (res.writableFinished) {
        resolve();
        return;
      }
      res.once('finish', resolve);
      res.once('error', reject);
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.deepEqual(res.body, screenshotBuffer);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: archived cache screenshot metadata resolves from cached run_output assets', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-archived-shot-meta-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const runId = 'run-ops-archived-shot-meta';
  const archivedRunDir = path.join(outputRoot, '_runtime', 'archived_runs', 's3', runId, 'indexlab');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(archivedRunDir, { recursive: true });
  await fs.writeFile(path.join(archivedRunDir, 'run.json'), JSON.stringify({
    run_id: runId,
    category: 'mouse',
    product_id: 'mouse-test-brand-model',
    status: 'completed',
  }), 'utf8');
  await fs.writeFile(path.join(archivedRunDir, 'run_events.ndjson'), '', 'utf8');

  try {
    const screenshotKey = `specs/outputs/mouse/mouse-test-brand-model/runs/${runId}/raw/screenshots/razer.com__0000/screenshot.png`;
    const screenshotPath = path.join(
      outputRoot,
      '_runtime',
      'archived_runs',
      's3',
      runId,
      'run_output',
      'raw',
      'screenshots',
      'razer.com__0000',
      'screenshot.png',
    );
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const events = [
      {
        run_id: runId,
        event: 'fetch_started',
        ts: '2026-02-20T00:01:00.000Z',
        payload: {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          worker_id: 'fetch-1',
        },
      },
      {
        run_id: runId,
        event: 'parse_finished',
        ts: '2026-02-20T00:01:03.000Z',
        payload: {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          worker_id: 'fetch-1',
          screenshot_uri: screenshotKey,
        },
      },
    ];

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      resolveIndexLabRunDirectory: async () => archivedRunDir,
      readIndexLabRunEvents: async () => events,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'workers', 'fetch-1'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(res.statusCode, 200);
    assert.equal(body.screenshots.length, 1);
    assert.equal(body.screenshots[0].bytes, screenshotBuffer.length);
    assert.equal(body.screenshots[0].width, 1);
    assert.equal(body.screenshots[0].height, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: archived cache runtime asset route serves cached run_output screenshots', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-archived-shot-asset-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const runId = 'run-ops-archived-shot-asset';
  const archivedRunDir = path.join(outputRoot, '_runtime', 'archived_runs', 's3', runId, 'indexlab');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(archivedRunDir, { recursive: true });
  await fs.writeFile(path.join(archivedRunDir, 'run.json'), JSON.stringify({
    run_id: runId,
    category: 'mouse',
    product_id: 'mouse-test-brand-model',
    status: 'completed',
  }), 'utf8');
  await fs.writeFile(path.join(archivedRunDir, 'run_events.ndjson'), '', 'utf8');

  try {
    const screenshotKey = `specs/outputs/mouse/mouse-test-brand-model/runs/${runId}/raw/screenshots/razer.com__0000/screenshot.png`;
    const screenshotPath = path.join(
      outputRoot,
      '_runtime',
      'archived_runs',
      's3',
      runId,
      'run_output',
      'raw',
      'screenshots',
      'razer.com__0000',
      'screenshot.png',
    );
    const screenshotBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZkQ0AAAAASUVORK5CYII=',
      'base64',
    );
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, screenshotBuffer);

    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      OUTPUT_ROOT: outputRoot,
      storage: {
        resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
      },
      config: { runtimeOpsWorkbenchEnabled: true },
      resolveIndexLabRunDirectory: async () => archivedRunDir,
      readIndexLabRunEvents: async () => [],
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createStreamingMockRes();
    await handler(
      ['indexlab', 'run', runId, 'runtime', 'assets', encodeURIComponent(screenshotKey)],
      new URLSearchParams(),
      'GET',
      null,
      res,
    );
    await new Promise((resolve, reject) => {
      if (res.writableFinished) {
        resolve();
        return;
      }
      res.once('finish', resolve);
      res.once('error', reject);
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.deepEqual(res.body, screenshotBuffer);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: unmatched paths return false', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (base, sub) => path.join(base, String(sub || '')),
      path,
    });
    const res = createMockRes();
    const result = await handler(['other', 'route'], new URLSearchParams(), 'GET', null, res);
    assert.equal(result, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: prefetch hydrates missing field_rule_gate_counts from field rules payload', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-prefetch-gates-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-ops-prefetch-gates';
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

  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(path.join(runDir, 'search_profile.json'), JSON.stringify({
    query_count: 2,
    provider: 'searxng',
    query_rows: [
      { query: 'Razer Viper V3 Pro specs', hint_source: 'field_rules.search_hints' },
      { query: 'Razer Viper V3 Pro support', hint_source: 'field_rules.search_hints' },
    ],
    hint_source_counts: {
      'field_rules.search_hints': 72,
    },
  }), 'utf8');

  const generated = path.join(helperRoot, 'mouse', '_generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(path.join(generated, 'field_rules.json'), JSON.stringify({
    fields: {
      connection: {
        search_hints: {
          query_terms: ['connection', 'connectivity'],
          domain_hints: ['razer.com', 'support.razer.com'],
          preferred_content_types: ['support'],
        },
      },
      dpi: {
        search_hints: {
          query_terms: ['dpi'],
          domain_hints: [],
          preferred_content_types: [],
        },
      },
    },
  }), 'utf8');

  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: {
        runtimeOpsWorkbenchEnabled: true,
        categoryAuthorityRoot: helperRoot,
      },
      readIndexLabRunEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.ok(body?.search_profile?.field_rule_gate_counts);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.total_value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.effective_value_count, 3);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.effective_value_count, 1);
    assert.ok(body?.search_profile?.field_rule_hint_counts_by_field);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.query_terms?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.total_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.domain_hints?.effective_value_count, 2);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.connection?.preferred_content_types?.effective_value_count, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOpsRoutes: prefetch domain_hints expose effective vs total counts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-prefetch-domain-ratio-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  const helperRoot = path.join(tempRoot, 'category_authority');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-ops-prefetch-domain-ratio';
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

  const runDir = path.join(indexLabRoot, runId);
  await fs.writeFile(path.join(runDir, 'search_profile.json'), JSON.stringify({
    query_count: 1,
    provider: 'searxng',
    query_rows: [
      { query: 'Razer Viper V3 Pro weight', hint_source: 'field_rules.search_hints', target_fields: ['weight'] },
    ],
    hint_source_counts: {
      'field_rules.search_hints': 1,
    },
  }), 'utf8');

  const generated = path.join(helperRoot, 'mouse', '_generated');
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(path.join(generated, 'field_rules.json'), JSON.stringify({
    fields: {
      weight: {
        search_hints: {
          query_terms: ['weight'],
          domain_hints: ['manufacturer', 'support', 'manual', 'pdf'],
          preferred_content_types: ['spec'],
        },
      },
    },
  }), 'utf8');

  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: {
        runtimeOpsWorkbenchEnabled: true,
        categoryAuthorityRoot: helperRoot,
      },
      readIndexLabRunEvents: async () => [],
      readIndexLabRunSearchProfile: async () => null,
      safeReadJson: async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf8');
          return JSON.parse(content);
        } catch {
          return null;
        }
      },
      safeJoin: (base, sub) => {
        const s = String(sub || '').trim();
        if (!s) return '';
        return path.join(base, s);
      },
      path,
    });

    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'prefetch'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);

    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.value_count, 0);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.total_value_count, 4);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.domain_hints']?.effective_value_count, 0);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.value_count, 0);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.total_value_count, 4);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.domain_hints?.effective_value_count, 0);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.query_terms']?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_gate_counts['search_hints.preferred_content_types']?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.query_terms?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.query_terms?.effective_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.preferred_content_types?.total_value_count, 1);
    assert.equal(body.search_profile.field_rule_hint_counts_by_field.weight?.preferred_content_types?.effective_value_count, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
