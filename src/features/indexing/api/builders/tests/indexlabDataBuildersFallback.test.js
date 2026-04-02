import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  resolveIndexLabRunDirectory,
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
    // SQL is SSOT — no file/events fallback, returns null when no SQL artifact
    assert.equal(payload, null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// WHY: Wave 5.5 killed latest_base fallback path. Test retired.
// SQL run_artifacts is the sole source for search_profile.

// ---------------------------------------------------------------------------
// SQL Tier 1: readIndexLabRunMeta returns SQL row when no run dir on disk
// ---------------------------------------------------------------------------

import { readIndexLabRunMeta, resolveIndexLabRunContext } from '../indexlabDataBuilders.js';

test('readIndexLabRunMeta: returns SQL row when no run dir exists on disk', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-meta-sql-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab-empty');
  const specDbDir = path.join(tempRoot, 'specdb');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(path.join(specDbDir, 'mouse'), { recursive: true });

  const sqlRow = {
    run_id: 'run-sql-only',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
    ended_at: '2026-03-01T00:05:00Z',
    counters: { pages_checked: 20 },
  };

  const mockSpecDb = {
    getRunByRunId: (id) => id === 'run-sql-only' ? sqlRow : null,
    getRunsByCategory: () => [sqlRow],
    getBridgeEventsByRunId: () => [],
  };

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot: path.join(tempRoot, 'out'),
      storage: createStorageStub(),
      config: { specDbDir },
      getSpecDbReady: async (cat) => cat === 'mouse' ? mockSpecDb : null,
      isProcessRunning: () => false,
    });

    const meta = await readIndexLabRunMeta('run-sql-only');
    assert.ok(meta, 'should return SQL row, not null');
    assert.equal(meta.run_id, 'run-sql-only');
    assert.equal(meta.category, 'mouse');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readIndexLabRunMeta: falls back to run.json when SQL row is missing', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-meta-file-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-file-only';
  await createRunFixture({
    rootDir: indexLabRoot,
    runId,
    meta: {
      schema_version: 3,
      checkpoint_type: 'crawl',
      created_at: '2026-03-02T00:00:00.000Z',
      run: {
        run_id: runId,
        category: 'mouse',
        product_id: 'mouse-file-only',
        status: 'completed',
      },
      counters: {
        urls_crawled: 12,
        urls_successful: 10,
      },
    },
    events: [],
  });

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: async () => null,
      isProcessRunning: () => false,
    });

    const meta = await readIndexLabRunMeta(runId);
    assert.ok(meta, 'should fall back to file-backed metadata');
    assert.equal(meta.run_id, runId);
    assert.equal(meta.category, 'mouse');
    assert.equal(meta.product_id, 'mouse-file-only');
    assert.equal(meta.status, 'completed');
    assert.deepEqual(meta.counters, {
      urls_crawled: 12,
      urls_successful: 10,
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolveIndexLabRunDirectory: matches aliased directory via nested run.run_id', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-alias-run-dir-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab');
  const outputRoot = path.join(tempRoot, 'out');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const runId = 'run-aliased-id';
  const aliasDir = 'watch-latest';
  const runDir = path.join(indexLabRoot, aliasDir);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify({
    schema_version: 3,
    checkpoint_type: 'crawl',
    created_at: '2026-03-02T00:00:00.000Z',
    run: {
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-watch-latest',
      status: 'completed',
    },
  })}\n`, 'utf8');

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot,
      storage: createStorageStub(),
      config: {},
      getSpecDbReady: async () => null,
      isProcessRunning: () => false,
    });

    const resolved = await resolveIndexLabRunDirectory(runId);
    assert.equal(resolved, runDir);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolveIndexLabRunContext: returns context when runDir is empty but SQL meta exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'indexlab-ctx-sql-'));
  const indexLabRoot = path.join(tempRoot, 'indexlab-empty');
  const specDbDir = path.join(tempRoot, 'specdb');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(path.join(specDbDir, 'mouse'), { recursive: true });

  const sqlRow = {
    run_id: 'run-ctx-sql',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
    ended_at: '2026-03-01T00:05:00Z',
    counters: { pages_checked: 20 },
  };

  const mockSpecDb = {
    getRunByRunId: (id) => id === 'run-ctx-sql' ? sqlRow : null,
    getRunsByCategory: () => [sqlRow],
    getBridgeEventsByRunId: () => [
      { event: 'fetch_started', ts: '2026-03-01T00:01:00Z', payload: { url: 'https://example.com' } },
    ],
  };

  try {
    initIndexLabDataBuilders({
      indexLabRoot,
      outputRoot: path.join(tempRoot, 'out'),
      storage: createStorageStub(),
      config: { specDbDir },
      getSpecDbReady: async (cat) => cat === 'mouse' ? mockSpecDb : null,
      isProcessRunning: () => false,
    });

    const ctx = await resolveIndexLabRunContext('run-ctx-sql');
    assert.ok(ctx, 'should return context, not null — even with no run dir on disk');
    assert.equal(ctx.category, 'mouse');
    assert.equal(ctx.resolvedRunId, 'run-ctx-sql');
    assert.equal(ctx.productId, 'mouse-test');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
