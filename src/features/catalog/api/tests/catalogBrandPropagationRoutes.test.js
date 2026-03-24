import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalogRoutes } from '../catalogRoutes.js';
import { registerBrandRoutes } from '../brandRoutes.js';
import {
  getDataPropagationCountersSnapshot,
  resetDataPropagationCounters,
} from '../../../../observability/dataPropagationCounters.js';

function noop() {}

function makeCatalogCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    toInt: (value, fallback = 0) => {
      const n = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    },
    config: {},
    storage: {},
    reconcileOrphans: async () => ({ ok: true }),
    buildCatalog: async () => [],
    listProducts: async () => [],
    catalogAddProduct: async () => ({ ok: true, productId: 'mouse-razer-viper', product: {} }),
    catalogAddProductsBulk: async () => ({ ok: true, created: 0 }),
    catalogUpdateProduct: async () => ({ ok: true, productId: 'mouse-razer-viper', product: {} }),
    catalogRemoveProduct: async () => ({ ok: true, removed: true }),
    catalogSeedFromCatalog: async () => ({ ok: true, seeded: 0 }),
    upsertQueueProduct: async () => ({ ok: true }),
    loadProductCatalog: async () => ({ products: {} }),
    readJsonlEvents: async () => [],
    fs: { readFile: async () => '' },
    path: { join: (...parts) => parts.join('/') },
    OUTPUT_ROOT: 'out',
    sessionCache: { getSessionRules: async () => ({ cleanFieldOrder: [] }) },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    listDirs: async () => [],
    HELPER_ROOT: 'category_authority',
    broadcastWs: noop,
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    getSpecDb: () => null,
  };
  return { ...ctx, ...overrides };
}

function makeBrandCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    storage: {},
    loadBrandRegistry: async () => ({ brands: {} }),
    saveBrandRegistry: async () => ({ ok: true }),
    addBrand: async () => ({ ok: true }),
    addBrandsBulk: async () => ({ ok: true, created: 0 }),
    updateBrand: async () => ({ ok: true, brand: { categories: [] } }),
    removeBrand: async () => ({ ok: true, products_by_category: {} }),
    getBrandsForCategory: () => [],
    seedBrandsFromActiveFiltering: async () => ({ ok: true, seeded: 0 }),
    renameBrand: async () => ({ ok: true, oldSlug: '', newSlug: '', cascaded_products: 0, cascade_results: [] }),
    getBrandImpactAnalysis: async () => ({ ok: true }),
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    upsertQueueProduct: async () => ({ ok: true }),
    broadcastWs: noop,
    getSpecDb: () => null,
  };
  return { ...ctx, ...overrides };
}

