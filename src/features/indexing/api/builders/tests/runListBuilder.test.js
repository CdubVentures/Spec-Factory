import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../../db/specDb.js';

import { createRunListBuilder } from '../runListBuilder.js';

function makeSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeBuilder(tmpDir, specDb, overrides = {}) {
  return createRunListBuilder({
    getIndexLabRoot: () => tmpDir,
    isRunStillActive: () => false,
    readEvents: async () => [],
    getSpecDbReady: specDb ? async () => specDb : null,
    ...overrides,
  });
}

function sampleRun(overrides = {}) {
  return {
    run_id: 'run-001',
    category: 'mouse',
    product_id: 'mouse-a1b2c3d4',
    status: 'completed',
    started_at: '2026-01-01T00:00:00Z',
    ended_at: '2026-01-01T00:05:00Z',
    stage_cursor: 'completed',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: '',
    out_root: '',
    counters: { pages_checked: 5, fetched_ok: 3 },
    ...overrides,
  };
}

// --- Guards ---

test('missing indexlab root returns empty array', async () => {
  const builder = createRunListBuilder({
    getIndexLabRoot: () => '/tmp/nonexistent-runlist-test',
    isRunStillActive: () => false,
    readEvents: async () => [],
  });
  const result = await builder.listIndexLabRuns();
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

// --- Output shape ---

test('returned rows have expected keys', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-shape-${Date.now()}`);
  await fs.mkdir(path.join(tmpDir, 'run-001'), { recursive: true });
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleRun());
    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
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

test('picker labels use catalog brand+model+variant when provided', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-picker-${Date.now()}`);
  const runId = '20260318061504-16a0b3';
  await fs.mkdir(path.join(tmpDir, runId), { recursive: true });
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleRun({
      run_id: runId,
      product_id: 'mouse-f1e2d3c4',
      started_at: '2026-03-18T06:15:04Z',
      ended_at: '2026-03-18T06:30:00Z',
    }));
    const catalogProducts = new Map([
      ['mouse-f1e2d3c4', { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro White', variant: 'White' }],
    ]);
    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse', catalogProducts });
    assert.equal(rows[0]?.picker_label, 'Mouse • Razer Viper V3 Pro White - 6a0b3');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- Sorting ---

test('rows sorted by started_at descending', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-sort-${Date.now()}`);
  await fs.mkdir(path.join(tmpDir, 'run-a'), { recursive: true });
  await fs.mkdir(path.join(tmpDir, 'run-b'), { recursive: true });
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleRun({ run_id: 'run-a', started_at: '2026-01-01T00:00:00Z' }));
    specDb.upsertRun(sampleRun({ run_id: 'run-b', started_at: '2026-01-02T00:00:00Z' }));
    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
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
  const specDb = makeSpecDb();
  for (let i = 0; i < 5; i++) {
    await fs.mkdir(path.join(tmpDir, `run-${String(i).padStart(3, '0')}`), { recursive: true });
    specDb.upsertRun(sampleRun({
      run_id: `run-${String(i).padStart(3, '0')}`,
      started_at: `2026-01-0${i + 1}T00:00:00Z`,
    }));
  }
  try {
    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ limit: 2, category: 'mouse' });
    assert.equal(rows.length, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('completed local run with counters exposes stored counters in the row contract', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-counters-${Date.now()}`);
  const indexLabRoot = path.join(tmpDir, 'indexlab');
  await fs.mkdir(path.join(indexLabRoot, 'run-local-fast'), { recursive: true });
  const counters = { pages_checked: 10, fetch_ok: 8, parse_completed: 6, indexed_docs: 4, fields_filled: 20 };
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleRun({
      run_id: 'run-local-fast',
      product_id: 'mouse-a1b2c3d4',
      started_at: '2026-03-01T00:00:00Z',
      ended_at: '2026-03-01T00:10:00Z',
      counters,
    }));
    const builder = makeBuilder(indexLabRoot, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
    const row = rows.find((r) => r.run_id === 'run-local-fast');
    assert.ok(row, 'local run should appear');
    assert.equal(row.status, 'completed');
    assert.deepEqual(row.counters, counters);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// --- SQL path: brand/model from products table (Tier 1) ---

test('SQL path resolves brand/model from products table when available', async () => {
  const tmpDir = path.join(os.tmpdir(), `runlist-test-sql-brand-${Date.now()}`);
  const runId = '20260330090000-abc123';
  await fs.mkdir(path.join(tmpDir, runId), { recursive: true });
  try {
    const specDb = makeSpecDb();
    specDb.upsertRun(sampleRun({ run_id: runId, product_id: 'mouse-c730517d' }));
    specDb.upsertProduct({
      category: 'mouse',
      product_id: 'mouse-c730517d',
      brand: 'Acer',
      model: 'Cestus 310',
      variant: '310',
      status: 'active',
    });
    const builder = makeBuilder(tmpDir, specDb);
    const rows = await builder.listIndexLabRuns({ category: 'mouse' });
    const row = rows.find((r) => r.run_id === runId);
    assert.ok(row, 'run should appear');
    assert.equal(row.brand, 'Acer', 'brand from products table');
    assert.equal(row.model, 'Cestus 310', 'model from products table');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// File fallback identity tests removed — SQL is the sole source (Wave 5.5+).
