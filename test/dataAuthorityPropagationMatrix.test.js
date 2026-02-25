import test from 'node:test';
import assert from 'node:assert/strict';
import { registerStudioRoutes } from '../src/api/routes/studioRoutes.js';
import { registerCatalogRoutes } from '../src/api/routes/catalogRoutes.js';
import { registerBrandRoutes } from '../src/api/routes/brandRoutes.js';
import { handleCompileProcessCompletion } from '../src/api/services/compileProcessCompletion.js';
import { resolveDataChangeScopedCategories } from '../tools/gui-react/src/components/layout/dataChangeScope.js';
import { resolveDataChangeInvalidationQueryKeys } from '../tools/gui-react/src/api/dataChangeInvalidationMap.js';

function keySet(keys) {
  return new Set(keys.map((queryKey) => JSON.stringify(queryKey)));
}

function hasQueryKey(keys, expected) {
  return keySet(keys).has(JSON.stringify(expected));
}

function studioCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    HELPER_ROOT: 'helper_files',
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
    fs: {
      mkdir: async () => {},
      writeFile: async () => {},
      readdir: async () => [],
    },
    path: {
      join: (...parts) => parts.join('/'),
    },
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {},
        mergedFieldOrder: [],
        labels: {},
        compiledAt: null,
        mapSavedAt: null,
        compileStale: false,
      }),
      invalidateSessionCache: () => {},
    },
    loadFieldStudioMap: async () => ({ file_path: '', map: {} }),
    saveFieldStudioMap: async () => ({ ok: true }),
    validateFieldStudioMap: () => ({ ok: true, errors: [] }),
    invalidateFieldRulesCache: () => {},
    buildFieldLabelsMap: () => ({}),
    storage: {},
    loadCategoryConfig: async () => ({}),
    startProcess: () => ({ running: true }),
    broadcastWs: () => {},
    reviewLayoutByCategory: new Map(),
    loadProductCatalog: async () => ({ products: {} }),
    cleanVariant: (value) => String(value || '').trim(),
  };
  return { ...ctx, ...overrides };
}

function catalogCtx(overrides = {}) {
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
    HELPER_ROOT: 'helper_files',
    broadcastWs: () => {},
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    getSpecDb: () => null,
  };
  return { ...ctx, ...overrides };
}

function brandCtx(overrides = {}) {
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
    broadcastWs: () => {},
    getSpecDb: () => null,
    loadProductCatalog: async () => ({ products: {} }),
  };
  return { ...ctx, ...overrides };
}

test('propagation matrix: legacy draft-save route has been removed', async () => {
  const emitted = [];
  const handler = registerStudioRoutes(studioCtx({
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['studio', 'mouse', 'save-drafts'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result, false);
  assert.equal(emitted.length, 0);
});

test('propagation matrix: compile completion emits versioned process-completed and invalidates enum/component readers', async () => {
  const emitted = [];
  const result = await handleCompileProcessCompletion({
    exitCode: 0,
    cliArgs: ['category-compile', '--category', 'mouse', '--local'],
    sessionCache: { invalidateSessionCache: () => {} },
    invalidateFieldRulesCache: () => {},
    reviewLayoutByCategory: new Map(),
    syncSpecDbForCategory: async () => ({
      category: 'mouse',
      specdb_sync_version: 42,
      specdb_sync_updated_at: '2026-02-23T00:00:00.000Z',
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  });

  assert.equal(result?.category, 'mouse');
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');

  const event = emitted[0].payload;
  assert.equal(event.event, 'process-completed');
  assert.equal(event.category, 'mouse');
  assert.equal(event.version.specdb_sync_version, 42);
  assert.equal(event.version.updated_at, '2026-02-23T00:00:00.000Z');

  const categories = resolveDataChangeScopedCategories(event, 'keyboard');
  assert.deepEqual(categories, ['mouse']);
  const queryKeys = resolveDataChangeInvalidationQueryKeys({
    message: event,
    categories,
    fallbackCategory: 'mouse',
  });

  assert.equal(hasQueryKey(queryKeys, ['enumReviewData', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['componentReview', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['componentReviewData', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['studio-known-values', 'mouse']), true);
});

test('propagation matrix: model rename emits catalog-product-update and invalidates catalog/review/product readers', async () => {
  const emitted = [];
  const handler = registerCatalogRoutes(catalogCtx({
    readJsonBody: async () => ({ model: 'Viper V3 Pro' }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    catalogUpdateProduct: async () => ({
      ok: true,
      previousProductId: 'mouse-razer-viper-v3',
      productId: 'mouse-razer-viper-v3-pro',
      product: {
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        seed_urls: [],
        identifier: 'id_123',
      },
    }),
  }));

  const result = await handler(
    ['catalog', 'mouse', 'products', 'mouse-razer-viper-v3'],
    new URLSearchParams(),
    'PUT',
    {},
    {},
  );
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');

  const event = emitted[0].payload;
  assert.equal(event.event, 'catalog-product-update');
  assert.equal(event.category, 'mouse');
  assert.deepEqual(event.entities.productIds, ['mouse-razer-viper-v3-pro', 'mouse-razer-viper-v3']);

  const categories = resolveDataChangeScopedCategories(event, 'keyboard');
  assert.deepEqual(categories, ['mouse']);
  const queryKeys = resolveDataChangeInvalidationQueryKeys({
    message: event,
    categories,
    fallbackCategory: 'mouse',
  });

  assert.equal(hasQueryKey(queryKeys, ['catalog', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['catalog-products', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['catalog-review', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['product', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['componentImpact']), true);
});

test('propagation matrix: brand rename fans out global event to affected categories with queue/catalog invalidation', async () => {
  const emitted = [];
  const handler = registerBrandRoutes(brandCtx({
    readJsonBody: async () => ({ name: 'Razer Pro' }),
    loadBrandRegistry: async () => ({
      brands: {
        razer: {
          canonical_name: 'Razer',
          aliases: [],
          categories: ['mouse', 'keyboard'],
          website: '',
        },
      },
    }),
    renameBrand: async () => ({
      ok: true,
      oldSlug: 'razer',
      newSlug: 'razer-pro',
      cascaded_products: 2,
      cascade_results: [
        { ok: true, category: 'mouse', old_pid: 'mouse-razer-viper', new_pid: 'mouse-razer-pro-viper' },
        { ok: true, category: 'keyboard', old_pid: 'keyboard-razer-huntsman', new_pid: 'keyboard-razer-pro-huntsman' },
      ],
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['brands', 'razer'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');

  const event = emitted[0].payload;
  assert.equal(event.event, 'brand-rename');
  assert.equal(event.category, 'all');
  assert.deepEqual(event.categories, ['mouse', 'keyboard']);

  const scoped = resolveDataChangeScopedCategories(event, 'monitor');
  assert.deepEqual(scoped, ['mouse', 'keyboard']);
  const queryKeys = resolveDataChangeInvalidationQueryKeys({
    message: event,
    categories: scoped,
    fallbackCategory: 'monitor',
  });

  assert.equal(hasQueryKey(queryKeys, ['brands']), true);
  assert.equal(hasQueryKey(queryKeys, ['queue', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['queue', 'keyboard']), true);
  assert.equal(hasQueryKey(queryKeys, ['catalog-products', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['catalog-products', 'keyboard']), true);
  assert.equal(hasQueryKey(queryKeys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(queryKeys, ['reviewProductsIndex', 'keyboard']), true);
});