test('catalog routes: product add passes specDb into queue upsert and upserts products table', async () => {
  const queueCalls = [];
  const upsertRows = [];
  const specDb = {
    category: 'mouse',
    upsertProduct: (row) => { upsertRows.push(row); },
  };

  const handler = registerCatalogRoutes(makeCatalogCtx({
    readJsonBody: async () => ({ brand: 'Razer', model: 'Viper', variant: '' }),
    upsertQueueProduct: async (args) => {
      queueCalls.push(args);
      return { ok: true };
    },
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    catalogAddProduct: async ({ upsertQueue }) => {
      await upsertQueue({
        storage: {},
        category: 'mouse',
        productId: 'mouse-razer-viper',
        s3key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
        patch: { status: 'pending' },
      });
      return {
        ok: true,
        productId: 'mouse-razer-viper',
        product: {
          brand: 'Razer',
          model: 'Viper',
          variant: '',
          status: 'active',
          seed_urls: ['https://example.com'],
          identifier: 'id_123',
        },
      };
    },
  }));

  const result = await handler(['catalog', 'mouse', 'products'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 201);
  assert.equal(queueCalls.length, 1);
  assert.equal(queueCalls[0].specDb, specDb);
  assert.equal(upsertRows.length, 1);
  assert.equal(upsertRows[0].product_id, 'mouse-razer-viper');
  assert.equal(upsertRows[0].brand, 'Razer');
});

test('catalog routes: product rename syncs old/new products in specDb', async () => {
  const upsertRows = [];
  const deleted = [];
  const specDb = {
    category: 'mouse',
    upsertProduct: (row) => { upsertRows.push(row); },
    deleteProduct: (productId) => {
      deleted.push(productId);
      return { changes: 1 };
    },
  };

  const handler = registerCatalogRoutes(makeCatalogCtx({
    readJsonBody: async () => ({ model: 'Viper V3' }),
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    catalogUpdateProduct: async () => ({
      ok: true,
      previousProductId: 'mouse-razer-viper',
      productId: 'mouse-razer-viper-v3',
      product: {
        brand: 'Razer',
        model: 'Viper V3',
        variant: '',
        status: 'active',
        seed_urls: [],
        identifier: 'id_123',
      },
    }),
  }));

  const result = await handler(['catalog', 'mouse', 'products', 'mouse-razer-viper'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.deepEqual(deleted, ['mouse-razer-viper']);
  assert.equal(upsertRows.length, 1);
  assert.equal(upsertRows[0].product_id, 'mouse-razer-viper-v3');
});

test('catalog routes: product delete surfaces queue cleanup failures', async () => {
  resetDataPropagationCounters();
  const specDb = {
    category: 'mouse',
    deleteQueueProduct: () => {
      throw new Error('queue_delete_failed');
    },
  };

  const handler = registerCatalogRoutes(makeCatalogCtx({
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    catalogRemoveProduct: async ({ removeQueue }) => {
      await removeQueue({ category: 'mouse', productId: 'mouse-razer-viper' });
      return { ok: true, removed: true, productId: 'mouse-razer-viper' };
    },
  }));

  await assert.rejects(
    async () => handler(['catalog', 'mouse', 'products', 'mouse-razer-viper'], new URLSearchParams(), 'DELETE', {}, {}),
    /queue_delete_failed/
  );
  const snapshot = getDataPropagationCountersSnapshot();
  assert.equal(snapshot.queue_cleanup.attempt_total, 1);
  assert.equal(snapshot.queue_cleanup.failed_total, 1);
  assert.equal(snapshot.queue_cleanup.by_category.mouse.failed_total, 1);
});

test('brand routes: rename forwards getSpecDb resolver to cascade layer', async () => {
  let renameArgs = null;
  const specDb = { category: 'mouse' };

  const handler = registerBrandRoutes(makeBrandCtx({
    readJsonBody: async () => ({ name: 'Razer Pro' }),
    loadBrandRegistry: async () => ({
      brands: {
        razer: {
          canonical_name: 'Razer',
          aliases: [],
          categories: ['mouse'],
          website: '',
        },
      },
    }),
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    renameBrand: async (args) => {
      renameArgs = args;
      return {
        ok: true,
        oldSlug: 'razer',
        newSlug: 'razer-pro',
        cascaded_products: 0,
        cascade_results: [],
      };
    },
  }));

  const result = await handler(['brands', 'razer'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.ok(renameArgs);
  assert.equal(typeof renameArgs.getSpecDb, 'function');
  assert.equal(renameArgs.getSpecDb('mouse'), specDb);
});

test('catalog routes: product add emits typed data-change contract', async () => {
  resetDataPropagationCounters();
  const emitted = [];
  const handler = registerCatalogRoutes(makeCatalogCtx({
    readJsonBody: async () => ({ brand: 'Razer', model: 'Viper', variant: '' }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    catalogAddProduct: async () => ({
      ok: true,
      productId: 'mouse-razer-viper',
      product: {
        brand: 'Razer',
        model: 'Viper',
        variant: '',
        status: 'active',
        seed_urls: [],
        identifier: 'id_123',
      },
    }),
  }));

  const result = await handler(['catalog', 'mouse', 'products'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 201);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'catalog-product-add');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.entities.productIds, ['mouse-razer-viper']);
  const snapshot = getDataPropagationCountersSnapshot();
  assert.equal(snapshot.broadcast.by_event['catalog-product-add'], 1);
});

test('catalog routes: product detail resolves identity through specDb when catalog entry is missing', async () => {
  const handler = registerCatalogRoutes(makeCatalogCtx({
    storage: {
      resolveOutputKey: (category, productId, stage) => `out/${category}/${productId}/${stage}`,
      readJsonOrNull: async (key) => {
        if (key.endsWith('/normalized.json')) return { identity: {} };
        if (key.endsWith('/summary.json')) return { confidence: 0.7 };
        if (key.endsWith('/provenance.json')) return {};
        if (key.endsWith('/traffic_light.json')) return null;
        return null;
      },
    },
    loadProductCatalog: async () => ({ products: {} }),
    getSpecDb: (category) => (category === 'mouse'
      ? {
          getProduct: (productId) => (productId === 'mouse-foo-bar'
            ? {
                id: 9,
                identifier: 'db_9',
                brand: 'Db Brand',
                model: 'Db Model',
                variant: 'Db Variant',
              }
            : null),
        }
      : null),
  }));

  const result = await handler(['product', 'mouse', 'mouse-foo-bar'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.normalized.identity.id, 9);
  assert.equal(result.body.normalized.identity.identifier, 'db_9');
  assert.equal(result.body.normalized.identity.brand, 'Db Brand');
  assert.equal(result.body.normalized.identity.model, 'Db Model');
  assert.equal(result.body.normalized.identity.variant, 'Db Variant');
});

test('brand routes: seed emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerBrandRoutes(makeBrandCtx({
    readJsonBody: async () => ({ category: 'mouse' }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    seedBrandsFromActiveFiltering: async () => ({ ok: true, seeded: 3 }),
  }));

  const result = await handler(['brands', 'seed'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'brand-seed');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.equal(emitted[0].payload.meta.seeded, 3);
});
