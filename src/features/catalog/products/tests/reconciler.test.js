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
    async listInputKeys(category) {
      return [...store.keys()]
        .filter(k => k.startsWith(`specs/inputs/${category}/products/`) && k.endsWith('.json'))
        .sort();
    },
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
    resolveInputKey(...parts) {
      return ['specs/inputs', ...parts].join('/');
    }
  };
}

function makeProduct(productId, brand, model, variant, extra = {}) {
  return {
    productId,
    category: 'mouse',
    identityLock: { brand, model, variant },
    seedUrls: [],
    anchors: {},
    ...extra
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
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-acer-cestus-310.json':
      makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310', {
        seed: { source: 'field_studio' }
      })
  });

  const result = await scanOrphans({ storage, category: 'mouse' });

  assert.equal(result.total_scanned, 2);
  assert.equal(result.canonical_count, 1);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.warning_count, 0);
  assert.equal(result.orphans[0].productId, 'mouse-acer-cestus-310-310');
  assert.equal(result.orphans[0].canonicalProductId, 'mouse-acer-cestus-310');
  assert.equal(result.orphans[0].reason, 'fabricated_variant_with_canonical');
});

test('scanOrphans: fabricated variant WITHOUT canonical is a warning, not orphan', async () => {
  const storage = createMockStorage({
    // Only the fabricated version exists, no canonical
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310')
  });

  const result = await scanOrphans({ storage, category: 'mouse' });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 1);
  assert.equal(result.warnings[0].reason, 'fabricated_variant_no_canonical');
});

test('scanOrphans: real variants are NOT flagged', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-razer-viper-v3-pro.json':
      makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', ''),
    'specs/inputs/mouse/products/mouse-razer-viper-v3-pro-wireless.json':
      makeProduct('mouse-razer-viper-v3-pro-wireless', 'Razer', 'Viper V3 Pro', 'Wireless')
  });

  const result = await scanOrphans({ storage, category: 'mouse' });

  assert.equal(result.canonical_count, 2);
  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 0);
});

test('scanOrphans: empty variant products are canonical', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-logitech-g-pro-x-superlight-2.json':
      makeProduct('mouse-logitech-g-pro-x-superlight-2', 'Logitech', 'G Pro X Superlight 2', '')
  });

  const result = await scanOrphans({ storage, category: 'mouse' });

  assert.equal(result.canonical_count, 1);
  assert.equal(result.orphan_count, 0);
});

test('scanOrphans: multiple orphans detected in batch', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-acer-cestus-310.json':
      makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
    'specs/inputs/mouse/products/mouse-alienware-pro.json':
      makeProduct('mouse-alienware-pro', 'Alienware', 'Pro', ''),
    'specs/inputs/mouse/products/mouse-alienware-pro-pro.json':
      makeProduct('mouse-alienware-pro-pro', 'Alienware', 'Pro', 'Pro'),
    'specs/inputs/mouse/products/mouse-razer-viper-v3-pro.json':
      makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', '')
  });

  const result = await scanOrphans({ storage, category: 'mouse' });

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
  const result = await scanOrphans({ storage, category: 'mouse' });

  assert.equal(result.total_scanned, 0);
  assert.equal(result.orphan_count, 0);
});

