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

// WHY: Phase F — brand_identifier pass-through
describe('upsertCatalogProductRow — brand_identifier', () => {
  function capturingSpecDb() {
    let captured = null;
    return {
      specDb: createSpecDb({ upsertProduct(row) { captured = row; } }),
      getCaptured: () => captured,
    };
  }

  it('passes brand_identifier through when present', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', model: 'Viper', brand_identifier: 'b5a50d8f',
    });
    strictEqual(getCaptured().brand_identifier, 'b5a50d8f');
  });

  it('passes empty string when brand_identifier absent', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', model: 'Viper',
    });
    strictEqual(getCaptured().brand_identifier, '');
  });

  it('trims whitespace from brand_identifier', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', model: 'Viper', brand_identifier: '  b5a50d8f  ',
    });
    strictEqual(getCaptured().brand_identifier, 'b5a50d8f');
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

  it('strips fabricated variant: base_model="OP1 8k", variant="8k" → variant=""', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Endgame Gear', base_model: 'OP1 8k', variant: '8k',
    });
    strictEqual(getCaptured().variant, '');
  });

  it('strips fabricated variant: base_model="Cestus 310", variant="310" → variant=""', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Acer', base_model: 'Cestus 310', variant: '310',
    });
    strictEqual(getCaptured().variant, '');
  });

  it('preserves real variant: base_model="Viper V3 Pro", variant="Wireless"', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', base_model: 'Viper V3 Pro', variant: 'Wireless',
    });
    strictEqual(getCaptured().variant, 'Wireless');
  });

  it('preserves empty variant', () => {
    const { specDb, getCaptured } = capturingSpecDb();
    upsertCatalogProductRow(specDb, 'mouse', 'pid-1', {
      brand: 'Razer', base_model: 'DeathAdder V3', variant: '',
    });
    strictEqual(getCaptured().variant, '');
  });
});
