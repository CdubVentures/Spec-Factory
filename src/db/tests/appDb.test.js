import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppDb } from '../appDb.js';

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

const BRAND_A = { identifier: 'aabb1122', canonical_name: 'Acme', slug: 'acme', aliases: '[]', website: '', added_by: 'seed' };
const BRAND_B = { identifier: 'ccdd3344', canonical_name: 'Globex', slug: 'globex', aliases: '["GX"]', website: 'https://globex.test', added_by: 'gui' };
const BRAND_C = { identifier: 'eeff5566', canonical_name: 'Zephyr', slug: 'zephyr', aliases: '[]', website: '', added_by: 'seed' };

// ── Construction ──

describe('AppDb — construction', () => {
  it('creates in-memory DB without error', () => {
    const db = createTestDb();
    db.close();
  });

  it('isSeeded returns false on fresh DB', () => {
    const db = createTestDb();
    try {
      assert.equal(db.isSeeded(), false);
    } finally {
      db.close();
    }
  });

  it('counts returns all zeros on fresh DB', () => {
    const db = createTestDb();
    try {
      const c = db.counts();
      assert.equal(c.brands, 0);
      assert.equal(c.brand_categories, 0);
      assert.equal(c.brand_renames, 0);
      assert.equal(c.settings, 0);
      assert.equal(c.studio_maps, 0);
      assert.equal(c.color_registry, 0);
    } finally {
      db.close();
    }
  });

  it('close does not throw', () => {
    const db = createTestDb();
    db.close();
  });

  it('has foreign_keys enabled', () => {
    const db = createTestDb();
    try {
      const fk = db.db.pragma('foreign_keys', { simple: true });
      assert.equal(fk, 1);
    } finally {
      db.close();
    }
  });
});

// ── Brand CRUD ──

describe('AppDb — brand CRUD', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('upsertBrand + getBrand roundtrip', () => {
    db.upsertBrand(BRAND_A);
    const row = db.getBrand('aabb1122');
    assert.equal(row.identifier, 'aabb1122');
    assert.equal(row.canonical_name, 'Acme');
    assert.equal(row.slug, 'acme');
    assert.equal(row.aliases, '[]');
    assert.equal(row.added_by, 'seed');
  });

  it('getBrandBySlug retrieves by slug', () => {
    db.upsertBrand(BRAND_A);
    const row = db.getBrandBySlug('acme');
    assert.equal(row.identifier, 'aabb1122');
    assert.equal(row.canonical_name, 'Acme');
  });

  it('getBrand returns null for missing identifier', () => {
    assert.equal(db.getBrand('nonexistent'), null);
  });

  it('getBrandBySlug returns null for missing slug', () => {
    assert.equal(db.getBrandBySlug('nonexistent'), null);
  });

  it('listBrands returns all brands sorted by canonical_name', () => {
    db.upsertBrand(BRAND_C); // Zephyr
    db.upsertBrand(BRAND_A); // Acme
    db.upsertBrand(BRAND_B); // Globex
    const list = db.listBrands();
    assert.equal(list.length, 3);
    assert.equal(list[0].canonical_name, 'Acme');
    assert.equal(list[1].canonical_name, 'Globex');
    assert.equal(list[2].canonical_name, 'Zephyr');
  });

  it('listBrandsForCategory returns only matching brands', () => {
    db.upsertBrand(BRAND_A);
    db.upsertBrand(BRAND_B);
    db.setBrandCategories('aabb1122', ['mouse', 'keyboard']);
    db.setBrandCategories('ccdd3344', ['monitor']);
    const mouseList = db.listBrandsForCategory('mouse');
    assert.equal(mouseList.length, 1);
    assert.equal(mouseList[0].identifier, 'aabb1122');
  });

  it('upsertBrand with same identifier updates', () => {
    db.upsertBrand(BRAND_A);
    db.upsertBrand({ ...BRAND_A, canonical_name: 'Acme Corp', website: 'https://acme.test' });
    const row = db.getBrand('aabb1122');
    assert.equal(row.canonical_name, 'Acme Corp');
    assert.equal(row.website, 'https://acme.test');
    assert.equal(db.listBrands().length, 1);
  });

  it('deleteBrand cascades to brand_categories', () => {
    db.upsertBrand(BRAND_A);
    db.setBrandCategories('aabb1122', ['mouse', 'keyboard']);
    assert.equal(db.getCategoriesForBrand('aabb1122').length, 2);
    const changes = db.deleteBrand('aabb1122');
    assert.equal(changes, 1);
    assert.equal(db.getBrand('aabb1122'), null);
    assert.equal(db.getCategoriesForBrand('aabb1122').length, 0);
  });

  it('deleteBrand on nonexistent identifier is no-op', () => {
    const changes = db.deleteBrand('nonexistent');
    assert.equal(changes, 0);
  });
});

