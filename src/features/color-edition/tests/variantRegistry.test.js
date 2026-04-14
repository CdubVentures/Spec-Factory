/**
 * Variant Registry — contract tests.
 *
 * Covers: generateVariantId (hash function), buildVariantRegistry (builder).
 * These are pure functions with no I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateVariantId, buildVariantRegistry, applyIdentityMappings } from '../variantRegistry.js';

/* ── Factories ──────────────────────────────────────────────────── */

function makeRegistryInput(overrides = {}) {
  return {
    productId: 'mouse-b794700f',
    colors: ['black'],
    colorNames: {},
    editions: {},
    ...overrides,
  };
}

/* ── generateVariantId ──────────────────────────────────────────── */

describe('generateVariantId', () => {
  it('returns a string matching v_ + 8 hex chars', () => {
    const result = generateVariantId('mouse-001', 'color:black');
    assert.match(result, /^v_[0-9a-f]{8}$/);
  });

  it('is deterministic — same inputs produce same hash', () => {
    const a = generateVariantId('mouse-001', 'color:black');
    const b = generateVariantId('mouse-001', 'color:black');
    assert.equal(a, b);
  });

  it('is product-scoped — same key on different products produces different hashes', () => {
    const a = generateVariantId('mouse-001', 'color:black');
    const b = generateVariantId('mouse-002', 'color:black');
    assert.notEqual(a, b);
  });

  it('different keys on same product produce different hashes', () => {
    const a = generateVariantId('mouse-001', 'color:black');
    const b = generateVariantId('mouse-001', 'color:white');
    assert.notEqual(a, b);
  });

  it('handles empty strings without throwing', () => {
    const result = generateVariantId('', '');
    assert.match(result, /^v_[0-9a-f]{8}$/);
  });
});

/* ── buildVariantRegistry ───────────────────────────────────────── */

describe('buildVariantRegistry', () => {

  // ── Scenario 1: color atoms only (no marketing name) ──

  it('single color atom produces one color entry', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black'],
      colorNames: {},
      editions: {},
    }));
    assert.equal(result.length, 1);
    assert.equal(result[0].variant_type, 'color');
    assert.equal(result[0].variant_key, 'color:black');
    assert.equal(result[0].variant_label, 'black');
    assert.deepStrictEqual(result[0].color_atoms, ['black']);
    assert.equal(result[0].edition_slug, null);
    assert.equal(result[0].edition_display_name, null);
  });

  it('multiple colors produce one entry per color', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black', 'white', 'red'],
    }));
    assert.equal(result.length, 3);
    assert.ok(result.every(e => e.variant_type === 'color'));
  });

  it('multi-atom color splits into individual atoms', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black+red'],
    }));
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0].color_atoms, ['black', 'red']);
    assert.equal(result[0].variant_key, 'color:black+red');
  });

  // ── Scenario 2: color atoms + marketing name ──

  it('color with marketing name uses name as label', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['light-blue'],
      colorNames: { 'light-blue': 'Glacier Blue' },
    }));
    assert.equal(result.length, 1);
    assert.equal(result[0].variant_label, 'Glacier Blue');
    assert.equal(result[0].variant_key, 'color:light-blue');
    assert.deepStrictEqual(result[0].color_atoms, ['light-blue']);
  });

  it('color without marketing name uses atom as label', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black'],
      colorNames: {},
    }));
    assert.equal(result[0].variant_label, 'black');
  });

  it('color name matching atom case is treated as no marketing name', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black'],
      colorNames: { 'black': 'Black' },
    }));
    // WHY: Same logic as buildVariantList — if name.toLowerCase() === atom, no marketing name
    assert.equal(result[0].variant_label, 'black');
  });

  // ── Scenario 3: edition (combo color in colors array) ──

  it('edition combo in colors array becomes edition entry, not color', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black', 'black+orange'],
      editions: { 'cod-bo6': { display_name: 'COD BO6 Edition', colors: ['black+orange'] } },
    }));
    assert.equal(result.length, 2);

    const colorEntry = result.find(e => e.variant_type === 'color');
    const editionEntry = result.find(e => e.variant_type === 'edition');

    assert.ok(colorEntry, 'should have a color entry');
    assert.ok(editionEntry, 'should have an edition entry');

    assert.equal(colorEntry.variant_key, 'color:black');
    assert.equal(editionEntry.variant_key, 'edition:cod-bo6');
    assert.equal(editionEntry.variant_label, 'COD BO6 Edition');
    assert.equal(editionEntry.edition_slug, 'cod-bo6');
    assert.equal(editionEntry.edition_display_name, 'COD BO6 Edition');
    assert.deepStrictEqual(editionEntry.color_atoms, ['black', 'orange']);
  });

  it('edition without display_name falls back to slug', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black'],
      editions: { 'launch-ed': { colors: ['black'] } },
    }));
    const edEntry = result.find(e => e.variant_type === 'edition');
    assert.ok(edEntry);
    assert.equal(edEntry.edition_display_name, 'launch-ed');
    assert.equal(edEntry.variant_label, 'launch-ed');
  });

  // ── Common fields ──

  it('every entry has a variant_id matching v_ + 8 hex', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black', 'white'],
      editions: { 'cod-bo6': { display_name: 'COD', colors: ['white'] } },
    }));
    for (const entry of result) {
      assert.match(entry.variant_id, /^v_[0-9a-f]{8}$/, `${entry.variant_key} should have valid variant_id`);
    }
  });

  it('every entry has a created_at ISO timestamp', () => {
    const result = buildVariantRegistry(makeRegistryInput());
    for (const entry of result) {
      assert.ok(entry.created_at, 'created_at must be set');
      assert.ok(!isNaN(Date.parse(entry.created_at)), 'created_at must be valid ISO');
    }
  });

  it('variant_ids are deterministic for same inputs', () => {
    const a = buildVariantRegistry(makeRegistryInput());
    const b = buildVariantRegistry(makeRegistryInput());
    assert.equal(a[0].variant_id, b[0].variant_id);
  });

  it('variant_ids differ across products', () => {
    const a = buildVariantRegistry(makeRegistryInput({ productId: 'p1' }));
    const b = buildVariantRegistry(makeRegistryInput({ productId: 'p2' }));
    assert.notEqual(a[0].variant_id, b[0].variant_id);
  });

  // ── Edge cases ──

  it('empty colors produces empty registry', () => {
    const result = buildVariantRegistry(makeRegistryInput({
      colors: [],
      editions: {},
    }));
    assert.deepStrictEqual(result, []);
  });

  it('editions without matching color entry are still included', () => {
    // WHY: An edition whose combo is NOT in the colors array should still
    // appear as an edition entry — it's a valid variant even if the colors
    // array doesn't list its combo.
    const result = buildVariantRegistry(makeRegistryInput({
      colors: ['black'],
      editions: { 'special': { display_name: 'Special Ed', colors: ['red+gold'] } },
    }));
    // black → color entry, special → edition entry (combo not in colors array)
    const edEntry = result.find(e => e.variant_type === 'edition');
    assert.ok(edEntry, 'edition should be included even without combo in colors array');
    assert.equal(edEntry.edition_slug, 'special');
  });
});

