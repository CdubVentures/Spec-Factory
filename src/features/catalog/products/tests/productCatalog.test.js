import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  addProduct,
  updateProduct,
  removeProduct,
  seedFromCatalog,
  listProducts,
} from '../productCatalog.js';
import { SpecDb } from '../../../../db/specDb.js';

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

// WHY: Since addProduct no longer writes to catalog JSON (SQL is SSOT),
// tests that need a product in the catalog must pre-seed it.
async function seedCatalogProduct(config, category, pid, product) {
  const root = config?.categoryAuthorityRoot || 'category_authority';
  const cpDir = path.join(root, category, '_control_plane');
  await fs.mkdir(cpDir, { recursive: true });
  const filePath = path.join(cpDir, 'product_catalog.json');
  let catalog = { _version: 1, products: {} };
  try { catalog = JSON.parse(await fs.readFile(filePath, 'utf8')); } catch {}
  catalog.products[pid] = product;
  await fs.writeFile(filePath, JSON.stringify(catalog, null, 2), 'utf8');
}

// --- addProduct ---

test('addProduct: creates product with hex-based productId', async () => {
  const config = await tmpConfig();
  const storage = mockStorage();
  const upsertQueue = mockUpsertQueue();
  try {
    const result = await addProduct({
      config, category: 'mouse', brand: 'Logitech', base_model: 'G Pro X Superlight 2',
      seedUrls: ['https://example.com'], storage, upsertQueue
    });

    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
    assert.equal(result.product.brand, 'Logitech');
    assert.equal(result.product.model, 'G Pro X Superlight 2');
    assert.equal(result.product.variant, '');
    assert.equal(result.product.added_by, 'gui');

    // WHY: catalog JSON is no longer mutated on CRUD. SQL is the live SSOT.
    // Product.json at .workspace/products/{pid}/ is the rebuild file.

  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects duplicate via specDb', async () => {
  const config = await tmpConfig();
  // WHY: Dup detection now uses specDb (SQL SSOT). Mock it with the first product.
  const products = [];
  const mockSpecDb = {
    getAllProducts: () => products,
  };
  try {
    const first = await addProduct({ config, category: 'mouse', brand: 'Razer', base_model: 'Viper', specDb: mockSpecDb });
    assert.equal(first.ok, true);
    // Simulate catalogRoutes.js upsertCatalogProductRow by adding to mock
    products.push({ product_id: first.productId, brand: 'Razer', base_model: 'Viper', model: 'Viper', variant: '' });
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', base_model: 'Viper', specDb: mockSpecDb });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'product_already_exists');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects empty brand', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: '', base_model: 'Viper' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'brand_required');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: rejects empty model', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', base_model: '' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'model_required');
  } finally {
    await cleanup(config);
  }
});

test('addProduct: strips fabricated variant', async () => {
  const config = await tmpConfig();
  try {
    const result = await addProduct({ config, category: 'mouse', brand: 'Acer', base_model: 'Cestus 310', variant: '310' });
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
    const result = await addProduct({ config, category: 'mouse', brand: 'Corsair', base_model: 'M55', variant: 'Wireless' });
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
    const result = await addProduct({ config, category: 'mouse', brand: 'Razer', base_model: 'DeathAdder V3' });
    assert.equal(result.ok, true);
    assert.match(result.productId, HEX_PID_RE);
  } finally {
    await cleanup(config);
  }
});

// --- updateProduct ---

test('updateProduct: patches seed_urls without changing productId', async () => {
  const config = await tmpConfig();
  try {
    const pid = 'mouse-aabb1122';
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    specDb.upsertProduct({ category: 'mouse', product_id: pid, brand: 'Razer', model: 'Viper V3 Pro', base_model: 'Viper V3 Pro', variant: '', status: 'active', seed_urls: [] });

    const result = await updateProduct({
      config, category: 'mouse', productId: pid, specDb,
      patch: { seed_urls: ['https://razer.com/viper'] }
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
  try {
    const pid = 'mouse-ccdd3344';
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    specDb.upsertProduct({ category: 'mouse', product_id: pid, brand: 'Razer', model: 'Viper', base_model: 'Viper', variant: '', status: 'active', seed_urls: [] });

    const result = await updateProduct({
      config, category: 'mouse', productId: pid, specDb,
      patch: { base_model: 'Viper V3 Pro' }
    });

    assert.equal(result.ok, true);
    assert.equal(result.productId, pid);
    assert.equal(result.product.model, 'Viper V3 Pro');
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

test('removeProduct: removes product from catalog', async () => {
  const config = await tmpConfig();
  try {
    const pid = 'mouse-eeff5566';
    const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    specDb.upsertProduct({ category: 'mouse', product_id: pid, brand: 'Razer', model: 'Viper', base_model: 'Viper', variant: '', status: 'active', seed_urls: [] });

    const result = await removeProduct({ config, category: 'mouse', productId: pid, specDb });
    assert.equal(result.ok, true);
    assert.equal(result.removed, true);
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
    // Pre-seed a product in the catalog JSON
    await seedCatalogProduct(config, 'mouse', 'mouse-11223344', { brand: 'Razer', base_model: 'Viper', model: 'Viper', variant: '', status: 'active', seed_urls: [] });

    // Seed from catalog — the existing product should be SKIPPED in identity mode
    const result = await seedFromCatalog({ config, category: 'mouse' });
    assert.equal(result.ok, true);
    assert.equal(result.skipped >= 1, true, `expected at least 1 skipped, got ${result.skipped}`);
  } finally {
    await cleanup(config);
  }
});

// --- listProducts (reads from SQL, not JSON) ---

test('listProducts: returns sorted product list from SQL', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  try {
    specDb.upsertProduct({ product_id: 'mouse-001', brand: 'Razer', model: 'Viper', base_model: 'Viper', variant: '', status: 'active', seed_urls: [], identifier: '', brand_identifier: '' });
    specDb.upsertProduct({ product_id: 'mouse-002', brand: 'Logitech', model: 'G502', base_model: 'G502', variant: '', status: 'active', seed_urls: [], identifier: '', brand_identifier: '' });
    specDb.upsertProduct({ product_id: 'mouse-003', brand: 'Corsair', model: 'M55', base_model: 'M55', variant: '', status: 'active', seed_urls: [], identifier: '', brand_identifier: '' });

    const products = listProducts({ specDb });
    assert.equal(products.length, 3);
    assert.equal(products[0].brand, 'Corsair');
    assert.equal(products[1].brand, 'Logitech');
    assert.equal(products[2].brand, 'Razer');
  } finally {
    specDb.close();
  }
});

test('listProducts: returns empty array when no products', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'keyboard' });
  try {
    const products = listProducts({ specDb });
    assert.deepEqual(products, []);
  } finally {
    specDb.close();
  }
});

test('listProducts: returns base_model and variant from SQL', () => {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
  try {
    specDb.upsertProduct({ product_id: 'mouse-001', brand: 'Finalmouse', model: 'ULX Prophecy - Scream', base_model: 'ULX Prophecy', variant: 'Scream', status: 'active', seed_urls: [], identifier: '', brand_identifier: '' });

    const products = listProducts({ specDb });
    assert.equal(products.length, 1);
    assert.equal(products[0].base_model, 'ULX Prophecy');
    assert.equal(products[0].model, 'ULX Prophecy - Scream');
    assert.equal(products[0].variant, 'Scream');
  } finally {
    specDb.close();
  }
});