// ── Brand Categories ──

describe('AppDb — brand categories', () => {
  let db;
  beforeEach(() => { db = createTestDb(); db.upsertBrand(BRAND_A); });
  afterEach(() => { db.close(); });

  it('setBrandCategories + getCategoriesForBrand roundtrip', () => {
    db.setBrandCategories('aabb1122', ['mouse', 'keyboard']);
    const cats = db.getCategoriesForBrand('aabb1122');
    assert.deepEqual(cats.sort(), ['keyboard', 'mouse']);
  });

  it('setBrandCategories replaces existing', () => {
    db.setBrandCategories('aabb1122', ['mouse', 'keyboard']);
    db.setBrandCategories('aabb1122', ['monitor']);
    const cats = db.getCategoriesForBrand('aabb1122');
    assert.deepEqual(cats, ['monitor']);
  });

  it('getCategoriesForBrand returns empty array for brand with no categories', () => {
    assert.deepEqual(db.getCategoriesForBrand('aabb1122'), []);
  });

  it('FK: cannot insert category for nonexistent brand', () => {
    assert.throws(() => {
      db.setBrandCategories('nonexistent', ['mouse']);
    });
  });
});

// ── Brand Renames ──

describe('AppDb — brand renames', () => {
  let db;
  beforeEach(() => { db = createTestDb(); db.upsertBrand(BRAND_A); });
  afterEach(() => { db.close(); });

  it('insertBrandRename + getRenamesForBrand roundtrip', () => {
    db.insertBrandRename({ identifier: 'aabb1122', old_slug: 'acme', new_slug: 'acme-corp', old_name: 'Acme', new_name: 'Acme Corp' });
    const renames = db.getRenamesForBrand('aabb1122');
    assert.equal(renames.length, 1);
    assert.equal(renames[0].old_slug, 'acme');
    assert.equal(renames[0].new_slug, 'acme-corp');
    assert.equal(renames[0].old_name, 'Acme');
    assert.equal(renames[0].new_name, 'Acme Corp');
  });

  it('multiple renames accumulate', () => {
    db.insertBrandRename({ identifier: 'aabb1122', old_slug: 'acme', new_slug: 'acme-corp', old_name: 'Acme', new_name: 'Acme Corp' });
    db.insertBrandRename({ identifier: 'aabb1122', old_slug: 'acme-corp', new_slug: 'acme-inc', old_name: 'Acme Corp', new_name: 'Acme Inc' });
    const renames = db.getRenamesForBrand('aabb1122');
    assert.equal(renames.length, 2);
  });
});

// ── Settings ──

describe('AppDb — settings', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('upsertSetting + getSetting roundtrip', () => {
    db.upsertSetting({ section: 'runtime', key: 'llmTimeout', value: '30000', type: 'number' });
    const s = db.getSetting('runtime', 'llmTimeout');
    assert.equal(s.section, 'runtime');
    assert.equal(s.key, 'llmTimeout');
    assert.equal(s.value, '30000');
    assert.equal(s.type, 'number');
  });

  it('getSection returns all keys for section', () => {
    db.upsertSetting({ section: 'runtime', key: 'a', value: '1', type: 'number' });
    db.upsertSetting({ section: 'runtime', key: 'b', value: 'true', type: 'bool' });
    db.upsertSetting({ section: 'ui', key: 'c', value: 'dark', type: 'string' });
    const runtime = db.getSection('runtime');
    assert.equal(runtime.length, 2);
    const ui = db.getSection('ui');
    assert.equal(ui.length, 1);
  });

  it('upsertSetting updates on conflict', () => {
    db.upsertSetting({ section: 'runtime', key: 'x', value: 'old', type: 'string' });
    db.upsertSetting({ section: 'runtime', key: 'x', value: 'new', type: 'string' });
    const s = db.getSetting('runtime', 'x');
    assert.equal(s.value, 'new');
    assert.equal(db.getSection('runtime').length, 1);
  });

  it('getSetting returns null for missing key', () => {
    assert.equal(db.getSetting('runtime', 'nonexistent'), null);
  });

  it('deleteSection removes all keys', () => {
    db.upsertSetting({ section: 'runtime', key: 'a', value: '1', type: 'number' });
    db.upsertSetting({ section: 'runtime', key: 'b', value: '2', type: 'number' });
    const changes = db.deleteSection('runtime');
    assert.equal(changes, 2);
    assert.equal(db.getSection('runtime').length, 0);
  });
});

