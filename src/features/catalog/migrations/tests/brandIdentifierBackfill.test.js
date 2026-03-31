// WHY: Phase F — contract tests for the brand_identifier backfill migration.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../../../db/specDb.js';
import { backfillBrandIdentifier } from '../brandIdentifierBackfill.js';

const CATEGORY = 'mouse';

function createTestSpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: CATEGORY });
}

function mockAppDb(brands = []) {
  return {
    findBrandByAlias(query) {
      const q = String(query).trim().toLowerCase();
      return brands.find(b =>
        b.canonical_name.toLowerCase() === q ||
        (b.aliases || []).some(a => a.toLowerCase() === q)
      ) || null;
    },
  };
}

function seedProduct(specDb, pid, brand, brandIdentifier = '') {
  specDb.upsertProduct({
    category: CATEGORY,
    product_id: pid,
    brand,
    model: 'Test Model',
    variant: '',
    status: 'active',
    seed_urls: [],
    identifier: pid.replace(`${CATEGORY}-`, ''),
    brand_identifier: brandIdentifier,
  });
}

describe('backfillBrandIdentifier', () => {
  const BRANDS = [
    { canonical_name: 'Razer', identifier: 'b5a50d8f', aliases: [] },
    { canonical_name: 'Logitech G', identifier: '84a009b9', aliases: ['Logitech'] },
  ];

  it('backfills products with matching brands', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      seedProduct(specDb, 'mouse-aabb1122', 'Razer');
      seedProduct(specDb, 'mouse-ccdd3344', 'Logitech G');

      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb,
      });

      assert.equal(result.ok, true);
      assert.equal(result.backfilled, 2);
      assert.equal(result.skipped, 0);

      const r1 = specDb.getProduct('mouse-aabb1122');
      assert.equal(r1.brand_identifier, 'b5a50d8f');
      const r2 = specDb.getProduct('mouse-ccdd3344');
      assert.equal(r2.brand_identifier, '84a009b9');
    } finally {
      specDb.close();
    }
  });

  it('skips products that already have brand_identifier', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      seedProduct(specDb, 'mouse-aabb1122', 'Razer', 'b5a50d8f');

      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb,
      });

      assert.equal(result.ok, true);
      assert.equal(result.backfilled, 0);
      assert.equal(result.skipped, 1);
    } finally {
      specDb.close();
    }
  });

  it('handles unknown brands (skips, does not fail)', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      seedProduct(specDb, 'mouse-aabb1122', 'UnknownBrand');

      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb,
      });

      assert.equal(result.ok, true);
      assert.equal(result.backfilled, 0);
      assert.equal(result.skipped, 1);

      const row = specDb.getProduct('mouse-aabb1122');
      assert.equal(row.brand_identifier, '');
    } finally {
      specDb.close();
    }
  });

  it('dryRun reports changes without writing', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      seedProduct(specDb, 'mouse-aabb1122', 'Razer');

      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb, dryRun: true,
      });

      assert.equal(result.ok, true);
      assert.equal(result.backfilled, 1);
      assert.equal(result.dryRun, true);

      // Verify NOT written
      const row = specDb.getProduct('mouse-aabb1122');
      assert.equal(row.brand_identifier, '');
    } finally {
      specDb.close();
    }
  });

  it('empty product list returns ok', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb,
      });

      assert.equal(result.ok, true);
      assert.equal(result.total, 0);
      assert.equal(result.backfilled, 0);
      assert.equal(result.skipped, 0);
    } finally {
      specDb.close();
    }
  });

  it('returns correct counts (total = backfilled + skipped)', async () => {
    const specDb = createTestSpecDb();
    const appDb = mockAppDb(BRANDS);
    try {
      seedProduct(specDb, 'mouse-aabb1122', 'Razer');           // will backfill
      seedProduct(specDb, 'mouse-ccdd3344', 'Logitech G', '84a009b9'); // already has it
      seedProduct(specDb, 'mouse-eeff5566', 'Unknown');          // unknown brand

      const result = await backfillBrandIdentifier({
        category: CATEGORY, appDb, specDb,
      });

      assert.equal(result.ok, true);
      assert.equal(result.total, 3);
      assert.equal(result.backfilled, 1);
      assert.equal(result.skipped, 2); // already-set + unknown
    } finally {
      specDb.close();
    }
  });
});
