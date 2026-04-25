import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogBuilder } from '../catalogHelpers.js';

function cleanVariant(variant) {
  const token = String(variant ?? '').trim().toLowerCase();
  if (token === '' || token === 'unknown' || token === 'n/a') return '';
  return String(variant).trim();
}

// Mock specDb that exposes listByCategory(cat) on each finder store. Each
// summary row carries product_id + latest_ran_at, mirroring the real schema
// (src/db/specDbSchema.js:456 + finderSqlStore.js:194 listByCategory).
function makeSpecDb({ products, summaries }) {
  const stores = new Map();
  for (const [moduleId, rows] of Object.entries(summaries || {})) {
    stores.set(moduleId, {
      listByCategory: () => rows,
      getSetting: () => null,
    });
  }
  return {
    getAllProducts: () => products,
    getAllFieldCandidatesByProduct: () => [],
    getFieldKeyOrder: () => null,
    listColorEditionFinderRuns: () => [],
    listPifVariantProgressByProduct: () => [],
    variants: { listByProduct: () => [] },
    getFinderStore: (moduleId) => stores.get(moduleId) ?? null,
    getCompiledRules: () => null,
    getResolvedFieldCandidate: () => false,
    listFieldBuckets: () => [],
    countPooledQualifyingEvidenceByFingerprint: () => 0,
  };
}

const PRODUCT = {
  id: 1,
  product_id: 'mouse-1',
  brand: 'Logi',
  model: 'G Pro',
  base_model: 'G Pro',
  variant: 'Black',
  identifier: 'mouse-1',
  status: 'active',
};

test('CatalogRow lastRun: all 5 finders populated when summaries exist', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => makeSpecDb({
      products: [PRODUCT],
      summaries: {
        colorEditionFinder: [{ product_id: 'mouse-1', latest_ran_at: '2026-04-20T10:00:00Z' }],
        productImageFinder: [{ product_id: 'mouse-1', latest_ran_at: '2026-04-21T11:00:00Z' }],
        releaseDateFinder:  [{ product_id: 'mouse-1', latest_ran_at: '2026-04-22T12:00:00Z' }],
        skuFinder:          [{ product_id: 'mouse-1', latest_ran_at: '2026-04-23T13:00:00Z' }],
        keyFinder:          [{ product_id: 'mouse-1', latest_ran_at: '2026-04-24T14:00:00Z' }],
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.cefLastRunAt, '2026-04-20T10:00:00Z');
  assert.equal(r.pifLastRunAt, '2026-04-21T11:00:00Z');
  assert.equal(r.rdfLastRunAt, '2026-04-22T12:00:00Z');
  assert.equal(r.skuLastRunAt, '2026-04-23T13:00:00Z');
  assert.equal(r.kfLastRunAt,  '2026-04-24T14:00:00Z');
});

test('CatalogRow lastRun: missing summaries fall back to empty string per worker', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => makeSpecDb({
      products: [PRODUCT],
      summaries: {
        colorEditionFinder: [{ product_id: 'mouse-1', latest_ran_at: '2026-04-20T10:00:00Z' }],
        productImageFinder: [{ product_id: 'mouse-1', latest_ran_at: '2026-04-21T11:00:00Z' }],
        // RDF / SKU / KF intentionally absent
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const r = rows[0];
  assert.equal(r.cefLastRunAt, '2026-04-20T10:00:00Z');
  assert.equal(r.pifLastRunAt, '2026-04-21T11:00:00Z');
  assert.equal(r.rdfLastRunAt, '');
  assert.equal(r.skuLastRunAt, '');
  assert.equal(r.kfLastRunAt,  '');
});

test('CatalogRow lastRun: empty when no finder summaries at all', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => makeSpecDb({
      products: [PRODUCT],
      summaries: {},
    }),
    cleanVariant,
  });

  const [r] = await buildCatalog('mouse');
  assert.equal(r.cefLastRunAt, '');
  assert.equal(r.pifLastRunAt, '');
  assert.equal(r.rdfLastRunAt, '');
  assert.equal(r.skuLastRunAt, '');
  assert.equal(r.kfLastRunAt, '');
});

test('CatalogRow lastRun: per-product mapping comes from per-finder maps', async () => {
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => makeSpecDb({
      products: [
        { ...PRODUCT, id: 1, product_id: 'mouse-1' },
        { ...PRODUCT, id: 2, product_id: 'mouse-2', model: 'G Pro 2', base_model: 'G Pro 2' },
      ],
      summaries: {
        colorEditionFinder: [
          { product_id: 'mouse-1', latest_ran_at: '2026-04-20T10:00:00Z' },
          { product_id: 'mouse-2', latest_ran_at: '2026-04-25T10:00:00Z' },
        ],
        productImageFinder: [
          { product_id: 'mouse-2', latest_ran_at: '2026-04-26T11:00:00Z' },
        ],
        releaseDateFinder: [],
        skuFinder: [],
        keyFinder: [],
      },
    }),
    cleanVariant,
  });

  const rows = await buildCatalog('mouse');
  const byPid = Object.fromEntries(rows.map((r) => [r.productId, r]));
  assert.equal(byPid['mouse-1'].cefLastRunAt, '2026-04-20T10:00:00Z');
  assert.equal(byPid['mouse-1'].pifLastRunAt, '');
  assert.equal(byPid['mouse-2'].cefLastRunAt, '2026-04-25T10:00:00Z');
  assert.equal(byPid['mouse-2'].pifLastRunAt, '2026-04-26T11:00:00Z');
});

test('CatalogRow lastRun: queries each finder summary table exactly once per build', async () => {
  const callCounts = { cef: 0, pif: 0, rdf: 0, sku: 0, kf: 0 };
  const stores = {
    colorEditionFinder: { listByCategory: () => { callCounts.cef += 1; return []; }, getSetting: () => null },
    productImageFinder: { listByCategory: () => { callCounts.pif += 1; return []; }, getSetting: () => null },
    releaseDateFinder:  { listByCategory: () => { callCounts.rdf += 1; return []; }, getSetting: () => null },
    skuFinder:          { listByCategory: () => { callCounts.sku += 1; return []; }, getSetting: () => null },
    keyFinder:          { listByCategory: () => { callCounts.kf  += 1; return []; }, getSetting: () => null },
  };
  const specDb = {
    getAllProducts: () => [
      { ...PRODUCT, id: 1, product_id: 'p1' },
      { ...PRODUCT, id: 2, product_id: 'p2' },
      { ...PRODUCT, id: 3, product_id: 'p3' },
    ],
    getAllFieldCandidatesByProduct: () => [],
    getFieldKeyOrder: () => null,
    listColorEditionFinderRuns: () => [],
    listPifVariantProgressByProduct: () => [],
    variants: { listByProduct: () => [] },
    getFinderStore: (moduleId) => stores[moduleId] ?? null,
    getCompiledRules: () => null,
    getResolvedFieldCandidate: () => false,
    listFieldBuckets: () => [],
    countPooledQualifyingEvidenceByFingerprint: () => 0,
  };
  const buildCatalog = createCatalogBuilder({
    getSpecDb: () => specDb,
    cleanVariant,
  });

  await buildCatalog('mouse');

  // 5 queries total — NOT 5 × N. Confirms the batched-projection pattern.
  assert.equal(callCounts.cef, 1);
  assert.equal(callCounts.pif, 1);
  assert.equal(callCounts.rdf, 1);
  assert.equal(callCounts.sku, 1);
  assert.equal(callCounts.kf, 1);
});
