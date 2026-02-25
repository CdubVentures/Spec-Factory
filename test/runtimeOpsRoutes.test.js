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

async function setupFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-ops-routes-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-ops-test';
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

  return { tempRoot, indexLabRoot, runId };
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
  const helperRoot = path.join(tempRoot, 'helper_files');
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

  const controlPlane = path.join(helperRoot, 'mouse', '_control_plane');
  const generated = path.join(helperRoot, 'mouse', '_generated');
  await fs.mkdir(controlPlane, { recursive: true });
  await fs.mkdir(generated, { recursive: true });
  await fs.writeFile(path.join(controlPlane, 'field_rules_draft.json'), JSON.stringify({
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
  await fs.writeFile(path.join(generated, 'field_rules.json'), JSON.stringify({
    fields: {
      connection: {
        search_hints: {
          query_terms: ['legacy'],
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
        helperFilesRoot: helperRoot,
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
  const helperRoot = path.join(tempRoot, 'helper_files');
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

  const controlPlane = path.join(helperRoot, 'mouse', '_control_plane');
  await fs.mkdir(controlPlane, { recursive: true });
  await fs.writeFile(path.join(controlPlane, 'field_rules_draft.json'), JSON.stringify({
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
        helperFilesRoot: helperRoot,
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