/* ── applyIdentityMappings ──────────────────────────────────────── */

describe('applyIdentityMappings', () => {
  function makeRegistry() {
    return [
      { variant_id: 'v_aaa11111', variant_key: 'color:black', variant_type: 'color', variant_label: 'black', color_atoms: ['black'], edition_slug: null, edition_display_name: null, created_at: '2026-01-01T00:00:00.000Z' },
      { variant_id: 'v_bbb22222', variant_key: 'color:ocean-blue', variant_type: 'color', variant_label: 'Ocean Blue', color_atoms: ['ocean-blue'], edition_slug: null, edition_display_name: null, created_at: '2026-01-01T00:00:00.000Z' },
      { variant_id: 'v_ccc33333', variant_key: 'edition:cod-bo6', variant_type: 'edition', variant_label: 'COD BO6', color_atoms: ['black', 'orange'], edition_slug: 'cod-bo6', edition_display_name: 'COD BO6', created_at: '2026-01-01T00:00:00.000Z' },
    ];
  }

  it('update action preserves variant_id and updates mutable fields', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [
        { new_key: 'color:deep-ocean-blue', match: 'v_bbb22222', action: 'update', reason: 'name refined' },
      ],
      retired: [],
      productId: 'mouse-001',
      colors: ['black', 'deep-ocean-blue'],
      colorNames: { 'deep-ocean-blue': 'Deep Ocean Blue' },
      editions: {},
    });
    const updated = result.find(e => e.variant_id === 'v_bbb22222');
    assert.ok(updated);
    assert.equal(updated.variant_key, 'color:deep-ocean-blue');
    assert.equal(updated.variant_label, 'Deep Ocean Blue');
    assert.deepStrictEqual(updated.color_atoms, ['deep-ocean-blue']);
    assert.equal(updated.variant_id, 'v_bbb22222', 'hash must NOT change');
    assert.ok(updated.updated_at, 'updated_at must be set');
  });

  it('create action generates new variant_id', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [
        { new_key: 'color:crimson-red', match: null, action: 'create', reason: 'genuinely new color' },
      ],
      retired: [],
      productId: 'mouse-001',
      colors: ['black', 'ocean-blue', 'crimson-red'],
      colorNames: { 'crimson-red': 'Crimson Red' },
      editions: {},
    });
    const newEntry = result.find(e => e.variant_key === 'color:crimson-red');
    assert.ok(newEntry, 'new entry should exist');
    assert.match(newEntry.variant_id, /^v_[0-9a-f]{8}$/);
    assert.notEqual(newEntry.variant_id, 'v_aaa11111');
    assert.notEqual(newEntry.variant_id, 'v_bbb22222');
    assert.equal(newEntry.variant_label, 'Crimson Red');
    assert.equal(newEntry.variant_type, 'color');
  });

  it('retired variant_ids get retired: true but stay in registry', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [],
      retired: ['v_ccc33333'],
      productId: 'mouse-001',
      colors: ['black', 'ocean-blue'],
      colorNames: {},
      editions: {},
    });
    const retiredEntry = result.find(e => e.variant_id === 'v_ccc33333');
    assert.ok(retiredEntry, 'retired entry must remain in registry');
    assert.equal(retiredEntry.retired, true);
    assert.equal(result.length, 3, 'registry size must not shrink');
  });

  it('unknown match variant_id in update is ignored gracefully', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [
        { new_key: 'color:phantom', match: 'v_doesnotexist', action: 'update', reason: 'bad match' },
      ],
      retired: [],
      productId: 'mouse-001',
      colors: ['black', 'ocean-blue'],
      colorNames: {},
      editions: {},
    });
    // Should not crash, registry unchanged
    assert.equal(result.length, 3);
  });

  it('empty mappings and retired returns registry unchanged', () => {
    const original = makeRegistry();
    const result = applyIdentityMappings({
      existingRegistry: original,
      mappings: [],
      retired: [],
      productId: 'mouse-001',
      colors: ['black', 'ocean-blue'],
      colorNames: {},
      editions: {},
    });
    assert.equal(result.length, 3);
    assert.equal(result[0].variant_id, 'v_aaa11111');
    assert.equal(result[1].variant_id, 'v_bbb22222');
    assert.equal(result[2].variant_id, 'v_ccc33333');
  });

  it('edition update preserves hash and updates edition fields', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [
        { new_key: 'edition:cod-bo6', match: 'v_ccc33333', action: 'update', reason: 'color atoms expanded' },
      ],
      retired: [],
      productId: 'mouse-001',
      colors: ['black', 'black+orange+gold'],
      colorNames: {},
      editions: { 'cod-bo6': { display_name: 'Call of Duty Black Ops 6', colors: ['black+orange+gold'] } },
    });
    const edEntry = result.find(e => e.variant_id === 'v_ccc33333');
    assert.ok(edEntry);
    assert.equal(edEntry.variant_id, 'v_ccc33333', 'hash must NOT change');
    assert.equal(edEntry.edition_display_name, 'Call of Duty Black Ops 6');
    assert.deepStrictEqual(edEntry.color_atoms, ['black', 'orange', 'gold']);
  });

  it('mixed update + create + retire in one call', () => {
    const result = applyIdentityMappings({
      existingRegistry: makeRegistry(),
      mappings: [
        { new_key: 'color:black', match: 'v_aaa11111', action: 'update', reason: 'unchanged' },
        { new_key: 'color:deep-ocean-blue', match: 'v_bbb22222', action: 'update', reason: 'name refined' },
        { new_key: 'color:crimson-red', match: null, action: 'create', reason: 'new' },
      ],
      retired: ['v_ccc33333'],
      productId: 'mouse-001',
      colors: ['black', 'deep-ocean-blue', 'crimson-red'],
      colorNames: { 'deep-ocean-blue': 'Deep Ocean Blue', 'crimson-red': 'Crimson Red' },
      editions: {},
    });
    assert.equal(result.length, 4, '3 existing + 1 new');
    assert.equal(result.find(e => e.variant_id === 'v_aaa11111')?.variant_key, 'color:black');
    assert.equal(result.find(e => e.variant_id === 'v_bbb22222')?.variant_key, 'color:deep-ocean-blue');
    assert.equal(result.find(e => e.variant_id === 'v_ccc33333')?.retired, true);
    assert.ok(result.find(e => e.variant_key === 'color:crimson-red'));
  });
});
