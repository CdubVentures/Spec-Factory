import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanOrphans, reconcileOrphans } from '../reconciler.js';

/**
 * In-memory storage mock that mimics the storage interface.
 */
function createMockStorage(files = {}) {
  const store = new Map(Object.entries(files));
  return {
    store,
    async readJsonOrNull(key) {
      const data = store.get(key);
      return data ? JSON.parse(JSON.stringify(data)) : null;
    },
    async readJson(key) {
      const data = store.get(key);
      if (!data) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
      return JSON.parse(JSON.stringify(data));
    },
    async writeObject(key, body) {
      const parsed = typeof body === 'string' ? JSON.parse(body) : JSON.parse(body.toString('utf8'));
      store.set(key, parsed);
    },
    async objectExists(key) {
      return store.has(key);
    },
    async deleteObject(key) {
      store.delete(key);
    },
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].join('/');
    },
  };
}

function makeProduct(productId, brand, model, variant, extra = {}) {
  return {
    productId,
    category: 'mouse',
    identityLock: { brand, base_model: model, model, variant },
    seedUrls: [],
    anchors: {},
    ...extra
  };
}

// WHY: scanOrphans now reads from specDb.getAllProducts() instead of fixture files.
function mockSpecDbFromProducts(products) {
  const rows = Object.values(products).map((p) => ({
    product_id: p.productId,
    brand: p.identityLock?.brand || '',
    base_model: p.identityLock?.base_model || '',
    model: p.identityLock?.model || '',
    variant: p.identityLock?.variant || '',
  }));
  const queueRows = Object.values(products).map((p) => ({
    product_id: p.productId,
    status: 'pending',
  }));
  return {
    getAllProducts: () => rows,
    getAllQueueProducts: (statusFilter) => statusFilter
      ? queueRows.filter(r => r.status === statusFilter)
      : queueRows,
    getQueueProduct: (pid) => queueRows.find(r => r.product_id === pid) || null,
    upsertQueueProduct: () => {},
    deleteQueueProduct: () => ({ changes: 1 }),
    clearQueueByStatus: () => {},
    db: { transaction: (fn) => fn },
  };
}

function makeQueueState(category, productIds) {
  const products = {};
  for (const id of productIds) {
    products[id] = {
      product_id: id,
      status: 'pending',
      s3key: `specs/inputs/${category}/products/${id}.json`
    };
  }
  return { category, products, updated_at: '2026-02-14T00:00:00Z' };
}

// --- scanOrphans ---

test('scanOrphans: detects fabricated variants as orphans when canonical exists', async () => {
  const products = {
    'mouse-acer-cestus-310': makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310', {
      seed: { source: 'field_studio' }
    }),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.total_scanned, 2);
  assert.equal(result.canonical_count, 1);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.warning_count, 0);
  assert.equal(result.orphans[0].productId, 'mouse-acer-cestus-310-310');
  assert.equal(result.orphans[0].canonicalProductId, 'mouse-acer-cestus-310');
  assert.equal(result.orphans[0].reason, 'fabricated_variant_with_canonical');
});

test('scanOrphans: fabricated variant WITHOUT canonical is a warning, not orphan', async () => {
  const products = {
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 1);
  assert.equal(result.warnings[0].reason, 'fabricated_variant_no_canonical');
});

test('scanOrphans: real variants are NOT flagged', async () => {
  const products = {
    'mouse-razer-viper-v3-pro': makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', ''),
    'mouse-razer-viper-v3-pro-wireless': makeProduct('mouse-razer-viper-v3-pro-wireless', 'Razer', 'Viper V3 Pro', 'Wireless'),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.canonical_count, 2);
  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 0);
});

test('scanOrphans: empty variant products are canonical', async () => {
  const products = {
    'mouse-logitech-g-pro-x-superlight-2': makeProduct('mouse-logitech-g-pro-x-superlight-2', 'Logitech', 'G Pro X Superlight 2', ''),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.canonical_count, 1);
  assert.equal(result.orphan_count, 0);
});