// ── Studio Maps ──

describe('AppDb — studio maps', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('upsertStudioMap + getStudioMap roundtrip', () => {
    db.upsertStudioMap({ category: 'mouse', map_json: '{"key":"val"}', file_path: '/test/map.json' });
    const m = db.getStudioMap('mouse');
    assert.equal(m.category, 'mouse');
    assert.equal(m.map_json, '{"key":"val"}');
    assert.equal(m.file_path, '/test/map.json');
  });

  it('upsertStudioMap updates on conflict', () => {
    db.upsertStudioMap({ category: 'mouse', map_json: '{}', file_path: '' });
    db.upsertStudioMap({ category: 'mouse', map_json: '{"updated":true}', file_path: '/new' });
    const m = db.getStudioMap('mouse');
    assert.equal(m.map_json, '{"updated":true}');
    assert.equal(m.file_path, '/new');
    assert.equal(db.counts().studio_maps, 1);
  });

  it('getStudioMap returns null for missing category', () => {
    assert.equal(db.getStudioMap('nonexistent'), null);
  });

  it('listStudioMaps returns empty array when no rows', () => {
    assert.deepEqual(db.listStudioMaps(), []);
  });

  it('listStudioMaps returns all rows sorted by category', () => {
    db.upsertStudioMap({ category: 'mouse', map_json: '{"a":1}', file_path: '/m' });
    db.upsertStudioMap({ category: 'keyboard', map_json: '{"b":2}', file_path: '/k' });
    const rows = db.listStudioMaps();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].category, 'keyboard');
    assert.equal(rows[1].category, 'mouse');
  });
});

// ── Color Registry CRUD ──

describe('AppDb — color registry CRUD', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('upsertColor + getColor roundtrip', () => {
    db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
    const row = db.getColor('red');
    assert.equal(row.name, 'red');
    assert.equal(row.hex, '#ef4444');
    assert.equal(row.css_var, '--color-red');
  });

  it('listColors returns all rows sorted by name', () => {
    db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
    db.upsertColor({ name: 'blue', hex: '#3b82f6', css_var: '--color-blue' });
    db.upsertColor({ name: 'green', hex: '#22c55e', css_var: '--color-green' });
    const list = db.listColors();
    assert.equal(list.length, 3);
    assert.equal(list[0].name, 'blue');
    assert.equal(list[1].name, 'green');
    assert.equal(list[2].name, 'red');
  });

  it('deleteColor returns changes count', () => {
    db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
    const changes = db.deleteColor('red');
    assert.equal(changes, 1);
    assert.equal(db.getColor('red'), null);
  });

  it('deleteColor returns 0 for missing name', () => {
    assert.equal(db.deleteColor('nonexistent'), 0);
  });

  it('upsertColor updates hex on conflict', () => {
    db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
    db.upsertColor({ name: 'red', hex: '#ff0000', css_var: '--color-red' });
    const row = db.getColor('red');
    assert.equal(row.hex, '#ff0000');
    assert.equal(db.listColors().length, 1);
  });

  it('getColor returns null for missing name', () => {
    assert.equal(db.getColor('nonexistent'), null);
  });

  it('counts includes color_registry', () => {
    db.upsertColor({ name: 'red', hex: '#ef4444', css_var: '--color-red' });
    db.upsertColor({ name: 'blue', hex: '#3b82f6', css_var: '--color-blue' });
    assert.equal(db.counts().color_registry, 2);
  });
});

// ── findBrandByAlias ──

