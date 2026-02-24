import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
} from '../src/api/routes/indexlabDataBuilders.js';
import { registerRuntimeOpsRoutes } from '../src/api/routes/runtimeOpsRoutes.js';

function createStorageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null,
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
    setHeader(key, value) { res.headers[key.toLowerCase()] = value; },
    writeHead(code, headers) {
      res.statusCode = code;
      if (headers) Object.entries(headers).forEach(([k, v]) => { res.headers[k.toLowerCase()] = v; });
    },
    end(data) { res.body = data; },
  };
  return res;
}

function parseResBody(res) {
  try { return JSON.parse(String(res.body || '')); } catch { return null; }
}

function jsonRes(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(body));
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function setupFixture(extraEvents = []) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-132-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-132-test';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: { run_id: runId, category: 'mouse', product_id: 'mouse-test', started_at: '2026-02-23T00:00:00.000Z', ended_at: '2026-02-23T00:10:00.000Z', status: 'completed', round: 2 },
    events: [
      { run_id: runId, ts: '2026-02-23T00:01:00.000Z', event: 'llm_finished', payload: { batch_id: 'b1', round: 1, candidates: [{ field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract', source_url: 'https://mfr.com', source_tier: 1 }] } },
      { run_id: runId, ts: '2026-02-23T00:02:00.000Z', event: 'scheduler_fallback_started', payload: { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 } },
      { run_id: runId, ts: '2026-02-23T00:03:00.000Z', event: 'repair_query_enqueued', payload: { dedupe_key: 'r1', url: 'https://a.com/page', lane: 'repair_search', reason: '404' } },
      ...extraEvents,
    ],
  });

  initIndexLabDataBuilders({ indexLabRoot, outputRoot, storage: createStorageStub(), config: {}, getSpecDbReady: () => false, isProcessRunning: () => false });
  return { tempRoot, indexLabRoot, runId };
}

function createHandler(indexLabRoot, events) {
  return registerRuntimeOpsRoutes({
    jsonRes,
    toInt,
    INDEXLAB_ROOT: indexLabRoot,
    config: { runtimeOpsWorkbenchEnabled: true },
    readIndexLabRunEvents: async () => events,
    safeReadJson: async (filePath) => { try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return null; } },
    safeJoin: (base, sub) => { const s = String(sub || '').trim(); if (!s) return ''; return path.join(base, s); },
    path,
  });
}

test('runtimeOps132: extraction/fields returns 200 with fields array', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'llm_finished', ts: '2026-02-23T00:01:00.000Z', payload: { batch_id: 'b1', round: 1, candidates: [{ field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract', source_url: 'https://mfr.com', source_tier: 1 }] } },
    ];
    const handler = createHandler(indexLabRoot, events);
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'extraction', 'fields'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok(Array.isArray(body.fields));
    assert.ok(body.fields.length >= 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: extraction/fields?round=2 filters by round', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'llm_finished', ts: '2026-02-23T00:01:00.000Z', payload: { batch_id: 'b1', round: 1, candidates: [{ field: 'weight', value: '58g', confidence: 0.9, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 }] } },
      { event: 'llm_finished', ts: '2026-02-23T00:02:00.000Z', payload: { batch_id: 'b2', round: 2, candidates: [{ field: 'dpi', value: '30000', confidence: 0.95, method: 'llm_extract', source_url: 'https://x.com', source_tier: 1 }] } },
    ];
    const handler = createHandler(indexLabRoot, events);
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'extraction', 'fields'], new URLSearchParams('round=2'), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.fields.length, 1);
    assert.equal(body.fields[0].field, 'dpi');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: fallbacks returns 200 with events and host_profiles', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'scheduler_fallback_started', ts: '2026-02-23T00:01:00.000Z', payload: { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 } },
    ];
    const handler = createHandler(indexLabRoot, events);
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'fallbacks'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok(Array.isArray(body.events));
    assert.ok(Array.isArray(body.host_profiles));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: fallbacks?limit=1 respects limit', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'scheduler_fallback_started', ts: '2026-02-23T00:01:00.000Z', payload: { url: 'https://a.com/1', from_mode: 'http', to_mode: 'playwright', reason: '403', attempt: 1 } },
      { event: 'scheduler_fallback_started', ts: '2026-02-23T00:02:00.000Z', payload: { url: 'https://b.com/2', from_mode: 'http', to_mode: 'crawlee', reason: '403', attempt: 1 } },
    ];
    const handler = createHandler(indexLabRoot, events);
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'fallbacks'], new URLSearchParams('limit=1'), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.equal(body.events.length, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: queue returns 200 with jobs, lane_summary, blocked_hosts', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const events = [
      { event: 'repair_query_enqueued', ts: '2026-02-23T00:01:00.000Z', payload: { dedupe_key: 'r1', url: 'https://a.com/page', lane: 'repair_search', reason: '404' } },
    ];
    const handler = createHandler(indexLabRoot, events);
    const res = createMockRes();
    await handler(['indexlab', 'run', runId, 'runtime', 'queue'], new URLSearchParams(), 'GET', null, res);
    const body = parseResBody(res);
    assert.equal(res.statusCode, 200);
    assert.ok(body);
    assert.equal(body.run_id, runId);
    assert.ok(Array.isArray(body.jobs));
    assert.ok(Array.isArray(body.lane_summary));
    assert.ok(Array.isArray(body.blocked_hosts));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: all new endpoints return 404 for unknown run', async () => {
  const { tempRoot, indexLabRoot } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: true },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (base, sub) => { const s = String(sub || '').trim(); if (!s) return ''; return path.join(base, s); },
      path,
    });

    for (const subPath of [['extraction', 'fields'], ['fallbacks'], ['queue']]) {
      const res = createMockRes();
      await handler(['indexlab', 'run', 'non-existent', 'runtime', ...subPath], new URLSearchParams(), 'GET', null, res);
      assert.equal(res.statusCode, 404, `Expected 404 for ${subPath.join('/')}`);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: all new endpoints gated behind runtimeOpsWorkbenchEnabled', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const handler = registerRuntimeOpsRoutes({
      jsonRes,
      toInt,
      INDEXLAB_ROOT: indexLabRoot,
      config: { runtimeOpsWorkbenchEnabled: false },
      readIndexLabRunEvents: async () => [],
      safeReadJson: async () => null,
      safeJoin: (base, sub) => path.join(base, String(sub || '')),
      path,
    });

    for (const subPath of [['extraction', 'fields'], ['fallbacks'], ['queue']]) {
      const res = createMockRes();
      const result = await handler(['indexlab', 'run', runId, 'runtime', ...subPath], new URLSearchParams(), 'GET', null, res);
      assert.equal(result, false, `Expected false (gated) for ${subPath.join('/')}`);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('runtimeOps132: POST method returns false for new endpoints', async () => {
  const { tempRoot, indexLabRoot, runId } = await setupFixture();
  try {
    const handler = createHandler(indexLabRoot, []);
    const res = createMockRes();
    const result = await handler(['indexlab', 'run', runId, 'runtime', 'extraction', 'fields'], new URLSearchParams(), 'POST', null, res);
    assert.equal(result, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
