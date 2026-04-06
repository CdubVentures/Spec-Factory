// WHY: Phase F — verify brand_identifier column exists on products table,
// upsert stores/retrieves it, and COALESCE preserves existing values.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function createTestDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

// ── Schema ──

describe('brand_identifier column — schema', () => {
  it('products table has brand_identifier column after construction', () => {
    const db = createTestDb();
    try {
      const cols = db.db.prepare('PRAGMA table_info(products)').all();
      const col = cols.find(c => c.name === 'brand_identifier');
      assert.ok(col, 'brand_identifier column should exist on products table');
      assert.equal(col.type, 'TEXT');
      assert.equal(col.dflt_value, "''");
    } finally {
      db.close();
    }
  });

  it('idx_prod_brand_id index exists after construction', () => {
    const db = createTestDb();
    try {
      const indexes = db.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='products'").all();
      const names = indexes.map(r => r.name);
      assert.ok(names.includes('idx_prod_brand_id'), `expected idx_prod_brand_id in ${JSON.stringify(names)}`);
    } finally {
      db.close();
    }
  });
});

// ── Upsert round-trip ──

describe('brand_identifier column — upsert', () => {
  it('stores and retrieves brand_identifier via upsertProduct', () => {
    const db = createTestDb();
    try {
      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-aabb1122',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        identifier: 'aabb1122',
        brand_identifier: 'b5a50d8f',
      });
      const row = db.getProduct('mouse-aabb1122');
      assert.equal(row.brand_identifier, 'b5a50d8f');
      assert.equal(row.brand, 'Razer');
    } finally {
      db.close();
    }
  });

  it('COALESCE preserves existing brand_identifier when new value is empty', () => {
    const db = createTestDb();
    try {
      // First insert with brand_identifier
      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-aabb1122',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        identifier: 'aabb1122',
        brand_identifier: 'b5a50d8f',
      });

      // Second upsert with empty brand_identifier should preserve
      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-aabb1122',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        identifier: 'aabb1122',
        brand_identifier: '',
      });

      const row = db.getProduct('mouse-aabb1122');
      assert.equal(row.brand_identifier, 'b5a50d8f');
    } finally {
      db.close();
    }
  });

  it('overwrites brand_identifier when new value is non-empty', () => {
    const db = createTestDb();
    try {
      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-aabb1122',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        identifier: 'aabb1122',
        brand_identifier: 'oldid123',
      });

      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-aabb1122',
        brand: 'Razer',
        model: 'Viper V3 Pro',
        variant: '',
        status: 'active',
        identifier: 'aabb1122',
        brand_identifier: 'newid456',
      });

      const row = db.getProduct('mouse-aabb1122');
      assert.equal(row.brand_identifier, 'newid456');
    } finally {
      db.close();
    }
  });

  it('defaults brand_identifier to empty string when not provided', () => {
    const db = createTestDb();
    try {
      db.upsertProduct({
        category: 'mouse',
        product_id: 'mouse-ccdd3344',
        brand: 'Logitech',
        model: 'G Pro',
        variant: '',
        status: 'active',
        identifier: 'ccdd3344',
      });
      const row = db.getProduct('mouse-ccdd3344');
      assert.equal(row.brand_identifier, '');
    } finally {
      db.close();
    }
  });
});
