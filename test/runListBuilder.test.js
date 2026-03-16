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
    for (const key of ['run_id', 'category', 'product_id', 'status', 'started_at', 'ended_at', 'run_dir', 'counters']) {
      assert.ok(key in row, `missing key: ${key}`);
    }
    assert.equal(row.run_id, 'run-001');
    assert.equal(row.category, 'mouse');
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
