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
