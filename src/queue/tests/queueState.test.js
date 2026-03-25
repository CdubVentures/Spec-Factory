import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../s3/storage.js';
import {
  clearQueueByStatus,
  listQueueProducts,
  loadQueueState,
  markQueueRunning,
  markStaleQueueProducts,
  migrateQueueEntry,
  recordQueueFailure,
  recordQueueRunResult,
  selectNextQueueProduct,
  syncQueueFromInputs,
  upsertQueueProduct
} from '../queueState.js';

function makeStorage(tempRoot) {
  return createStorage({
    localMode: true,
    localInputRoot: path.join(tempRoot, 'fixtures'),
    localOutputRoot: path.join(tempRoot, 'out'),
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs'
  });
}

function makeSpecDb(category) {
  const rows = new Map();
  const toRow = (productId, patch = {}) => ({
    category,
    product_id: productId,
    s3key: patch.s3key || '',
    status: patch.status || 'pending',
    priority: patch.priority ?? 3,
    attempts_total: patch.attempts_total ?? 0,
    retry_count: patch.retry_count ?? 0,
    max_attempts: patch.max_attempts ?? 3,
    next_retry_at: patch.next_retry_at ?? null,
    last_run_id: patch.last_run_id ?? null,
    cost_usd_total: patch.cost_usd_total ?? 0,
    rounds_completed: patch.rounds_completed ?? 0,
    next_action_hint: patch.next_action_hint ?? null,
    last_urls_attempted: Array.isArray(patch.last_urls_attempted) ? patch.last_urls_attempted : [],
    last_error: patch.last_error ?? null,
    last_started_at: patch.last_started_at ?? null,
    last_completed_at: patch.last_completed_at ?? null,
    updated_at: patch.updated_at || new Date().toISOString(),
    last_summary: patch.last_summary ?? null,
  });

  return {
    category,
    db: {
      transaction: (fn) => (...args) => fn(...args),
    },
    getQueueProduct: (productId) => rows.get(String(productId || '').trim()) || null,
    getAllQueueProducts: (statusFilter) => {
      const all = [...rows.values()];
      if (!statusFilter) return all;
      return all.filter((r) => r.status === statusFilter);
    },
    upsertQueueProduct: (row) => {
      rows.set(String(row.product_id || '').trim(), toRow(row.product_id, row));
    },
    updateQueueProductPatch: (productId, patch) => {
      const existing = rows.get(String(productId || '').trim());
      if (!existing) return null;
      const merged = toRow(productId, { ...existing, ...patch });
      rows.set(String(productId || '').trim(), merged);
      return merged;
    },
    selectNextQueueProductSql: () => {
      const eligible = [...rows.values()].filter((r) =>
        !['complete', 'blocked', 'paused', 'skipped', 'failed', 'exhausted', 'needs_manual'].includes(r.status)
      );
      if (!eligible.length) return null;
      eligible.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
      return eligible[0];
    },
    deleteQueueProduct: (productId) => ({ changes: rows.delete(String(productId || '').trim()) ? 1 : 0 }),
    clearQueueByStatus: (status) => {
      const removed = [];
      for (const [id, row] of rows) {
        if (row.status === status) { removed.push(id); rows.delete(id); }
      }
      return { changes: removed.length };
    },
  };
}

test('selectNextQueueProduct skips paused and future-retry rows', () => {
  const now = Date.now();
  const next = selectNextQueueProduct({
    products: {
      'mouse-a': {
        productId: 'mouse-a',
        status: 'pending',
        next_retry_at: new Date(now + 60_000).toISOString()
      },
      'mouse-b': {
        productId: 'mouse-b',
        status: 'pending',
        next_retry_at: ''
      },
      'mouse-c': {
        productId: 'mouse-c',
        status: 'paused',
        next_retry_at: ''
      }
    }
  });

  assert.equal(next?.productId, 'mouse-b');
});

