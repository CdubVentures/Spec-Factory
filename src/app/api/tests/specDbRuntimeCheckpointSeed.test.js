import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createSpecDbRuntime } from '../specDbRuntime.js';
import { SpecDb } from '../../../db/specDb.js';

function createSyncResult(overrides = {}) {
  return {
    components_seeded: 0,
    list_values_seeded: 0,
    products_seeded: 0,
    duration_ms: 0,
    specdb_sync_version: 0,
    ...overrides,
  };
}

function sampleCheckpoint({ runId, category, productId }) {
  return {
    schema_version: 3,
    checkpoint_type: 'crawl',
    created_at: '2026-04-01T04:30:54.478Z',
    run: {
      run_id: runId,
      category,
      product_id: productId,
      s3_key: '',
      duration_ms: 120000,
      status: 'completed',
    },
    identity: { brand: 'Test', model: 'Model', variant: '' },
    counters: { urls_crawled: 5, urls_successful: 4 },
    sources: [],
    needset: null,
    search_profile: null,
    run_summary: null,
  };
}

// WHY: Subclass SpecDb to use :memory: for test isolation regardless of
// what path the runtime computes.
class MemorySpecDb extends SpecDb {
  constructor({ category }) {
    super({ dbPath: ':memory:', category });
  }

  isSeeded() {
    return false;
  }
}

// WHY: Simulates the partial-rebuild case — products/components exist
// (isSeeded = true) but the runs table is empty.
class SeededMemorySpecDb extends SpecDb {
  constructor({ category }) {
    super({ dbPath: ':memory:', category });
  }

  isSeeded() {
    return true;
  }
}

async function createTempRunFixture(indexLabRoot, { runId, category, productId }) {
  const runDir = path.join(indexLabRoot, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify(sampleCheckpoint({ runId, category, productId })),
  );
  return runDir;
}

test('auto-seed re-seeds run checkpoints from disk when indexLabRoot is provided', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-seed-'));
  const indexLabRoot = path.join(tempRoot, 'runs');
  await fs.mkdir(indexLabRoot, { recursive: true });

  await createTempRunFixture(indexLabRoot, {
    runId: 'run-seed-001',
    category: 'mouse',
    productId: 'mouse-test-product',
  });

  const logs = [];
  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: MemorySpecDb,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: {
      log: (...args) => logs.push(args.map(String).join(' ')),
      error: (...args) => logs.push(args.map(String).join(' ')),
    },
    indexLabRoot,
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const run = db.getRunByRunId('run-seed-001');
  assert.ok(run, 'run should be backfilled from checkpoint on disk');
  assert.equal(run.run_id, 'run-seed-001');
  assert.equal(run.category, 'mouse');
  assert.equal(run.product_id, 'mouse-test-product');
  assert.equal(run.status, 'completed');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('auto-seed skips checkpoint re-seed when indexLabRoot is not provided', async () => {
  const logs = [];
  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: MemorySpecDb,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: {
      log: (...args) => logs.push(args.map(String).join(' ')),
      error: (...args) => logs.push(args.map(String).join(' ')),
    },
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const run = db.getRunByRunId('nonexistent');
  assert.equal(run, null);
  assert.equal(logs.some((l) => l.includes('checkpoint')), false);
});

test('auto-seed checkpoint re-seed is idempotent — no duplicate rows on second call', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-seed-idem-'));
  const indexLabRoot = path.join(tempRoot, 'runs');
  await fs.mkdir(indexLabRoot, { recursive: true });

  await createTempRunFixture(indexLabRoot, {
    runId: 'run-idem-001',
    category: 'mouse',
    productId: 'mouse-idem-product',
  });

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: MemorySpecDb,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
    indexLabRoot,
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  // Manually call upsertRun again to simulate idempotency
  db.upsertRun({
    run_id: 'run-idem-001',
    category: 'mouse',
    product_id: 'mouse-idem-product',
    status: 'completed',
    started_at: '2026-04-01T04:30:54.478Z',
    ended_at: '2026-04-01T04:30:54.478Z',
    stage_cursor: '',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: '',
    out_root: '',
    counters: {},
  });

  const runs = db.getRunsByCategory('mouse', 100);
  assert.equal(runs.length, 1, 'should have exactly 1 run, not duplicates');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('auto-seed checkpoint re-seed skips runs belonging to a different category', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-seed-cat-'));
  const indexLabRoot = path.join(tempRoot, 'runs');
  await fs.mkdir(indexLabRoot, { recursive: true });

  await createTempRunFixture(indexLabRoot, {
    runId: 'run-keyboard-001',
    category: 'keyboard',
    productId: 'keyboard-test-product',
  });

  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: MemorySpecDb,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: { log: () => {}, error: () => {} },
    indexLabRoot,
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const run = db.getRunByRunId('run-keyboard-001');
  assert.equal(run, null, 'keyboard run should not appear in mouse DB');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('partial rebuild: checkpoint re-seed fires even when isSeeded() is true (products > 0, runs = 0)', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-seed-partial-'));
  const indexLabRoot = path.join(tempRoot, 'runs');
  await fs.mkdir(indexLabRoot, { recursive: true });

  await createTempRunFixture(indexLabRoot, {
    runId: 'run-partial-001',
    category: 'mouse',
    productId: 'mouse-partial-product',
  });

  const logs = [];
  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: SeededMemorySpecDb,
    path,
    fsSync: {
      accessSync: () => {},
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: {
      log: (...args) => logs.push(args.map(String).join(' ')),
      error: (...args) => logs.push(args.map(String).join(' ')),
    },
    indexLabRoot,
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const run = db.getRunByRunId('run-partial-001');
  assert.ok(run, 'run should be backfilled even when isSeeded() is true');
  assert.equal(run.run_id, 'run-partial-001');
  assert.equal(run.category, 'mouse');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('auto-seed continues normally when checkpoint re-seed throws', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-seed-err-'));
  // WHY: Point to a non-existent path to trigger an error in scanAndSeedCheckpoints
  const indexLabRoot = path.join(tempRoot, 'nonexistent-runs');

  const errorLogs = [];
  const runtime = createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: MemorySpecDb,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult({ components_seeded: 3 }),
    config: { localMode: true },
    logger: {
      log: () => {},
      error: (...args) => errorLogs.push(args.map(String).join(' ')),
    },
    indexLabRoot,
  });

  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db, 'DB should still be available even if checkpoint re-seed fails');

  await fs.rm(tempRoot, { recursive: true, force: true });
});