describe('AppDb — findBrandByAlias', () => {
  let db;
  beforeEach(() => {
    db = createTestDb();
    db.upsertBrand(BRAND_A); // Acme, aliases '[]'
    db.upsertBrand(BRAND_B); // Globex, aliases '["GX"]'
  });
  afterEach(() => { db.close(); });

  it('matches by canonical_name (case-insensitive)', () => {
    const row = db.findBrandByAlias('acme');
    assert.ok(row);
    assert.equal(row.identifier, 'aabb1122');
  });

  it('matches by canonical_name with different case', () => {
    const row = db.findBrandByAlias('GLOBEX');
    assert.ok(row);
    assert.equal(row.identifier, 'ccdd3344');
  });

  it('matches by alias in JSON array (case-insensitive)', () => {
    const row = db.findBrandByAlias('gx');
    assert.ok(row);
    assert.equal(row.identifier, 'ccdd3344');
    assert.equal(row.canonical_name, 'Globex');
  });

  it('returns null for no match', () => {
    assert.equal(db.findBrandByAlias('nonexistent'), null);
  });

  it('returns null for empty query', () => {
    assert.equal(db.findBrandByAlias(''), null);
    assert.equal(db.findBrandByAlias(null), null);
  });
});

// ── updateBrandSlug ──

describe('AppDb — updateBrandSlug', () => {
  let db;
  beforeEach(() => { db = createTestDb(); db.upsertBrand(BRAND_A); });
  afterEach(() => { db.close(); });

  it('updates slug for given identifier', () => {
    const changes = db.updateBrandSlug('aabb1122', 'acme-corp');
    assert.equal(changes, 1);
    assert.equal(db.getBrandBySlug('acme-corp').identifier, 'aabb1122');
    assert.equal(db.getBrandBySlug('acme'), null);
  });

  it('returns 0 for nonexistent identifier', () => {
    assert.equal(db.updateBrandSlug('nonexistent', 'new-slug'), 0);
  });
});

// ── updateBrandFields ──

describe('AppDb — updateBrandFields', () => {
  let db;
  beforeEach(() => { db = createTestDb(); db.upsertBrand(BRAND_A); });
  afterEach(() => { db.close(); });

  it('partial update: only provided fields change', () => {
    const changes = db.updateBrandFields('aabb1122', { canonical_name: 'Acme Corp' });
    assert.equal(changes, 1);
    const row = db.getBrand('aabb1122');
    assert.equal(row.canonical_name, 'Acme Corp');
    assert.equal(row.slug, 'acme'); // unchanged
    assert.equal(row.website, ''); // unchanged
  });

  it('updates multiple fields at once', () => {
    db.updateBrandFields('aabb1122', { canonical_name: 'Acme Inc', website: 'https://acme.test', aliases: '["Old Acme"]' });
    const row = db.getBrand('aabb1122');
    assert.equal(row.canonical_name, 'Acme Inc');
    assert.equal(row.website, 'https://acme.test');
    assert.equal(row.aliases, '["Old Acme"]');
  });

  it('returns 0 for nonexistent identifier', () => {
    assert.equal(db.updateBrandFields('nonexistent', { canonical_name: 'X' }), 0);
  });
});

// ── Lifecycle ──

describe('AppDb — lifecycle', () => {
  it('isSeeded returns true after inserting one brand', () => {
    const db = createTestDb();
    try {
      db.upsertBrand(BRAND_A);
      assert.equal(db.isSeeded(), true);
    } finally {
      db.close();
    }
  });

  it('counts reflects actual row counts', () => {
    const db = createTestDb();
    try {
      db.upsertBrand(BRAND_A);
      db.upsertBrand(BRAND_B);
      db.setBrandCategories('aabb1122', ['mouse']);
      db.insertBrandRename({ identifier: 'aabb1122', old_slug: 'a', new_slug: 'b', old_name: 'A', new_name: 'B' });
      db.upsertSetting({ section: 'runtime', key: 'k', value: 'v', type: 'string' });
      db.upsertStudioMap({ category: 'mouse', map_json: '{}', file_path: '' });
      const c = db.counts();
      assert.equal(c.brands, 2);
      assert.equal(c.brand_categories, 1);
      assert.equal(c.brand_renames, 1);
      assert.equal(c.settings, 1);
      assert.equal(c.studio_maps, 1);
    } finally {
      db.close();
    }
  });
});