test('scanOrphans: multiple orphans detected in batch', async () => {
  const products = {
    'mouse-acer-cestus-310': makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
    'mouse-alienware-pro': makeProduct('mouse-alienware-pro', 'Alienware', 'Pro', ''),
    'mouse-alienware-pro-pro': makeProduct('mouse-alienware-pro-pro', 'Alienware', 'Pro', 'Pro'),
    'mouse-razer-viper-v3-pro': makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', ''),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.total_scanned, 5);
  assert.equal(result.canonical_count, 3);
  assert.equal(result.orphan_count, 2);
  const orphanIds = result.orphans.map(o => o.productId).sort();
  assert.deepEqual(orphanIds, [
    'mouse-acer-cestus-310-310',
    'mouse-alienware-pro-pro'
  ]);
});

test('scanOrphans: handles empty category gracefully', async () => {
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts({});
  const result = await scanOrphans({ storage, category: 'mouse', specDb });

  assert.equal(result.total_scanned, 0);
  assert.equal(result.orphan_count, 0);
});

test('scanOrphans: uses canonical source when specDb has products', async () => {
  // WHY: The 3 products in the scan include 1 canonical, 1 fabricated variant, 1 untracked.
  // The canonical index is built from specDb which has all 3 products.
  const products = {
    'mouse-acer-cestus-310': makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
    'mouse-unknown-brand-x1': makeProduct('mouse-unknown-brand-x1', 'Unknown', 'Brand X1', ''),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await scanOrphans({
    storage,
    category: 'mouse',
    config: {},
    specDb,
  });

  assert.equal(result.canonical_source, 'specDb');
  // WHY: With specDb as source, all non-fabricated products are canonical (2 of 3).
  assert.equal(result.canonical_count, 2);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.orphans[0].reason, 'fabricated_variant_with_canonical');
});

// --- reconcileOrphans ---

test('reconcileOrphans: dry-run mode does NOT delete anything', async () => {
  const products = {
    'mouse-acer-cestus-310': makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: true, specDb });

  assert.equal(result.dry_run, true);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 0);
  assert.equal(result.deleted[0].would_delete, true);
});

test('reconcileOrphans: live mode deletes orphan files', async () => {
  const queueState = makeQueueState('mouse', [
    'mouse-acer-cestus-310',
    'mouse-acer-cestus-310-310'
  ]);
  const products = {
    'mouse-acer-cestus-310': makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
  };
  const storage = createMockStorage({
    '_queue/mouse/state.json': queueState
  });
  const specDb = mockSpecDbFromProducts(products);

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false, specDb });

  assert.equal(result.dry_run, false);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 1);
  assert.equal(result.deleted[0].productId, 'mouse-acer-cestus-310-310');
  assert.equal(result.queue_cleaned, 0);
});

test('reconcileOrphans: no orphans returns clean report', async () => {
  const products = {
    'mouse-razer-viper-v3-pro': makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', ''),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false, specDb });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.deleted_count, 0);
  assert.equal(result.queue_cleaned, 0);
});

test('reconcileOrphans: warnings are reported but not deleted', async () => {
  const products = {
    'mouse-acer-cestus-310-310': makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false, specDb });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 1);
  assert.equal(result.deleted_count, 0);
});

test('reconcileOrphans: Redragon Woki M994 real-world case', async () => {
  const products = {
    'mouse-redragon-woki-m994': makeProduct('mouse-redragon-woki-m994', 'Redragon', 'Woki M994', ''),
    'mouse-redragon-woki-m994-m994': makeProduct('mouse-redragon-woki-m994-m994', 'Redragon', 'Woki M994', 'M994', {
      seed: { source: 'field_studio', field_studio_source_path: 'C:\\old\\path\\mouseData.xlsm' }
    }),
  };
  const storage = createMockStorage({});
  const specDb = mockSpecDbFromProducts(products);

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false, specDb });

  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 1);
  assert.equal(result.deleted[0].productId, 'mouse-redragon-woki-m994-m994');
});
