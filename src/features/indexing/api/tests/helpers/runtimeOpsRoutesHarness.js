import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';

import {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
} from '../../builders/indexlabDataBuilders.js';
import { registerRuntimeOpsRoutes } from '../../runtimeOpsRoutes.js';

export {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
  readIndexLabRunMeta,
  resolveIndexLabRunDirectory,
};

export async function createRuntimeOpsRoot(prefix) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });
  return { tempRoot, indexLabRoot, outputRoot };
}

export async function cleanupTempRoot(tempRoot) {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

export function createStorageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null,
  };
}

export function createArchivedS3StorageStub(files = {}) {
  const normalized = new Map(
    Object.entries(files).map(([key, value]) => [
      String(key),
      Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'),
    ]),
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

export async function createRunFixture({ rootDir, runId, meta, events }) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(meta)}\n`, 'utf8');
  const eventText = events.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${eventText}\n`, 'utf8');
}

export function createMockRes() {
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
        Object.entries(headers).forEach(([header, value]) => {
          res.headers[header.toLowerCase()] = value;
        });
      }
    },
    end(data) {
      res.body = data;
    },
  };
  return res;
}

export function createStreamingMockRes() {
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
        Object.entries(headers).forEach(([header, value]) => {
          this.headers[String(header).toLowerCase()] = value;
        });
      }
    }

    _write(chunk, _encoding, callback) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    }

    end(chunk, encoding, callback) {
      if (chunk) {
        this.chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined),
        );
      }
      this.body = Buffer.concat(this.chunks);
      return super.end(null, undefined, callback);
    }
  }

  return new MockWritable();
}

export async function waitForStreamFinish(res) {
  await new Promise((resolve, reject) => {
    if (res.writableFinished) {
      resolve();
      return;
    }
    res.once('finish', resolve);
    res.once('error', reject);
  });
}

export function parseResBody(res) {
  try {
    return JSON.parse(String(res.body || ''));
  } catch {
    return null;
  }
}

export function jsonRes(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function readJsonOrNull(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function statOrNull(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

export function safeJoinPath(base, sub) {
  const segment = String(sub || '').trim();
  if (!segment) {
    return '';
  }
  return path.join(base, segment);
}

export function createOutputRootStorage(outputRoot) {
  return {
    resolveLocalPath: (key) => path.join(outputRoot, ...String(key || '').split('/')),
  };
}

export async function setupFixture() {
  const { tempRoot, indexLabRoot, outputRoot } = await createRuntimeOpsRoot('runtime-ops-routes-');
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

  return { tempRoot, indexLabRoot, outputRoot, runId, runDir };
}

export function createRuntimeOpsHandler({
  indexLabRoot,
  outputRoot,
  config = {},
  ...overrides
}) {
  return registerRuntimeOpsRoutes({
    jsonRes,
    toInt,
    INDEXLAB_ROOT: indexLabRoot,
    OUTPUT_ROOT: outputRoot,
    config,
    safeReadJson: readJsonOrNull,
    safeJoin: safeJoinPath,
    path,
    ...overrides,
  });
}
