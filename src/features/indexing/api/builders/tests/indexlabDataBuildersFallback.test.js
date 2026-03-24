import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunNeedSet,
  readIndexLabRunSearchProfile
} from '../indexlabDataBuilders.js';

function createStorageStub() {
  return {
    resolveOutputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    resolveInputKey: (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null
  };
}

async function createRunFixture({
  rootDir,
  runId,
  meta,
  events
}) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(meta)}\n`, 'utf8');
  const eventText = events.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), `${eventText}\n`, 'utf8');
}

test('readIndexLabRunNeedSet: falls back to empty payload when run exists without needset artifacts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-needset-fallback-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-needset-fallback';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z'
    },
    events: [
      {
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-test-brand-model',
        ts: '2026-02-20T00:01:00.000Z',
        event: 'fetch_started',
        payload: { url: 'https://example.com/search?q=test' }
      }
    ]
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const payload = await readIndexLabRunNeedSet(runId);
    assert.ok(payload && typeof payload === 'object');
    assert.ok(Array.isArray(payload.fields));
    assert.equal(payload.fields.length, 0);
    assert.equal(payload.total_fields, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readIndexLabRunSearchProfile: falls back to search events when persisted profile is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-search-fallback-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-search-fallback-events';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z'
    },
    events: [
      {
        run_id: runId,
        ts: '2026-02-20T00:01:00.000Z',
        event: 'search_started',
        payload: { query: 'fnatic lamzu maya x 8k' }
      },
      {
        run_id: runId,
        ts: '2026-02-20T00:01:05.000Z',
        event: 'search_finished',
        payload: { query: 'fnatic lamzu maya x 8k', result_count: 12 }
      }
    ]
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const payload = await readIndexLabRunSearchProfile(runId);
    assert.ok(payload && typeof payload === 'object');
    assert.ok(Array.isArray(payload.queries));
    assert.equal(payload.queries.length, 1);
    assert.equal(payload.queries[0].query, 'fnatic lamzu maya x 8k');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readIndexLabRunSearchProfile: extracts query text from fetch URLs as a final fallback', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-search-url-fallback-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-search-fallback-url';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z'
    },
    events: [
      {
        run_id: runId,
        ts: '2026-02-20T00:01:00.000Z',
        event: 'fetch_started',
        payload: { url: 'https://example.com/search?q=Lamzu+Maya+X+8K' }
      }
    ]
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const payload = await readIndexLabRunSearchProfile(runId);
    assert.ok(payload && typeof payload === 'object');
    assert.ok(Array.isArray(payload.queries));
    assert.equal(payload.queries.length, 1);
    assert.equal(payload.queries[0].query, 'Lamzu Maya X 8K');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readIndexLabRunSearchProfile: resolves profile from run metadata latest_base when product-id key lookup misses', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-search-runbase-fallback-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-search-runbase-fallback';
  const latestBase = 'specs/outputs/mouse/mouse-canonical/latest';
  const latestProfilePath = path.join(outputRoot, ...latestBase.split('/'), 'search_profile.json');
  await fs.mkdir(path.dirname(latestProfilePath), { recursive: true });
  await fs.writeFile(latestProfilePath, JSON.stringify({
    source: 'run_meta_latest_base',
    query_rows: [
      {
        query: 'mouse canonical profile query',
        hint_source: 'field_rules.search_hints',
        doc_hint: 'manual',
        domain_hint: 'rtings.com',
      }
    ],
    hint_source_counts: {
      'field_rules.search_hints': 3,
      deterministic: 1
    }
  }), 'utf8');

  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-unknown-product-id',
      run_base: `specs/outputs/mouse/mouse-canonical/runs/${runId}`,
      latest_base: latestBase,
      started_at: '2026-02-20T00:00:00.000Z',
      ended_at: '2026-02-20T00:10:00.000Z'
    },
    events: [
      {
        run_id: runId,
        ts: '2026-02-20T00:01:00.000Z',
        event: 'search_started',
        payload: { query: 'fallback query should not be selected' }
      }
    ]
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: () => false,
      isProcessRunning: () => false
    });

    const payload = await readIndexLabRunSearchProfile(runId);
    assert.ok(payload && typeof payload === 'object');
    assert.equal(payload.source, 'run_meta_latest_base');
    assert.ok(Array.isArray(payload.query_rows));
    assert.equal(payload.query_rows.length, 1);
    assert.equal(payload.query_rows[0].hint_source, 'field_rules.search_hints');
    assert.equal(payload.hint_source_counts?.['field_rules.search_hints'], 3);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
