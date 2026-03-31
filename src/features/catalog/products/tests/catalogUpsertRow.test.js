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

// WHY: Fabricated variant stripping — variant tokens already in model must be stripped at write boundary.
describe('upsertCatalogProductRow — fabricated variant stripping', () => {
  function capturingSpecDb() {
    let captured = null;
    return {
      specDb: createSpecDb({ upsertProduct(row) { captured = row; } }),
      getCaptured: () => captured,
    };
  }

  it('strips fabricated variant: model="OP1 8k", variant="8k" → variant=""', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Endgame Gear', model: 'OP1 8k', variant: '8k',
    });
    strictEqual(getCaptured().variant, '');
  });

  it('strips fabricated variant: model="Cestus 310", variant="310" → variant=""', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Acer', model: 'Cestus 310', variant: '310',
    });
    strictEqual(getCaptured().variant, '');
  });

  it('preserves real variant: model="Viper V3 Pro", variant="Wireless"', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', model: 'Viper V3 Pro', variant: 'Wireless',
    });
    strictEqual(getCaptured().variant, 'Wireless');
  });

  it('preserves empty variant', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', model: 'DeathAdder V3', variant: '',
    });
    strictEqual(getCaptured().variant, '');
  });
});
