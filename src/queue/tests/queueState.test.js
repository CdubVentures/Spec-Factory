import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../../s3/storage.js';
import {
  loadQueueState,
  markStaleQueueProducts,
  migrateQueueEntry,
  recordQueueFailure,
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
    getAllQueueProducts: () => [...rows.values()],
    upsertQueueProduct: (row) => {
      rows.set(String(row.product_id || '').trim(), toRow(row.product_id, row));
    },
    deleteQueueProduct: (productId) => ({ changes: rows.delete(productId) ? 1 : 0 }),
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
