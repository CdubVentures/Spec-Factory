import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadProductCatalog,
  saveProductCatalog,
  addProduct,
  updateProduct,
  removeProduct,
  seedFromCatalog,
  listProducts
} from '../productCatalog.js';

async function tmpConfig() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prod-cat-'));
  return { categoryAuthorityRoot: dir, _tmpDir: dir, s3InputPrefix: 'specs/inputs' };
}

async function cleanup(config) {
  try { await fs.rm(config._tmpDir, { recursive: true, force: true }); } catch {}
}

// Mock storage for tests
function mockStorage() {
  const store = new Map();
  return {
    store,
    async writeObject(key, buf) { store.set(key, buf); },
    async readJsonOrNull(key) {
      const buf = store.get(key);
      if (!buf) return null;
      return JSON.parse(buf.toString());
    },
    async deleteObject(key) { store.delete(key); },
    async objectExists(key) { return store.has(key); },
    async listInputKeys(category) {
      return [...store.keys()].filter(k => k.startsWith(`specs/inputs/${category}/products/`));
    }
  };
}

// Mock upsertQueue
function mockUpsertQueue() {
  const calls = [];
  const fn = async (args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

const HEX_PID_RE = /^mouse-[a-f0-9]{8}$/;

// --- loadProductCatalog ---

test('loadProductCatalog: returns empty catalog when file does not exist', async () => {
  const config = await tmpConfig();
  try {
    const cat = await loadProductCatalog(config, 'mouse');
    assert.equal(cat._version, 1);
    assert.deepEqual(cat.products, {});
  } finally {
    await cleanup(config);
  }
});

test('loadProductCatalog: reads existing catalog', async () => {
  const config = await tmpConfig();
  try {
    const cpDir = path.join(config.categoryAuthorityRoot, 'mouse', '_control_plane');
    await fs.mkdir(cpDir, { recursive: true });
    await fs.writeFile(path.join(cpDir, 'product_catalog.json'), JSON.stringify({
      _version: 1,
      products: {
        'mouse-a1b2c3d4': { brand: 'Razer', model: 'Viper V3 Pro', variant: '', status: 'active' }
      }
    }));
    const cat = await loadProductCatalog(config, 'mouse');
    assert.ok(cat.products['mouse-a1b2c3d4']);
    assert.equal(cat.products['mouse-a1b2c3d4'].brand, 'Razer');
  } finally {
    await cleanup(config);
  }
});

// --- addProduct ---

test('addProduct: creates product with hex-based productId', async () => {
  const config = await tmpConfig();
  const storage = mockStorage();
  const upsertQueue = mockUpsertQueue();
  try {
    const result = await addProduct({
      config, category: 'mouse', brand: 'Logitech', model: 'G Pro X Superlight 2',
      seedUrls: ['https://example.com'], storage, upsertQueue
    });

    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
    assert.equal(result.product.brand, 'Logitech');
    assert.equal(result.product.model, 'G Pro X Superlight 2');
    assert.equal(result.product.variant, '');
    assert.equal(result.product.added_by, 'gui');

    // Verify catalog persisted
    const cat = await loadProductCatalog(config, 'mouse');
    assert.ok(cat.products[result.productId]);

    // Verify input file created
    const inputKey = `specs/inputs/mouse/products/${result.productId}.json`;
    assert.ok(storage.store.has(inputKey));
    const inputFile = JSON.parse(storage.store.get(inputKey).toString());
    assert.equal(inputFile.identityLock.brand, 'Logitech');
    assert.deepEqual(inputFile.seedUrls, ['https://example.com']);

  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects duplicate', async () => {
  const config = await tmpConfig();
  try {
    await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper' });
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'product_already_exists');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects empty brand', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: '', model: 'Viper' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'brand_required');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects empty model', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', model: '' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'model_required');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: strips fabricated variant', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Acer', model: 'Cestus 310', variant: '310' });
    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
    assert.equal(result.product.variant, '');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: preserves real variant', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Corsair', model: 'M55', variant: 'Wireless' });
    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
    assert.equal(result.product.variant, 'Wireless');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: works without storage or queue', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'DeathAdder V3' });
    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
  } finally {
    await cleanup(config);
  }
});

// --- updateProduct ---

test('updateProduct: patches seed_urls without changing productId', async () => {
  const config = await tmpConfig();
  const storage = mockStorage();
  try {
    const created = await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper V3 Pro', storage });
    const pid = created.productId;

    const result = await updateProduct({
      config, category: 'mouse', productId: pid,
      patch: { seed_urls: ['https://razer.com/viper'] }, storage
    });

    assert.equal(result.ok, true);
    assert.equal(result.productId, pid);
    assert.deepEqual(result.product.seed_urls, ['https://razer.com/viper']);
    assert.ok(result.product.updated_at);
  } finally {
    await cleanup(config);
  }
});

