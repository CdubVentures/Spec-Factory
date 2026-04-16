import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function withDb(fn) {
  return () => {
    const db = new SpecDb({ dbPath: ':memory:', category: 'mouse' });
    try {
      fn(db);
    } finally {
      db.close();
    }
  };
}

const VARIANT_COLOR = {
  productId: 'mouse-001',
  variantId: 'v_aabb1122',
  variantKey: 'color:black',
  variantType: 'color',
  variantLabel: 'Black',
  colorAtoms: ['black'],
  editionSlug: null,
  editionDisplayName: null,
  createdAt: '2026-04-14T00:00:00Z',
};

const VARIANT_EDITION = {
  productId: 'mouse-001',
  variantId: 'v_ccdd3344',
  variantKey: 'edition:special-ed',
  variantType: 'edition',
  variantLabel: 'Special Edition',
  colorAtoms: ['olive', 'khaki'],
  editionSlug: 'special-ed',
  editionDisplayName: 'Special Edition',
  createdAt: '2026-04-14T00:00:00Z',
};

describe('variantStore', () => {

  it('upsert inserts new variant', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    const row = db.variants.get('mouse-001', 'v_aabb1122');
    assert.ok(row);
    assert.equal(row.variant_key, 'color:black');
    assert.equal(row.variant_type, 'color');
    assert.equal(row.variant_label, 'Black');
    assert.deepEqual(row.color_atoms, ['black']);
  }));

  it('upsert updates on conflict', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    db.variants.upsert({ ...VARIANT_COLOR, variantLabel: 'Matte Black', updatedAt: '2026-04-15T00:00:00Z' });
    const row = db.variants.get('mouse-001', 'v_aabb1122');
    assert.equal(row.variant_label, 'Matte Black');
    assert.equal(row.updated_at, '2026-04-15T00:00:00Z');
  }));

  it('get returns null for missing variant', withDb((db) => {
    assert.equal(db.variants.get('mouse-001', 'v_nonexistent'), null);
  }));

  it('get returns hydrated row with parsed color_atoms', withDb((db) => {
    db.variants.upsert(VARIANT_EDITION);
    const row = db.variants.get('mouse-001', 'v_ccdd3344');
    assert.ok(Array.isArray(row.color_atoms));
    assert.deepEqual(row.color_atoms, ['olive', 'khaki']);
    assert.equal(row.edition_slug, 'special-ed');
  }));

  it('listByProduct returns all variants sorted by type then key', withDb((db) => {
    db.variants.upsert(VARIANT_EDITION);
    db.variants.upsert(VARIANT_COLOR);
    const rows = db.variants.listByProduct('mouse-001');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].variant_type, 'color');
    assert.equal(rows[1].variant_type, 'edition');
  }));

  it('listActive returns same results as listByProduct (no retired filter)', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    db.variants.upsert(VARIANT_EDITION);
    const active = db.variants.listActive('mouse-001');
    const all = db.variants.listByProduct('mouse-001');
    assert.equal(active.length, all.length);
  }));

  it('remove hard deletes', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    db.variants.remove('mouse-001', 'v_aabb1122');
    assert.equal(db.variants.get('mouse-001', 'v_aabb1122'), null);
  }));

  it('removeByProduct deletes all for product', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    db.variants.upsert(VARIANT_EDITION);
    db.variants.removeByProduct('mouse-001');
    assert.equal(db.variants.listByProduct('mouse-001').length, 0);
  }));

  it('syncFromRegistry bulk upserts from array', withDb((db) => {
    const registry = [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_ccdd3344', variant_key: 'edition:special-ed', variant_type: 'edition', variant_label: 'Special Edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed', edition_display_name: 'Special Edition', created_at: '2026-04-14T00:00:00Z' },
    ];
    db.variants.syncFromRegistry('mouse-001', registry);
    const rows = db.variants.listByProduct('mouse-001');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].variant_key, 'color:black');
    assert.equal(rows[1].variant_key, 'edition:special-ed');
  }));

  it('syncFromRegistry updates existing entries', withDb((db) => {
    db.variants.upsert(VARIANT_COLOR);
    const registry = [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Updated Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z', updated_at: '2026-04-15T00:00:00Z' },
    ];
    db.variants.syncFromRegistry('mouse-001', registry);
    const row = db.variants.get('mouse-001', 'v_aabb1122');
    assert.equal(row.variant_label, 'Updated Black');
  }));

  it('syncFromRegistry removes stale variants not in incoming registry', withDb((db) => {
    // Seed: 3 variants
    db.variants.upsert(VARIANT_COLOR);
    db.variants.upsert(VARIANT_EDITION);
    db.variants.upsert({
      productId: 'mouse-001', variantId: 'v_doom0001',
      variantKey: 'edition:doom-edition', variantType: 'edition',
      variantLabel: 'DOOM Edition', colorAtoms: ['olive', 'black', 'red'],
      editionSlug: 'doom-edition', editionDisplayName: 'DOOM Edition',
      createdAt: '2026-04-14T00:00:00Z',
    });
    assert.equal(db.variants.listByProduct('mouse-001').length, 3, 'pre-sync: 3 variants');

    // Sync with registry that only has 2 (DOOM removed)
    db.variants.syncFromRegistry('mouse-001', [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_ccdd3344', variant_key: 'edition:special-ed', variant_type: 'edition', variant_label: 'Special Edition', color_atoms: ['olive', 'khaki'], edition_slug: 'special-ed', edition_display_name: 'Special Edition', created_at: '2026-04-14T00:00:00Z' },
    ]);

    const after = db.variants.listByProduct('mouse-001');
    assert.equal(after.length, 2, 'post-sync: stale DOOM variant must be removed');
    assert.ok(!after.find(v => v.variant_id === 'v_doom0001'), 'DOOM must not survive sync');
  }));

  it('syncFromRegistry does not remove variants from other products', withDb((db) => {
    // Product A: 2 variants
    db.variants.upsert(VARIANT_COLOR);
    db.variants.upsert(VARIANT_EDITION);
    // Product B: 1 variant
    db.variants.upsert({
      productId: 'mouse-002', variantId: 'v_other001',
      variantKey: 'color:white', variantType: 'color', variantLabel: 'White',
      colorAtoms: ['white'], editionSlug: null, editionDisplayName: null,
      createdAt: '2026-04-14T00:00:00Z',
    });

    // Sync product A with only 1 variant — must not affect product B
    db.variants.syncFromRegistry('mouse-001', [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    ]);

    assert.equal(db.variants.listByProduct('mouse-001').length, 1, 'product A trimmed to 1');
    assert.equal(db.variants.listByProduct('mouse-002').length, 1, 'product B untouched');
  }));

  it('syncFromRegistry is no-op for empty array', withDb((db) => {
    db.variants.syncFromRegistry('mouse-001', []);
    assert.equal(db.variants.listByProduct('mouse-001').length, 0);
  }));

  it('syncFromRegistry is no-op for null/undefined', withDb((db) => {
    db.variants.syncFromRegistry('mouse-001', null);
    db.variants.syncFromRegistry('mouse-001', undefined);
    assert.equal(db.variants.listByProduct('mouse-001').length, 0);
  }));

  it('syncFromRegistry calls onAfterSync after sync completes', withDb((db) => {
    const registry = [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    ];
    const calls = [];
    db.variants.syncFromRegistry('mouse-001', registry, {
      onAfterSync: ({ productId }) => calls.push(productId),
    });
    assert.equal(calls.length, 1, 'onAfterSync must fire exactly once');
    assert.equal(calls[0], 'mouse-001', 'onAfterSync receives productId');
  }));

  it('syncFromRegistry works without onAfterSync (backward compat)', withDb((db) => {
    const registry = [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
    ];
    // No third arg — must not throw
    db.variants.syncFromRegistry('mouse-001', registry);
    assert.equal(db.variants.listByProduct('mouse-001').length, 1);
  }));

  it('onAfterSync sees committed variants inside callback', withDb((db) => {
    const registry = [
      { variant_id: 'v_aabb1122', variant_key: 'color:black', variant_type: 'color', variant_label: 'Black', color_atoms: ['black'], created_at: '2026-04-14T00:00:00Z' },
      { variant_id: 'v_ccdd3344', variant_key: 'color:white', variant_type: 'color', variant_label: 'White', color_atoms: ['white'], created_at: '2026-04-14T00:00:00Z' },
    ];
    let visibleInCallback = 0;
    db.variants.syncFromRegistry('mouse-001', registry, {
      onAfterSync: ({ productId }) => {
        visibleInCallback = db.variants.listByProduct(productId).length;
      },
    });
    assert.equal(visibleInCallback, 2, 'variants must be visible inside onAfterSync callback');
  }));
});
