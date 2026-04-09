import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalogRoutes } from '../catalogRoutes.js';
import { registerBrandRoutes } from '../brandRoutes.js';
import {
  getDataPropagationCountersSnapshot,
  resetDataPropagationCounters,
} from '../../../../core/events/dataPropagationCounters.js';

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
    readJsonlEvents: async () => [],
    fs: { readFile: async () => '' },
    path: { join: (...parts) => parts.join('/') },
    OUTPUT_ROOT: 'out',
    sessionCache: { getSessionRules: async () => ({ cleanFieldOrder: [] }) },
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    listDirs: async () => [],
    HELPER_ROOT: 'category_authority',
    broadcastWs: noop,
    getSpecDb: () => null,
  };
  return { ...ctx, ...overrides };
}

function makeStubAppDb() {
  return {
    listBrands: () => [],
    getCategoriesForBrand: () => [],
    getBrandBySlug: () => null,
    getBrand: () => null,
    findBrandByAlias: () => null,
    listBrandsForCategory: () => [],
    upsertBrand: noop,
    deleteBrand: () => 0,
    setBrandCategories: noop,
    updateBrandFields: () => 0,
    updateBrandSlug: () => 0,
    insertBrandRename: noop,
  };
}

function makeBrandCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    storage: {},
    appDb: makeStubAppDb(),
    addBrand: async () => ({ ok: true }),
    addBrandsBulk: async () => ({ ok: true, created: 0 }),
    updateBrand: async () => ({ ok: true, brand: { categories: [] } }),
    removeBrand: async () => ({ ok: true, products_by_category: {} }),
    getBrandsForCategory: () => [],
    seedBrandsFromActiveFiltering: async () => ({ ok: true, seeded: 0 }),
    renameBrand: async () => ({ ok: true, oldSlug: '', newSlug: '', cascaded_products: 0, cascade_results: [] }),
    getBrandImpactAnalysis: async () => ({ ok: true }),
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: noop,
    getSpecDb: () => null,
    brandRegistryPath: '',
    writeBackBrandRegistry: async () => {},
  };
  return { ...ctx, ...overrides };
}

test('catalog routes: product add upserts products table', async () => {
  const upsertRows = [];
  const specDb = {
    category: 'mouse',
    upsertProduct: (row) => { upsertRows.push(row); },
  };

  const handler = registerCatalogRoutes(makeCatalogCtx({
    readJsonBody: async () => ({ brand: 'Razer', model: 'Viper', variant: '' }),
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    catalogAddProduct: async () => ({
      ok: true,
      productId: 'mouse-razer-viper',
      product: {
        brand: 'Razer',
        model: 'Viper',
        variant: '',
        status: 'active',
        identifier: 'id_123',
      },
    }),
  }));

  const result = await handler(['catalog', 'mouse', 'products'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 201);
  assert.equal(upsertRows.length, 1);
  assert.equal(upsertRows[0].product_id, 'mouse-razer-viper');
  assert.equal(upsertRows[0].brand, 'Razer');
});

test('catalog routes: product identity update upserts same productId in specDb (immutable ID)', async () => {
  const upsertRows = [];
  const specDb = {
    category: 'mouse',
    upsertProduct: (row) => { upsertRows.push(row); },
  };

  const handler = registerCatalogRoutes(makeCatalogCtx({
    readJsonBody: async () => ({ base_model: 'Viper V3', brand: 'Razer' }),
    getSpecDb: (category) => (category === 'mouse' ? specDb : null),
    catalogUpdateProduct: async () => ({
      ok: true,
      productId: 'mouse-a1b2c3d4',
      product: {
        brand: 'Razer',
        base_model: 'Viper V3',
        variant: '',
        status: 'active',
        identifier: 'id_123',
      },
    }),
  }));

  const result = await handler(['catalog', 'mouse', 'products', 'mouse-a1b2c3d4'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(upsertRows.length, 1);
  assert.equal(upsertRows[0].product_id, 'mouse-a1b2c3d4');
  assert.equal(upsertRows[0].model, 'Viper V3');
});

test('brand routes: rename forwards getSpecDb resolver to cascade layer', async () => {
  let renameArgs = null;
  const specDb = { category: 'mouse' };

  const handler = registerBrandRoutes(makeBrandCtx({
    readJsonBody: async () => ({ name: 'Razer Pro' }),
    appDb: {
      ...makeStubAppDb(),
      getBrandBySlug: (slug) => slug === 'razer'
        ? { identifier: 'b5a50d8f', canonical_name: 'Razer', slug: 'razer', aliases: '[]', website: '', added_by: 'seed', created_at: '2026-01-01', updated_at: '2026-01-01' }
        : null,
    },
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
          getProvenanceForProduct: () => ({}),
          getNormalizedForProduct: () => ({ identity: {}, fields: {} }),
          getSummaryForProduct: () => ({ confidence: 0.7 }),
          getTrafficLightForProduct: () => null,
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
