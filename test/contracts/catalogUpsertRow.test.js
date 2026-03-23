// WHY: Characterization test locking down upsertCatalogProductRow behavior
// before wiring it into catalogRoutes.js and brandRoutes.js (replacing inline copies).

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { upsertCatalogProductRow } from '../../src/features/catalog/products/upsertCatalogProductRow.js';

function createSpySpecDb(overrides = {}) {
  const calls = [];
  return {
    calls,
    upsertProduct(row) { calls.push(row); },
    ...overrides,
  };
}

describe('upsertCatalogProductRow', () => {
  const validProduct = {
    brand: ' Logitech ',
    model: ' G Pro X ',
    variant: ' Superlight ',
    status: ' active ',
    seed_urls: ['https://example.com'],
    identifier: ' lg-gpx ',
  };

  it('returns true and calls upsertProduct with coerced fields', () => {
    const specDb = createSpySpecDb();
    const result = upsertCatalogProductRow(specDb, 'mice', 'pid-1', validProduct);
    strictEqual(result, true);
    strictEqual(specDb.calls.length, 1);
    deepStrictEqual(specDb.calls[0], {
      category: 'mice',
      product_id: 'pid-1',
      brand: 'Logitech',
      model: 'G Pro X',
      variant: 'Superlight',
      status: 'active',
      seed_urls: ['https://example.com'],
      identifier: 'lg-gpx',
    });
  });

  it('specDb.category takes precedence over category param', () => {
    const specDb = createSpySpecDb({ category: 'keyboards' });
    upsertCatalogProductRow(specDb, 'mice', 'pid-1', validProduct);
    strictEqual(specDb.calls[0].category, 'keyboards');
  });

  it('lowercases and trims category param', () => {
    const specDb = createSpySpecDb();
    upsertCatalogProductRow(specDb, '  MICE  ', 'pid-1', validProduct);
    strictEqual(specDb.calls[0].category, 'mice');
  });

  it('returns false when specDb lacks upsertProduct', () => {
    strictEqual(upsertCatalogProductRow({}, 'mice', 'pid-1', validProduct), false);
    strictEqual(upsertCatalogProductRow(null, 'mice', 'pid-1', validProduct), false);
    strictEqual(upsertCatalogProductRow(undefined, 'mice', 'pid-1', validProduct), false);
  });

  it('returns false when productId is falsy', () => {
    const specDb = createSpySpecDb();
    strictEqual(upsertCatalogProductRow(specDb, 'mice', '', validProduct), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', null, validProduct), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', undefined, validProduct), false);
    strictEqual(specDb.calls.length, 0);
  });

  it('returns false when product is missing or non-object', () => {
    const specDb = createSpySpecDb();
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', null), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', undefined), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', 'string'), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', 42), false);
    strictEqual(specDb.calls.length, 0);
  });

  it('coerces empty brand/model/variant to empty string', () => {
    const specDb = createSpySpecDb();
    upsertCatalogProductRow(specDb, 'mice', 'pid-1', {});
    strictEqual(specDb.calls[0].brand, '');
    strictEqual(specDb.calls[0].model, '');
    strictEqual(specDb.calls[0].variant, '');
  });

  it('defaults missing status to "active"', () => {
    const specDb = createSpySpecDb();
    upsertCatalogProductRow(specDb, 'mice', 'pid-1', {});
    strictEqual(specDb.calls[0].status, 'active');
  });

  it('coerces non-array seed_urls to empty array', () => {
    const specDb = createSpySpecDb();
    upsertCatalogProductRow(specDb, 'mice', 'pid-1', { seed_urls: 'not-array' });
    deepStrictEqual(specDb.calls[0].seed_urls, []);
  });

  it('coerces missing identifier to null', () => {
    const specDb = createSpySpecDb();
    upsertCatalogProductRow(specDb, 'mice', 'pid-1', {});
    strictEqual(specDb.calls[0].identifier, null);
  });
});
