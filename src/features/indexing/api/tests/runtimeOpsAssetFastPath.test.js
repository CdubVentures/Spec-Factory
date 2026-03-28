import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import { registerRuntimeOpsRoutes } from '../runtimeOpsRoutes.js';
import { initIndexLabDataBuilders } from '../builders/indexlabDataBuilders.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function waitForStream(res) {
  if (res.writableFinished) return;
  await new Promise((resolve) => res.on('finish', resolve));
}

function parseResBody(res) {
  try { return JSON.parse(String(res.body || '')); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Fixture: creates a temp run with a screenshot file on disk
// ---------------------------------------------------------------------------

async function createAssetFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'asset-fast-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-asset-test';
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });

  // run.json + events so the run is resolvable
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify({ run_id: runId, category: 'keyboard', status: 'completed' }),
  );
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '');

  // Screenshot in local run dir
  const screenshotsDir = path.join(runDir, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });
  const pngContent = Buffer.from('fake-png-bytes');
  await fs.writeFile(path.join(screenshotsDir, 'shot1.png'), pngContent);

  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot,
    storage: {
      resolveOutputKey: (...parts) => parts.map((p) => String(p || '')).filter(Boolean).join('/'),
      resolveInputKey: (...parts) => parts.map((p) => String(p || '')).filter(Boolean).join('/'),
      readJsonOrNull: async () => null,
    },
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
  });

  return { tempRoot, indexLabRoot, outputRoot, runId, runDir, pngContent };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runtimeOpsAssetFastPath', () => {
  test('local run asset is served from the runtime asset route', async () => {
    const { tempRoot, indexLabRoot, outputRoot, runId, pngContent } = await createAssetFixture();
    try {
      const handler = registerRuntimeOpsRoutes({
        jsonRes,
        toInt,
        INDEXLAB_ROOT: indexLabRoot,
        OUTPUT_ROOT: outputRoot,
        config: {},
        storage: { resolveOutputKey: (...p) => p.join('/'), resolveInputKey: (...p) => p.join('/'), readJsonOrNull: async () => null },
        readIndexLabRunEvents: async () => [],
        readRunSummaryEvents: async () => [],
        readIndexLabRunMeta: async () => ({ run_id: runId, status: 'completed' }),
        resolveIndexLabRunDirectory: async () => path.join(indexLabRoot, runId),
        safeReadJson: async () => null,
        safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
        path,
      });

      const res = createStreamingMockRes();
      const result = await handler(
        ['indexlab', 'run', runId, 'runtime', 'assets', 'shot1.png'],
        new URLSearchParams(),
        'GET',
        null,
        res,
      );
      await waitForStream(res);

      assert.equal(result, true, 'handler should return true for served asset');
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'image/png');
      assert.deepEqual(res.body, pngContent);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('path traversal filename returns 400', async () => {
    const { tempRoot, indexLabRoot, outputRoot, runId } = await createAssetFixture();
    try {
      const handler = registerRuntimeOpsRoutes({
        jsonRes,
        toInt,
        INDEXLAB_ROOT: indexLabRoot,
        OUTPUT_ROOT: outputRoot,
        config: {},
        storage: { resolveOutputKey: (...p) => p.join('/'), resolveInputKey: (...p) => p.join('/'), readJsonOrNull: async () => null },
        readIndexLabRunEvents: async () => [],
        readRunSummaryEvents: async () => [],
        readIndexLabRunMeta: async () => ({ run_id: runId, status: 'completed' }),
        resolveIndexLabRunDirectory: async () => path.join(indexLabRoot, runId),
        safeReadJson: async () => null,
        safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
        path,
      });

      const res = createStreamingMockRes();
      const result = await handler(
        ['indexlab', 'run', runId, 'runtime', 'assets', '..%2F..%2Fetc%2Fpasswd'],
        new URLSearchParams(),
        'GET',
        null,
        res,
      );
      await waitForStream(res);

      assert.equal(result, true);
      assert.equal(res.statusCode, 400);
      const body = parseResBody(res);
      assert.equal(body?.error, 'invalid_filename');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('absolute filename returns 400', async () => {
    const { tempRoot, indexLabRoot, outputRoot, runId } = await createAssetFixture();
    try {
      const handler = registerRuntimeOpsRoutes({
        jsonRes,
        toInt,
        INDEXLAB_ROOT: indexLabRoot,
        OUTPUT_ROOT: outputRoot,
        config: {},
        storage: { resolveOutputKey: (...p) => p.join('/'), resolveInputKey: (...p) => p.join('/'), readJsonOrNull: async () => null },
        readIndexLabRunEvents: async () => [],
        readRunSummaryEvents: async () => [],
        readIndexLabRunMeta: async () => ({ run_id: runId, status: 'completed' }),
        resolveIndexLabRunDirectory: async () => path.join(indexLabRoot, runId),
        safeReadJson: async () => null,
        safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
        path,
      });

      const res = createStreamingMockRes();
      const result = await handler(
        ['indexlab', 'run', runId, 'runtime', 'assets', encodeURIComponent('/etc/passwd')],
        new URLSearchParams(),
        'GET',
        null,
        res,
      );
      await waitForStream(res);

      assert.equal(result, true);
      assert.equal(res.statusCode, 400);
      const body = parseResBody(res);
      assert.equal(body?.error, 'invalid_filename');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('correct MIME type for .webp', async () => {
    const { tempRoot, indexLabRoot, outputRoot, runId, runDir } = await createAssetFixture();
    try {
      const screenshotsDir = path.join(runDir, 'screenshots');
      await fs.writeFile(path.join(screenshotsDir, 'test.webp'), Buffer.from('webp-data'));

      const handler = registerRuntimeOpsRoutes({
        jsonRes,
        toInt,
        INDEXLAB_ROOT: indexLabRoot,
        OUTPUT_ROOT: outputRoot,
        config: {},
        storage: { resolveOutputKey: (...p) => p.join('/'), resolveInputKey: (...p) => p.join('/'), readJsonOrNull: async () => null },
        readIndexLabRunEvents: async () => [],
        readRunSummaryEvents: async () => [],
        readIndexLabRunMeta: async () => ({ run_id: runId, status: 'completed' }),
        resolveIndexLabRunDirectory: async () => path.join(indexLabRoot, runId),
        safeReadJson: async () => null,
        safeJoin: (...args) => path.join(...args.map((a) => String(a || ''))),
        path,
      });

      const res = createStreamingMockRes();
      const result = await handler(
        ['indexlab', 'run', runId, 'runtime', 'assets', 'test.webp'],
        new URLSearchParams(),
        'GET',
        null,
        res,
      );
      await waitForStream(res);

      assert.equal(result, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'image/webp');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