test('updateProduct: identity change keeps same productId (immutable)', async () => {
  const config = await tmpConfig();
  const storage = mockStorage();
  try {
    const created = await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper', storage });
    const pid = created.productId;

    const result = await updateProduct({
      config, category: 'mouse', productId: pid,
      patch: { model: 'Viper V3 Pro' }, storage
    });

    assert.equal(result.ok, true);
    assert.equal(result.productId, pid);
    assert.equal(result.product.model, 'Viper V3 Pro');

    // Same catalog key, same input file
    const cat = await loadProductCatalog(config, 'mouse');
    assert.ok(cat.products[pid]);
    assert.equal(cat.products[pid].model, 'Viper V3 Pro');
    assert.ok(storage.store.has(`specs/inputs/mouse/products/${pid}.json`));
  } finally {
    await cleanup(config);
  }
});

test('updateProduct: returns error for non-existent product', async () => {
  const config = await tmpConfig();
  try {
    const result = await updateProduct({ config, category: 'mouse', productId: 'mouse-nope0000', patch: {} });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'product_not_found');
  } finally {
    await cleanup(config);
  }
});

// --- removeProduct ---

test('removeProduct: removes product and deletes input file', async () => {
  const config = await tmpConfig();
  const storage = mockStorage();
  try {
    const created = await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper', storage });
    const pid = created.productId;
    const inputKey = `specs/inputs/mouse/products/${pid}.json`;
    assert.ok(storage.store.has(inputKey));

    const result = await removeProduct({ config, category: 'mouse', productId: pid, storage });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);

    // Catalog empty
    const cat = await loadProductCatalog(config, 'mouse');
    assert.equal(cat.products[pid], undefined);

    // Input file deleted
    assert.ok(!storage.store.has(inputKey));
  } finally {
    await cleanup(config);
  }
});

test('removeProduct: returns error for non-existent product', async () => {
  const config = await tmpConfig();
  try {
    const result = await removeProduct({ config, category: 'mouse', productId: 'mouse-nope0000' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'product_not_found');
  } finally {
    await cleanup(config);
  }
});

// --- seedFromCatalog ---

test('seedFromCatalog: handles missing catalog gracefully', async () => {
  const config = await tmpConfig();
  try {
    const result = await seedFromCatalog({ config, category: 'mouse' });
    assert.equal(result.ok, true);
    assert.equal(result.seeded, 0);
    assert.equal(result.fields_imported, 0);
  } finally {
    await cleanup(config);
  }
});

test('seedFromCatalog: handles missing catalog in full mode gracefully', async () => {
  const config = await tmpConfig();
  try {
    const result = await seedFromCatalog({ config, category: 'mouse', mode: 'full' });
    assert.equal(result.ok, true);
    assert.equal(result.seeded, 0);
    assert.equal(result.fields_imported, 0);
  } finally {
    await cleanup(config);
  }
});

test('seedFromCatalog: rejects missing category', async () => {
  const config = await tmpConfig();
  try {
    const result = await seedFromCatalog({ config, category: '' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'category_required');
  } finally {
    await cleanup(config);
  }
});

test('seedFromCatalog: skips existing products in identity mode', async () => {
  const config = await tmpConfig();
  try {
    // Pre-add a product so it exists in the catalog
    await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper' });

    // Seed from catalog — the existing product should be SKIPPED in identity mode
    const result = await seedFromCatalog({ config, category: 'mouse' });
    assert.equal(result.ok, true);
    // The existing product should be counted as skipped, not seeded again
    assert.equal(result.skipped >= 1, true, `expected at least 1 skipped, got ${result.skipped}`);

    // Verify only 1 product exists (no duplicate created)
    const products = await listProducts(config, 'mouse');
    assert.equal(products.length, 1);
  } finally {
    await cleanup(config);
  }
});

// --- listProducts ---

test('listProducts: returns sorted product list', async () => {
  const config = await tmpConfig();
  try {
    await addProduct({ config, category: 'mouse', brand: 'Razer', model: 'Viper' });
    await addProduct({ config, category: 'mouse', brand: 'Logitech', model: 'G502' });
    await addProduct({ config, category: 'mouse', brand: 'Corsair', model: 'M55' });

    const products = await listProducts(config, 'mouse');
    assert.equal(products.length, 3);
    assert.equal(products[0].brand, 'Corsair');
    assert.equal(products[1].brand, 'Logitech');
    assert.equal(products[2].brand, 'Razer');
  } finally {
    await cleanup(config);
  }
});

test('listProducts: returns empty array for empty category', async () => {
  const config = await tmpConfig();
  try {
    const products = await listProducts(config, 'keyboard');
    assert.deepEqual(products, []);
  } finally {
    await cleanup(config);
  }
});
