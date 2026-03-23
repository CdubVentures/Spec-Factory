import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRunListBuilder } from '../src/features/indexing/api/builders/runListBuilder.js';

function makeBuilder(overrides = {}) {
  return createRunListBuilder({
    getIndexLabRoot: () => '/tmp/nonexistent-runlist-test',
    isRunStillActive: () => false,
    readEvents: async () => [],
    refreshArchivedRunDirIndex: async () => new Map(),
    materializeArchivedRunLocation: async () => null,
    ...overrides,
  });
}

// --- Factory ---

test('createRunListBuilder returns object with expected function', () => {
  const builder = makeBuilder();
  assert.equal(typeof builder.listIndexLabRuns, 'function');
});

// --- Guards ---

test('missing indexlab root returns empty array', async () => {
  const builder = makeBuilder();
  const result = await builder.listIndexLabRuns();
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

// --- Output shape ---

test('returned rows have expected keys', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-shape-${Date.now()}`);
  const runDir = path.join(tmpDir, 'run-001');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      run_id: 'run-001',
      category: 'mouse',
      product_id: 'mouse-test-brand-model',
      status: 'completed',
      started_at: '2026-01-01T00:00:00Z',
      ended_at: '2026-01-01T00:05:00Z',
    }),
  );
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => [],
    });
    const rows = await builder.listIndexLabRuns();
    assert.ok(rows.length >= 1);
    const row = rows[0];
    for (const key of ['run_id', 'category', 'product_id', 'status', 'started_at', 'ended_at', 'run_dir', 'counters', 'storage_origin', 'storage_state', 'picker_label']) {
      assert.ok(key in row, `missing key: ${key}`);
    }
    assert.equal(row.run_id, 'run-001');
    assert.equal(row.category, 'mouse');
    assert.equal(row.storage_origin, 'local');
    assert.equal(row.storage_state, 'stored');
    assert.match(String(row.picker_label || ''), /Mouse/i);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('picker labels humanize product identity and use a short trailing run token', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-picker-label-${Date.now()}`);
  const runDir = path.join(tmpDir, '20260318061504-16a0b3');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify({
      run_id: '20260318061504-16a0b3',
      category: 'mouse',
      product_id: 'mouse-razer-viper-v3-pro-white',
      status: 'completed',
      started_at: '2026-03-18T06:15:04Z',
      ended_at: '2026-03-18T06:30:00Z',
    }),
  );
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => [],
    });
    const rows = await builder.listIndexLabRuns();
    assert.equal(rows[0]?.picker_label, 'Mouse • Razer Viper V3 Pro White - 6a0b3');
    assert.equal(rows[0]?.storage_state, 'stored');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Sorting ---