test('recordQueueFailure applies exponential retry and then hard-fails at max attempts', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-failure-'));
  const storage = makeStorage(tempRoot);

  try {
    await upsertQueueProduct({
      storage,
      category: 'mouse',
      productId: 'mouse-logitech-g-pro-x-superlight-2',
      s3key: 'specs/inputs/mouse/products/mouse-logitech-g-pro-x-superlight-2.json',
      patch: {
        status: 'pending',
        max_attempts: 2
      }
    });

    const first = await recordQueueFailure({
      storage,
      category: 'mouse',
      productId: 'mouse-logitech-g-pro-x-superlight-2',
      s3key: 'specs/inputs/mouse/products/mouse-logitech-g-pro-x-superlight-2.json',
      error: new Error('network timeout')
    });
    assert.equal(first.product.status, 'pending');
    assert.equal(first.product.retry_count, 1);
    assert.equal(Boolean(first.product.next_retry_at), true);
    assert.equal(String(first.product.last_error || '').includes('network timeout'), true);

    const second = await recordQueueFailure({
      storage,
      category: 'mouse',
      productId: 'mouse-logitech-g-pro-x-superlight-2',
      s3key: 'specs/inputs/mouse/products/mouse-logitech-g-pro-x-superlight-2.json',
      error: new Error('network timeout')
    });
    assert.equal(second.product.status, 'failed');
    assert.equal(second.product.retry_count, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('markStaleQueueProducts marks old complete rows as stale', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-stale-'));
  const storage = makeStorage(tempRoot);

  try {
    await upsertQueueProduct({
      storage,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-pro',
      s3key: 'specs/inputs/mouse/products/mouse-razer-viper-v3-pro.json',
      patch: {
        status: 'complete',
        last_completed_at: '2025-01-01T00:00:00.000Z'
      }
    });
    await upsertQueueProduct({
      storage,
      category: 'mouse',
      productId: 'mouse-razer-viper-v3-hyperspeed',
      s3key: 'specs/inputs/mouse/products/mouse-razer-viper-v3-hyperspeed.json',
      patch: {
        status: 'complete',
        last_completed_at: '2026-02-12T00:00:00.000Z'
      }
    });

    const stale = await markStaleQueueProducts({
      storage,
      category: 'mouse',
      staleAfterDays: 30,
      nowIso: '2026-02-13T00:00:00.000Z'
    });
    assert.equal(stale.stale_marked, 1);
    assert.equal(stale.products.includes('mouse-razer-viper-v3-pro'), true);

    const loaded = await loadQueueState({ storage, category: 'mouse' });
    assert.equal(loaded.state.products['mouse-razer-viper-v3-pro'].status, 'stale');
    assert.equal(loaded.state.products['mouse-razer-viper-v3-hyperspeed'].status, 'complete');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('loadQueueState recovers from corrupt queue state json and allows rewrite on upsert', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-corrupt-'));
  const storage = makeStorage(tempRoot);
  const category = 'mouse';
  const modernKey = `_queue/${category}/state.json`;
  const legacyKey = storage.resolveOutputKey('_queue', category, 'state.json');

  try {
    await storage.writeObject(modernKey, Buffer.from('{"category":"mouse","products":{}}}', 'utf8'));
    await storage.writeObject(legacyKey, Buffer.from('{"category":"mouse","products":{}}}', 'utf8'));

    const loaded = await loadQueueState({ storage, category });
    assert.equal(loaded.recovered_from_corrupt_state, true);
    assert.deepEqual(loaded.state.products, {});

    await upsertQueueProduct({
      storage,
      category,
      productId: 'mouse-recovery-check',
      s3key: 'specs/inputs/mouse/products/mouse-recovery-check.json',
      patch: { status: 'pending' }
    });

    const after = await loadQueueState({ storage, category });
    assert.equal(Boolean(after.state.products['mouse-recovery-check']), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('syncQueueFromInputs applies identity gate and skips conflicting variant files', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-gate-'));
  const storage = makeStorage(tempRoot);
  const helperRoot = path.join(tempRoot, 'category_authority');
  const category = 'mouse';

  try {
    const cpDir = path.join(helperRoot, category, '_control_plane');
    await fs.mkdir(cpDir, { recursive: true });
    await fs.writeFile(path.join(cpDir, 'product_catalog.json'), JSON.stringify({
      _version: 1,
      products: {
        'mouse-acer-cestus-310': {
          brand: 'Acer',
          model: 'Cestus 310',
          variant: ''
        }
      }
    }, null, 2), 'utf8');

    await storage.writeObject(
      'specs/inputs/mouse/products/mouse-acer-cestus-310.json',
      Buffer.from(JSON.stringify({
        productId: 'mouse-acer-cestus-310',
        category: 'mouse',
        identityLock: { brand: 'Acer', model: 'Cestus 310', variant: '' },
        seedUrls: [],
        anchors: {}
      }), 'utf8')
    );
    await storage.writeObject(
      'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json',
      Buffer.from(JSON.stringify({
        productId: 'mouse-acer-cestus-310-310',
        category: 'mouse',
        identityLock: { brand: 'Acer', model: 'Cestus 310', variant: '310' },
        seedUrls: [],
        anchors: {}
      }), 'utf8')
    );

    const sync = await syncQueueFromInputs({
      storage,
      category,
      config: { categoryAuthorityRoot: helperRoot }
    });

    assert.equal(sync.added, 1);
    assert.equal(sync.rejected_by_identity_gate, 1);

    const loaded = await loadQueueState({ storage, category });
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310']), true);
    assert.equal(Boolean(loaded.state.products['mouse-acer-cestus-310-310']), false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('migrateQueueEntry removes old sqlite queue row when specDb is present', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-migrate-db-'));
  const storage = makeStorage(tempRoot);
  const category = 'mouse';
  const oldProductId = 'mouse-razer-viper-v3-pro';
  const newProductId = 'mouse-razer-viper-v3-pro-se';
  const specDb = makeSpecDb(category);

  try {
    specDb.upsertQueueProduct({
      product_id: oldProductId,
      s3key: `specs/inputs/${category}/products/${oldProductId}.json`,
      status: 'queued',
    });

    const migrated = await migrateQueueEntry({
      storage,
      category,
      oldProductId,
      newProductId,
      specDb,
    });

    assert.equal(migrated, true);

    const loaded = await loadQueueState({ storage, category, specDb });
    assert.equal(Boolean(loaded.state.products[newProductId]), true);
    assert.equal(Boolean(loaded.state.products[oldProductId]), false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

// ── SpecDb-path characterization tests ──────────────────────────────
// WHY: Lock down SpecDb behavior before extracting storage adapter.

test('loadQueueState via specDb returns normalized products', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-load-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({ product_id: 'mouse-a', s3key: 'k/a.json', status: 'pending', priority: 2 });
    specDb.upsertQueueProduct({ product_id: 'mouse-b', s3key: 'k/b.json', status: 'complete', priority: 1 });

    const loaded = await loadQueueState({ storage, category: 'mouse', specDb });
    assert.equal(Object.keys(loaded.state.products).length, 2);
    assert.equal(loaded.state.products['mouse-a'].status, 'pending');
    assert.equal(loaded.state.products['mouse-a'].priority, 2);
    assert.equal(loaded.state.products['mouse-b'].status, 'complete');
    assert.equal(loaded.recovered_from_corrupt_state, false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('upsertQueueProduct via specDb reads, merges, and writes back', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-upsert-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({ product_id: 'mouse-x', s3key: 'k/x.json', status: 'pending', priority: 3 });

    const result = await upsertQueueProduct({
      storage, category: 'mouse', productId: 'mouse-x',
      patch: { status: 'running', priority: 1 }, specDb,
    });

    assert.equal(result.product.status, 'running');
    assert.equal(result.product.priority, 1);
    assert.equal(result.product.s3key, 'k/x.json');

    const dbRow = specDb.getQueueProduct('mouse-x');
    assert.equal(dbRow.status, 'running');
    assert.equal(dbRow.priority, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recordQueueRunResult via specDb accumulates cost and updates status', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-record-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({
      product_id: 'mouse-run', s3key: 'k/run.json', status: 'running',
      cost_usd_total: 0.5, rounds_completed: 1, attempts_total: 1,
    });

    const result = await recordQueueRunResult({
      storage, category: 'mouse', s3key: 'k/run.json',
      result: {
        productId: 'mouse-run', runId: 'run-002',
        summary: { confidence: 0.85, llm: { cost_usd_run: 0.25 } },
      },
      roundResult: {},
      specDb,
    });

    assert.equal(result.product.attempts_total, 2);
    assert.equal(result.product.rounds_completed, 2);
    assert.equal(result.product.last_run_id, 'run-002');
    assert.ok(result.product.cost_usd_total_for_product > 0.5);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recordQueueFailure via specDb applies retry backoff', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-fail-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({
      product_id: 'mouse-fail', s3key: 'k/fail.json', status: 'running', max_attempts: 2,
    });

    const first = await recordQueueFailure({
      storage, category: 'mouse', productId: 'mouse-fail',
      s3key: 'k/fail.json', error: new Error('timeout'), specDb,
    });
    assert.equal(first.product.status, 'pending');
    assert.equal(first.product.retry_count, 1);
    assert.ok(first.product.next_retry_at);

    const second = await recordQueueFailure({
      storage, category: 'mouse', productId: 'mouse-fail',
      s3key: 'k/fail.json', error: new Error('timeout'), specDb,
    });
    assert.equal(second.product.status, 'failed');
    assert.equal(second.product.retry_count, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('markStaleQueueProducts via specDb patches stale rows', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-stale-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({
      product_id: 'mouse-old', s3key: 'k/old.json', status: 'complete',
      last_completed_at: '2025-01-01T00:00:00.000Z',
    });
    specDb.upsertQueueProduct({
      product_id: 'mouse-new', s3key: 'k/new.json', status: 'complete',
      last_completed_at: '2026-02-12T00:00:00.000Z',
    });

    const result = await markStaleQueueProducts({
      storage, category: 'mouse', staleAfterDays: 30,
      nowIso: '2026-02-13T00:00:00.000Z', specDb,
    });

    assert.equal(result.stale_marked, 1);
    assert.ok(result.products.includes('mouse-old'));
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('listQueueProducts via specDb returns sorted rows', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-list-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({ product_id: 'mouse-lo', status: 'pending', priority: 5 });
    specDb.upsertQueueProduct({ product_id: 'mouse-hi', status: 'pending', priority: 1 });
    specDb.upsertQueueProduct({ product_id: 'mouse-done', status: 'complete', priority: 1 });

    const all = await listQueueProducts({ storage, category: 'mouse', specDb });
    assert.equal(all.length, 3);
    assert.equal(all[0].priority, 1);

    const pendingOnly = await listQueueProducts({ storage, category: 'mouse', status: 'pending', specDb });
    assert.equal(pendingOnly.length, 2);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('clearQueueByStatus via specDb removes matching rows', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-clear-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({ product_id: 'mouse-a', status: 'failed' });
    specDb.upsertQueueProduct({ product_id: 'mouse-b', status: 'failed' });
    specDb.upsertQueueProduct({ product_id: 'mouse-c', status: 'pending' });

    const result = await clearQueueByStatus({ storage, category: 'mouse', status: 'failed', specDb });
    assert.equal(result.removed_count, 2);
    assert.ok(result.removed_product_ids.includes('mouse-a'));
    assert.ok(result.removed_product_ids.includes('mouse-b'));

    const remaining = specDb.getAllQueueProducts();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].product_id, 'mouse-c');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('markQueueRunning via specDb sets running status and timestamps', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-queue-specdb-running-'));
  const storage = makeStorage(tempRoot);
  const specDb = makeSpecDb('mouse');

  try {
    specDb.upsertQueueProduct({ product_id: 'mouse-start', s3key: 'k/start.json', status: 'pending' });

    const result = await markQueueRunning({
      storage, category: 'mouse', productId: 'mouse-start',
      s3key: 'k/start.json', specDb,
    });

    assert.equal(result.product.status, 'running');
    assert.ok(result.product.last_started_at);

    const dbRow = specDb.getQueueProduct('mouse-start');
    assert.equal(dbRow.status, 'running');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('selectNextQueueProduct via specDb delegates to SQL selection', async () => {
  const specDb = makeSpecDb('mouse');
  specDb.upsertQueueProduct({ product_id: 'mouse-hi', status: 'pending', priority: 1 });
  specDb.upsertQueueProduct({ product_id: 'mouse-lo', status: 'pending', priority: 5 });
  specDb.upsertQueueProduct({ product_id: 'mouse-done', status: 'complete', priority: 1 });

  const next = selectNextQueueProduct({}, { specDb });
  assert.equal(next?.product_id || next?.productId, 'mouse-hi');
});
