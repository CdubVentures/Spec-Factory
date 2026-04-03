import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import pathMod from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import { createSpecDbRuntime } from '../specDbRuntime.js';
import { SpecDb } from '../../../db/specDb.js';

// ── Test Harness ────────────────────────────────────────────────────────────

function createSyncResult(overrides = {}) {
  return {
    components_seeded: 0,
    list_values_seeded: 0,
    products_seeded: 0,
    duration_ms: 0,
    specdb_sync_version: 1,
    ...overrides,
  };
}

async function makeTempRoots() {
  const tempRoot = await fs.mkdtemp(pathMod.join(os.tmpdir(), 'reconcile-'));
  const indexLabRoot = pathMod.join(tempRoot, 'runs');
  const productRoot = pathMod.join(tempRoot, 'products');
  const dbDir = pathMod.join(tempRoot, 'db', 'mouse');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(productRoot, { recursive: true });
  await fs.mkdir(dbDir, { recursive: true });
  return { tempRoot, indexLabRoot, productRoot, dbDir };
}

function createRuntime({
  indexLabRoot,
  productRoot,
  dbDir,
  syncSpecDbForCategory,
  buildFieldRulesSignature,
  logger,
}) {
  return createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass: SpecDb,
    path: pathMod,
    fsSync,
    syncSpecDbForCategory: syncSpecDbForCategory || (async () => createSyncResult()),
    config: {
      localMode: true,
      categoryAuthorityRoot: 'category_authority',
      specDbDir: pathMod.dirname(dbDir),
    },
    logger: logger || { log: () => {}, error: () => {} },
    indexLabRoot,
    productRoot,
    buildFieldRulesSignature: buildFieldRulesSignature || (async () => 'sig-abc'),
  });
}

// ── Hash-gated reconcile ────────────────────────────────────────────────────

describe('specDbRuntime hash-gated reconcile', () => {
  test('skips full seed when signature unchanged', async () => {
    const { tempRoot, indexLabRoot, productRoot, dbDir } = await makeTempRoots();
    let syncCalls = 0;

    const runtime = createRuntime({
      indexLabRoot,
      productRoot,
      dbDir,
      buildFieldRulesSignature: async () => 'sig-stable',
      syncSpecDbForCategory: async () => { syncCalls++; return createSyncResult(); },
    });

    // First call: DB is new (not seeded) → auto-seed runs.
    const db1 = await runtime.getSpecDbReady('mouse');
    assert.ok(db1);
    assert.equal(syncCalls, 1);

    // Manually mark as "seeded" by inserting a row + recording signature.
    db1.db.exec("INSERT INTO products (product_id, category, brand) VALUES ('test-001', 'mouse', 'Test')");
    db1.recordSpecDbSync({
      category: 'mouse',
      status: 'ok',
      meta: { field_rules_signature: 'sig-stable' },
    });

    // Clear cache to simulate restart — file-backed DB retains state.
    runtime.specDbCache.clear();
    const db2 = await runtime.getSpecDbReady('mouse');
    assert.ok(db2);
    // syncCalls should still be 1 — hash-gated reconcile skipped because signature matches.
    assert.equal(syncCalls, 1);

    try { await fs.rm(tempRoot, { recursive: true, force: true }); } catch { /* EBUSY on Windows — SQLite file lock */ }
  });

  test('runs full seed when signature changes', async () => {
    const { tempRoot, indexLabRoot, productRoot, dbDir } = await makeTempRoots();
    let syncCalls = 0;
    let currentSig = 'sig-v1';

    const runtime = createRuntime({
      indexLabRoot,
      productRoot,
      dbDir,
      buildFieldRulesSignature: async () => currentSig,
      syncSpecDbForCategory: async () => { syncCalls++; return createSyncResult(); },
    });

    // First call: auto-seed runs.
    const db1 = await runtime.getSpecDbReady('mouse');
    assert.ok(db1);
    assert.equal(syncCalls, 1);

    // Mark seeded + store v1 signature.
    db1.db.exec("INSERT OR IGNORE INTO products (product_id, category, brand) VALUES ('test-001', 'mouse', 'Test')");
    db1.recordSpecDbSync({
      category: 'mouse',
      status: 'ok',
      meta: { field_rules_signature: 'sig-v1' },
    });

    // Change signature and clear cache.
    currentSig = 'sig-v2';
    runtime.specDbCache.clear();
    await runtime.getSpecDbReady('mouse');
    // Should have run sync again because signature differs.
    assert.equal(syncCalls, 2);

    try { await fs.rm(tempRoot, { recursive: true, force: true }); } catch { /* EBUSY on Windows — SQLite file lock */ }
  });

  test('stores new signature in sync meta after successful seed', async () => {
    const { tempRoot, indexLabRoot, productRoot, dbDir } = await makeTempRoots();

    const runtime = createRuntime({
      indexLabRoot,
      productRoot,
      dbDir,
      buildFieldRulesSignature: async () => 'sig-recorded',
      syncSpecDbForCategory: async () => createSyncResult(),
    });

    // First call: auto-seed.
    const db = await runtime.getSpecDbReady('mouse');
    assert.ok(db);

    // Mark seeded — no stored signature yet.
    db.db.exec("INSERT OR IGNORE INTO products (product_id, category, brand) VALUES ('test-001', 'mouse', 'Test')");

    // Clear cache to trigger hash-gated reconcile on next call.
    runtime.specDbCache.clear();
    const db2 = await runtime.getSpecDbReady('mouse');
    assert.ok(db2);

    // Verify the signature was recorded in sync meta.
    const state = db2.getSpecDbSyncState('mouse');
    assert.ok(state);
    const meta = typeof state.last_sync_meta === 'string'
      ? JSON.parse(state.last_sync_meta) : state.last_sync_meta;
    assert.equal(meta.field_rules_signature, 'sig-recorded');

    try { await fs.rm(tempRoot, { recursive: true, force: true }); } catch { /* EBUSY on Windows — SQLite file lock */ }
  });

  test('handles first-run (no stored signature) as changed', async () => {
    const { tempRoot, indexLabRoot, productRoot, dbDir } = await makeTempRoots();
    let syncCalls = 0;

    const runtime = createRuntime({
      indexLabRoot,
      productRoot,
      dbDir,
      buildFieldRulesSignature: async () => 'sig-new',
      syncSpecDbForCategory: async () => { syncCalls++; return createSyncResult(); },
    });

    // Fresh DB → auto-seed → reconcile treats no signature as "changed."
    await runtime.getSpecDbReady('mouse');
    assert.equal(syncCalls, 1);

    try { await fs.rm(tempRoot, { recursive: true, force: true }); } catch { /* EBUSY on Windows — SQLite file lock */ }
  });
});
