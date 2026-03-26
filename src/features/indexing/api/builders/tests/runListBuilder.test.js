import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRunListBuilder } from '../runListBuilder.js';

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

test('S3 run with counters and completed status exposes the meta-only row contract', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-metaonly-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  await fs.mkdir(indexLabRoot, { recursive: true });
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
      readEvents: async () => [],
      refreshArchivedRunDirIndex: async () => new Map([['run-s3-fast', s3Location]]),
      materializeArchivedRunLocation: async () => '',
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
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('completed local run with counters exposes stored counters in the row contract', async () => {
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

  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      readEvents: async () => [],
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-local-fast');
    assert.ok(row, 'local run should appear');
    assert.equal(row.status, 'completed');
    assert.deepEqual(row.counters, meta.counters);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Archived entry preference for non-active runs ---

test('archived S3 entry wins over live dir for completed (non-active) run', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-s3-wins-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  const liveRunDir = path.join(indexLabRoot, 'run-dual');
  await fs.mkdir(liveRunDir, { recursive: true });
  await fs.writeFile(
    path.join(liveRunDir, 'run.json'),
    JSON.stringify({
      run_id: 'run-dual',
      category: 'mouse',
      product_id: 'mouse-test',
      status: 'completed',
      started_at: '2026-03-01T00:00:00Z',
      ended_at: '2026-03-01T00:10:00Z',
      counters: { pages_checked: 5 },
    }),
  );
  const s3Location = { type: 's3', keyBase: 'archive/mouse/mouse-test/run-dual', runId: 'run-dual' };
  const s3Meta = {
    run_id: 'run-dual',
    category: 'mouse',
    product_id: 'mouse-test',
    status: 'completed',
    started_at: '2026-03-01T00:00:00Z',
    ended_at: '2026-03-01T00:10:00Z',
    counters: { pages_checked: 5 },
    artifacts: { has_needset: true, has_search_profile: true },
  };
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      isRunStillActive: () => false,
      readEvents: async () => [],
      refreshArchivedRunDirIndex: async () => new Map([['run-dual', s3Location]]),
      readArchivedS3RunMetaOnly: async () => s3Meta,
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-dual');
    assert.ok(row, 'run should appear');
    assert.equal(row.storage_origin, 's3', 'archived S3 entry should win for non-active run');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('live dir wins over archived S3 entry for active (still-running) run', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-live-wins-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  const liveRunDir = path.join(indexLabRoot, 'run-active');
  await fs.mkdir(liveRunDir, { recursive: true });
  await fs.writeFile(
    path.join(liveRunDir, 'run.json'),
    JSON.stringify({
      run_id: 'run-active',
      category: 'mouse',
      product_id: 'mouse-test',
      status: 'running',
      started_at: '2026-03-01T00:00:00Z',
    }),
  );
  await fs.writeFile(path.join(liveRunDir, 'run_events.ndjson'), '');
  const s3Location = { type: 's3', keyBase: 'archive/mouse/mouse-test/run-active', runId: 'run-active' };
  try {
    const builder = makeBuilder({
      getIndexLabRoot: () => indexLabRoot,
      isRunStillActive: (id) => id === 'run-active',
      readEvents: async () => [],
      refreshArchivedRunDirIndex: async () => new Map([['run-active', s3Location]]),
      readArchivedS3RunMetaOnly: async () => null,
    });
    const rows = await builder.listIndexLabRuns();
    const row = rows.find((r) => r.run_id === 'run-active');
    assert.ok(row, 'run should appear');
    assert.equal(row.storage_origin, 'local', 'live dir should win for active run');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
