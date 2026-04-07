import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createCatalogBuilder } from '../catalogHelpers.js';
import { createCatalogSummary } from './helpers/appApiTestBuilders.js';

// WHY: Contract tests for the SQL-based catalog builder path.

function cleanVariant(variant) {
  const token = String(variant ?? '').trim().toLowerCase();
  if (token === '' || token === 'unk' || token === 'unknown' || token === 'n/a') return '';
  return String(variant).trim();
}

function createMockSpecDb({ products = [], queueProducts = [], summaries = {} } = {}) {
  return {
    getAllProducts: () => products,
    getAllQueueProducts: () => queueProducts,
    getSummaryForProduct: (pid) => summaries[pid] || null,
  };
}

function createMockStorage() {
  return {
    async objectExists(key) {
      return key.includes('mouse-acme-orbit-x1');
    },
    resolveOutputKey(category, productId) {
      return `out/${category}/${productId}/latest`;
    },
  };
}

test('SQL catalog builder: returns CatalogRow[] from SQL products table', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: createMockStorage(),
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 10, product_id: 'mouse-acme-orbit-x1', brand: 'Acme', model: 'Orbit X1', base_model: 'Orbit X1', variant: '', identifier: 'abc123', status: 'active' },
      ],
      queueProducts: [
        { product_id: 'mouse-acme-orbit-x1', status: 'complete' },
      ],
      summaries: {
        'mouse-acme-orbit-x1': createCatalogSummary(),
      },
    }),
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    productId: 'mouse-acme-orbit-x1',
    id: 10,
    identifier: 'abc123',
    brand: 'Acme',
    brand_identifier: '',
    model: 'Orbit X1',
    base_model: 'Orbit X1',
    variant: '',
    status: 'complete',
    hasFinal: true,
    validated: true,
    confidence: 0.86,
    coverage: 0.77,
    fieldsFilled: 7,
    fieldsTotal: 9,
    lastRun: '2026-02-26T10:00:00.000Z',
    inActive: true,
  });
});

test('SQL catalog builder: skips products with empty brand or base_model', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: createMockStorage(),
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-empty', brand: '', model: 'X', base_model: 'X', variant: '', identifier: '', status: 'active' },
        { id: 2, product_id: 'mouse-nobase', brand: 'Acme', model: 'Orbit', base_model: '', variant: '', identifier: '', status: 'active' },
        { id: 3, product_id: 'mouse-good', brand: 'Razer', model: 'Viper', base_model: 'Viper', variant: '', identifier: 'r1', status: 'active' },
      ],
    }),
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].brand, 'Razer');
});

test('SQL catalog builder: sorts by brand → model → variant', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: createMockStorage(),
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 2, product_id: 'mouse-z', brand: 'Zowie', model: 'FK2', base_model: 'FK2', variant: '', identifier: '', status: 'active' },
        { id: 1, product_id: 'mouse-a', brand: 'Acme', model: 'Orbit', base_model: 'Orbit', variant: '', identifier: '', status: 'active' },
        { id: 3, product_id: 'mouse-a2', brand: 'Acme', model: 'Orbit Pro', base_model: 'Orbit', variant: 'Pro', identifier: '', status: 'active' },
      ],
    }),
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].brand, 'Acme');
  assert.equal(rows[0].variant, '');
  assert.equal(rows[1].brand, 'Acme');
  assert.equal(rows[1].variant, 'Pro');
  assert.equal(rows[2].brand, 'Zowie');
});

test('SQL catalog builder: empty DB returns empty array', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: createMockStorage(),
    getSpecDb: () => createMockSpecDb(),
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, []);
});

test('SQL catalog builder: product with no queue entry defaults to pending', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: { async objectExists() { return false; }, resolveOutputKey: () => '' },
    getSpecDb: () => createMockSpecDb({
      products: [
        { id: 1, product_id: 'mouse-new', brand: 'Test', model: 'New', base_model: 'New', variant: '', identifier: '', status: 'active' },
      ],
    }),
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].validated, false);
  assert.equal(rows[0].confidence, 0);
});

test('SQL catalog builder: null specDb returns empty array', async () => {
  const buildCatalog = createCatalogBuilder({
    config: {},
    storage: createMockStorage(),
    getSpecDb: () => null,
    cleanVariant,
    path,
  });

  const rows = await buildCatalog('mouse');
  assert.deepEqual(rows, []);
});