test('scanOrphans: uses canonical source when categoryAuthorityRoot is provided', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reconciler-canonical-'));
  const helperRoot = path.join(tmp, 'category_authority');
  const categoryDir = path.join(helperRoot, 'mouse');
  await fs.mkdir(path.join(categoryDir, '_control_plane'), { recursive: true });
  await fs.writeFile(path.join(categoryDir, '_control_plane', 'product_catalog.json'), JSON.stringify({
    _doc: 'Per-category product catalog. Managed by GUI.',
    _version: 1,
    products: {
      'mouse-acer-cestus-310': {
        id: 1,
        identifier: 'acer-cestus-310',
        brand: 'Acer',
        model: 'Cestus 310',
        variant: '',
        status: 'active',
        seed_urls: [],
        added_at: '2026-03-09T00:00:00.000Z',
        added_by: 'test'
      },
      'mouse-razer-viper-v3-pro': {
        id: 2,
        identifier: 'razer-viper-v3-pro',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        seed_urls: [],
        added_at: '2026-03-09T00:00:01.000Z',
        added_by: 'test'
      }
    }
  }, null, 2), 'utf8');

  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-acer-cestus-310.json':
      makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
    'specs/inputs/mouse/products/mouse-unknown-brand-x1.json':
      makeProduct('mouse-unknown-brand-x1', 'Unknown', 'Brand X1', '')
  });

  try {
    const result = await scanOrphans({
      storage,
      category: 'mouse',
      config: { categoryAuthorityRoot: helperRoot }
    });

    assert.equal(result.canonical_source, 'product_catalog');
    assert.equal(result.canonical_count, 1);
    assert.equal(result.orphan_count, 1);
    assert.equal(result.untracked_count, 1);
    assert.equal(result.orphans[0].reason, 'fabricated_variant_with_canonical');
    assert.equal(result.untracked[0].reason, 'not_in_canonical_source');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// --- reconcileOrphans ---

test('reconcileOrphans: dry-run mode does NOT delete anything', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-acer-cestus-310.json':
      makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310')
  });

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: true });

  assert.equal(result.dry_run, true);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 0);
  assert.equal(result.deleted[0].would_delete, true);
  // File still exists
  assert.ok(storage.store.has('specs/inputs/mouse/products/mouse-acer-cestus-310-310.json'));
});

test('reconcileOrphans: live mode deletes orphan files', async () => {
  const queueState = makeQueueState('mouse', [
    'mouse-acer-cestus-310',
    'mouse-acer-cestus-310-310'
  ]);

  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-acer-cestus-310.json':
      makeProduct('mouse-acer-cestus-310', 'Acer', 'Cestus 310', ''),
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310'),
    // Modern queue state key: _queue/<category>/state.json
    '_queue/mouse/state.json': queueState
  });

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false });

  assert.equal(result.dry_run, false);
  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 1);
  assert.equal(result.deleted[0].productId, 'mouse-acer-cestus-310-310');
  assert.equal(result.queue_cleaned, 1);

  // Orphan file deleted
  assert.ok(!storage.store.has('specs/inputs/mouse/products/mouse-acer-cestus-310-310.json'));
  // Canonical still exists
  assert.ok(storage.store.has('specs/inputs/mouse/products/mouse-acer-cestus-310.json'));
});

test('reconcileOrphans: no orphans returns clean report', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-razer-viper-v3-pro.json':
      makeProduct('mouse-razer-viper-v3-pro', 'Razer', 'Viper V3 Pro', '')
  });

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.deleted_count, 0);
  assert.equal(result.queue_cleaned, 0);
});

test('reconcileOrphans: warnings are reported but not deleted', async () => {
  const storage = createMockStorage({
    // Fabricated variant but NO canonical — should be a warning, not deleted
    'specs/inputs/mouse/products/mouse-acer-cestus-310-310.json':
      makeProduct('mouse-acer-cestus-310-310', 'Acer', 'Cestus 310', '310')
  });

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false });

  assert.equal(result.orphan_count, 0);
  assert.equal(result.warning_count, 1);
  assert.equal(result.deleted_count, 0);
  // File still exists — warnings are NOT deleted
  assert.ok(storage.store.has('specs/inputs/mouse/products/mouse-acer-cestus-310-310.json'));
});

test('reconcileOrphans: Redragon Woki M994 real-world case', async () => {
  const storage = createMockStorage({
    'specs/inputs/mouse/products/mouse-redragon-woki-m994.json':
      makeProduct('mouse-redragon-woki-m994', 'Redragon', 'Woki M994', ''),
    'specs/inputs/mouse/products/mouse-redragon-woki-m994-m994.json':
      makeProduct('mouse-redragon-woki-m994-m994', 'Redragon', 'Woki M994', 'M994', {
        seed: { source: 'field_studio', field_studio_source_path: 'C:\\old\\path\\mouseData.xlsm' }
      })
  });

  const result = await reconcileOrphans({ storage, category: 'mouse', dryRun: false });

  assert.equal(result.orphan_count, 1);
  assert.equal(result.deleted_count, 1);
  assert.equal(result.deleted[0].productId, 'mouse-redragon-woki-m994-m994');
  assert.ok(!storage.store.has('specs/inputs/mouse/products/mouse-redragon-woki-m994-m994.json'));
});
