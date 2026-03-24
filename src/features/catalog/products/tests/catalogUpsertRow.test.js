import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { upsertCatalogProductRow } from '../upsertCatalogProductRow.js';

function createSpecDb(overrides = {}) {
  return {
    upsertProduct() {},
    ...overrides,
  };
}

describe('upsertCatalogProductRow contract', () => {
  const validProduct = {
    brand: ' Logitech ',
    model: ' G Pro X ',
    variant: ' Superlight ',
    status: ' active ',
    seed_urls: ['https://example.com'],
    identifier: ' lg-gpx ',
  };

  it('returns true for a valid product row', () => {
    strictEqual(
      upsertCatalogProductRow(createSpecDb(), 'mice', 'pid-1', validProduct),
      true,
    );
  });

  it('returns true when optional product fields are missing', () => {
    strictEqual(
      upsertCatalogProductRow(createSpecDb(), 'mice', 'pid-1', {}),
      true,
    );
  });

  it('returns false when specDb lacks upsertProduct', () => {
    strictEqual(upsertCatalogProductRow({}, 'mice', 'pid-1', validProduct), false);
    strictEqual(upsertCatalogProductRow(null, 'mice', 'pid-1', validProduct), false);
    strictEqual(upsertCatalogProductRow(undefined, 'mice', 'pid-1', validProduct), false);
  });

  it('returns false when productId is falsy', () => {
    const specDb = createSpecDb();
    strictEqual(upsertCatalogProductRow(specDb, 'mice', '', validProduct), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', null, validProduct), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', undefined, validProduct), false);
  });

  it('returns false when product is missing or non-object', () => {
    const specDb = createSpecDb();
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', null), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', undefined), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', 'string'), false);
    strictEqual(upsertCatalogProductRow(specDb, 'mice', 'pid-1', 42), false);
  });
});