test('rows sorted by started_at descending', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-sort-${Date.now()}`);
  const runDirA = path.join(tmpDir, 'run-a');
  const runDirB = path.join(tmpDir, 'run-b');
  await fs.mkdir(runDirA, { recursive: true });
  await fs.mkdir(runDirB, { recursive: true });
  await fs.writeFile(
    path.join(runDirA, 'run.json'),
    JSON.stringify({ run_id: 'run-a', category: 'mouse', status: 'completed', started_at: '2026-01-01T00:00:00Z' }),
  );
  await fs.writeFile(
    path.join(runDirB, 'run.json'),
    JSON.stringify({ run_id: 'run-b', category: 'mouse', status: 'completed', started_at: '2026-01-02T00:00:00Z' }),
  );
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => [],
    });
    const rows = await builder.listIndexLabRuns();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].run_id, 'run-b', 'newer run should come first');
    assert.equal(rows[1].run_id, 'run-a');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Limit ---

test('respects limit parameter', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-limit-${Date.now()}`);
  for (let i = 0; i < 5; i++) {
    const runDir = path.join(tmpDir, `run-${String(i).padStart(3, '0')}`);
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify({ run_id: `run-${i}`, category: 'mouse', status: 'completed', started_at: `2026-01-0${i + 1}T00:00:00Z` }),
    );
  }
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => [],
    });
    const rows = await builder.listIndexLabRuns({ limit: 2 });
    assert.equal(rows.length, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Archive merge ---

test('includes archived runs not in live root', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-archive-${Date.now()}`);
  const liveRunDir = path.join(tmpDir, 'run-live');
  const archivedRunDir = path.join(tmpDir, 'archived', 'run-archived');
  await fs.mkdir(liveRunDir, { recursive: true });
  await fs.mkdir(archivedRunDir, { recursive: true });
  await fs.writeFile(
    path.join(liveRunDir, 'run.json'),
    JSON.stringify({ run_id: 'run-live', category: 'mouse', status: 'completed', started_at: '2026-01-01T00:00:00Z' }),
  );
  await fs.writeFile(
    path.join(archivedRunDir, 'run.json'),
    JSON.stringify({ run_id: 'run-archived', category: 'mouse', status: 'completed', started_at: '2026-01-02T00:00:00Z' }),
  );
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => [],
      refreshArchivedRunDirIndex: async () => new Map([['run-archived', archivedRunDir]]),
    });
    const rows = await builder.listIndexLabRuns();
    const runIds = rows.map((r) => r.run_id);
    assert.ok(runIds.includes('run-live'), 'should include live run');
    assert.ok(runIds.includes('run-archived'), 'should include archived run');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Metadata-only S3 fast path ---

test('S3 run with counters and completed status skips materialize and readEvents', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-metaonly-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  await fs.mkdir(indexLabRoot, { recursive: true });
  let materializeCalled = false;
  let readEventsCalled = false;
  const s3Location = {
    type: 's3',
    keyBase: 'archive/kb/prod/run-s3-fast',
    runId: 'run-s3-fast',
  };

  const meta = {
    run_id: 'run-s3-fast',
    category: 'keyboard',
    product_id: 'keyboard-test-kb',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
    ended_at: '2026-03-01T00:10:00Z',
    counters: { pages_checked: 5, fetch_ok: 5, parse_completed: 3, indexed_docs: 2, fields_filled: 10 },
    artifacts: { has_needset: true, has_search_profile: true },
  };

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      readEvents: async () => { readEventsCalled = true; return []; },
      refreshArchivedRunDirIndex: async () => new Map([['run-s3-fast', s3Location]]),
      materializeArchivedRunLocation: async () => { materializeCalled = true; return ''; },
      readArchivedS3RunMetaOnly: async () => meta,
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-s3-fast');
    assert.ok(row, 'S3 run should appear in listing');
    assert.equal(row.status, 'completed');
    assert.deepEqual(row.counters, meta.counters);
    assert.equal(row.has_needset, true);
    assert.equal(row.has_search_profile, true);
    assert.equal(path.basename(String(row.run_dir || '')), 'indexlab');
    assert.equal(materializeCalled, false, 'materializeArchivedRunLocation must NOT be called');
    assert.equal(readEventsCalled, false, 'readEvents must NOT be called');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('S3 run with status=running falls back to full materialization + events', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-running-${Date.now()}`);
  const materializedDir = path.join(tmpDir, 'materialized', 'run-s3-running');
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(materializedDir, { recursive: true });
  const meta = {
    run_id: 'run-s3-running',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'running',
    started_at: '2026-03-01T00:00:00Z',
    counters: { pages_checked: 2 },
  };
  await fs.writeFile(path.join(materializedDir, 'run.json'), JSON.stringify(meta));
  await fs.writeFile(path.join(materializedDir, 'run_events.ndjson'), '');
  let materializeCalled = false;
  let readEventsCalled = false;

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => { readEventsCalled = true; return []; },
      refreshArchivedRunDirIndex: async () => new Map([['run-s3-running', { type: 's3', keyBase: 'x', runId: 'run-s3-running' }]]),
      materializeArchivedRunLocation: async () => { materializeCalled = true; return materializedDir; },
      readArchivedS3RunMetaOnly: async () => meta,
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-s3-running');
    assert.ok(row, 'running S3 run should appear in listing');
    assert.equal(materializeCalled, true, 'materializeArchivedRunLocation should be called for running runs');
    assert.equal(readEventsCalled, true, 'readEvents should be called for running runs');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('completed local run with counters in meta skips readEvents', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-local-skip-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  const runDir = path.join(indexLabRoot, 'run-local-fast');
  await fs.mkdir(runDir, { recursive: true });
  const meta = {
    run_id: 'run-local-fast',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
    ended_at: '2026-03-01T00:10:00Z',
    counters: { pages_checked: 10, fetch_ok: 8, parse_completed: 6, indexed_docs: 4, fields_filled: 20 },
  };
  await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(meta));
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '');
  let readEventsCalled = false;

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      readEvents: async () => { readEventsCalled = true; return []; },
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-local-fast');
    assert.ok(row, 'local run should appear');
    assert.equal(row.status, 'completed');
    assert.deepEqual(row.counters, meta.counters);
    assert.equal(readEventsCalled, false, 'readEvents must NOT be called for completed local run with counters');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('running local run still reads events even with counters', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-local-running-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  const runDir = path.join(indexLabRoot, 'run-local-running');
  await fs.mkdir(runDir, { recursive: true });
  const meta = {
    run_id: 'run-local-running',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'running',
    started_at: '2026-03-01T00:00:00Z',
    counters: { pages_checked: 2 },
  };
  await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(meta));
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), '');
  let readEventsCalled = false;

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      readEvents: async () => { readEventsCalled = true; return []; },
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-local-running');
    assert.ok(row, 'running local run should appear');
    assert.equal(readEventsCalled, true, 'readEvents MUST be called for running local runs');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('S3 run without counters falls back to full materialization + events', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-nocounters-${Date.now()}`);
  const materializedDir = path.join(tmpDir, 'materialized', 'run-s3-nocount');
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(materializedDir, { recursive: true });
  const meta = {
    run_id: 'run-s3-nocount',
    category: 'keyboard',
    product_id: 'keyboard-test',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
  };
  await fs.writeFile(path.join(materializedDir, 'run.json'), JSON.stringify(meta));
  await fs.writeFile(path.join(materializedDir, 'run_events.ndjson'), '');
  let materializeCalled = false;
  let readEventsCalled = false;

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => tmpDir,
      readEvents: async () => { readEventsCalled = true; return []; },
      refreshArchivedRunDirIndex: async () => new Map([['run-s3-nocount', { type: 's3', keyBase: 'x', runId: 'run-s3-nocount' }]]),
      materializeArchivedRunLocation: async () => { materializeCalled = true; return materializedDir; },
      readArchivedS3RunMetaOnly: async () => meta,
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-s3-nocount');
    assert.ok(row, 'S3 run without counters should appear in listing');
    assert.equal(materializeCalled, true, 'materializeArchivedRunLocation should be called without counters');
    assert.equal(readEventsCalled, true, 'readEvents should be called without counters');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
