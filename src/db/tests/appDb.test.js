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

// ── Billing ──

function makeBillingEntry(overrides = {}) {
  return {
    ts: '2026-04-10T12:00:00Z',
    month: '2026-04',
    day: '2026-04-10',
    provider: 'openai',
    model: 'gpt-5',
    category: 'mouse',
    product_id: 'prod-1',
    run_id: 'run-1',
    round: 0,
    prompt_tokens: 100,
    completion_tokens: 50,
    cached_prompt_tokens: 0,
    sent_tokens: 0,
    total_tokens: 150,
    cost_usd: 0.001,
    reason: 'extract',
    host: 'example.com',
    url_count: 1,
    evidence_chars: 500,
    estimated_usage: 0,
    meta: '{}',
    ...overrides,
  };
}

describe('AppDb — billing insertBillingEntry', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('inserts a single billing entry', () => {
    db.insertBillingEntry(makeBillingEntry());
    assert.equal(db.countBillingEntries(), 1);
  });

  it('populates all columns correctly', () => {
    db.insertBillingEntry(makeBillingEntry({ provider: 'anthropic', model: 'claude-sonnet-4-6', cost_usd: 0.005 }));
    const entries = db.getBillingEntriesForMonth('2026-04');
    assert.equal(entries[0].provider, 'anthropic');
    assert.equal(entries[0].model, 'claude-sonnet-4-6');
    assert.equal(entries[0].cost_usd, 0.005);
  });
});

describe('AppDb — billing insertBillingEntriesBatch', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('inserts multiple entries in a transaction', () => {
    db.insertBillingEntriesBatch([makeBillingEntry(), makeBillingEntry({ product_id: 'prod-2' })]);
    assert.equal(db.countBillingEntries(), 2);
  });
});

describe('AppDb — billing getBillingRollup', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns empty rollup for month with no entries', () => {
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(rollup.totals.calls, 0);
    assert.equal(rollup.totals.cost_usd, 0);
  });

  it('aggregates totals correctly', () => {
    db.insertBillingEntry(makeBillingEntry({ cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50 }));
    db.insertBillingEntry(makeBillingEntry({ cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100 }));
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(rollup.totals.calls, 2);
    assert.equal(rollup.totals.prompt_tokens, 300);
    assert.equal(rollup.totals.completion_tokens, 150);
  });

  it('aggregates cached_prompt_tokens in totals', () => {
    db.insertBillingEntry(makeBillingEntry({ prompt_tokens: 1000, cached_prompt_tokens: 800 }));
    db.insertBillingEntry(makeBillingEntry({ prompt_tokens: 500, cached_prompt_tokens: 200 }));
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(rollup.totals.prompt_tokens, 1500);
    assert.equal(rollup.totals.cached_prompt_tokens, 1000);
  });

  it('aggregates sent_tokens in totals', () => {
    db.insertBillingEntry(makeBillingEntry({ prompt_tokens: 5000, sent_tokens: 1000 }));
    db.insertBillingEntry(makeBillingEntry({ prompt_tokens: 3000, sent_tokens: 500 }));
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(rollup.totals.prompt_tokens, 8000);
    assert.equal(rollup.totals.sent_tokens, 1500);
  });

  it('groups by_day', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10' }));
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-11' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(Object.keys(rollup.by_day).length, 2);
    assert.ok(rollup.by_day['2026-04-10']);
    assert.ok(rollup.by_day['2026-04-11']);
  });

  it('groups by_category', () => {
    db.insertBillingEntry(makeBillingEntry({ category: 'mouse' }));
    db.insertBillingEntry(makeBillingEntry({ category: 'keyboard' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.ok(rollup.by_category['mouse']);
    assert.ok(rollup.by_category['keyboard']);
  });

  it('groups by_product', () => {
    db.insertBillingEntry(makeBillingEntry({ product_id: 'prod-1' }));
    db.insertBillingEntry(makeBillingEntry({ product_id: 'prod-2' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.ok(rollup.by_product['prod-1']);
    assert.ok(rollup.by_product['prod-2']);
  });

  it('groups by_model with provider:model composite key', () => {
    db.insertBillingEntry(makeBillingEntry({ provider: 'openai', model: 'gpt-5' }));
    db.insertBillingEntry(makeBillingEntry({ provider: 'anthropic', model: 'claude-sonnet-4-6' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.ok(rollup.by_model['openai:gpt-5']);
    assert.ok(rollup.by_model['anthropic:claude-sonnet-4-6']);
  });

  it('groups by_reason', () => {
    db.insertBillingEntry(makeBillingEntry({ reason: 'extract' }));
    db.insertBillingEntry(makeBillingEntry({ reason: 'health' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.ok(rollup.by_reason['extract']);
    assert.ok(rollup.by_reason['health']);
  });

  it('filters by category when provided', () => {
    db.insertBillingEntry(makeBillingEntry({ category: 'mouse', cost_usd: 0.01 }));
    db.insertBillingEntry(makeBillingEntry({ category: 'keyboard', cost_usd: 0.02 }));
    const rollup = db.getBillingRollup('2026-04', 'mouse');
    assert.equal(rollup.totals.calls, 1);
  });

  it('ignores entries from other months', () => {
    db.insertBillingEntry(makeBillingEntry({ month: '2026-04' }));
    db.insertBillingEntry(makeBillingEntry({ month: '2026-03' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.equal(rollup.totals.calls, 1);
  });

  it('default call (no options) computes all 5 buckets', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', category: 'mouse', product_id: 'prod-1', provider: 'openai', model: 'gpt-5', reason: 'extract' }));
    const rollup = db.getBillingRollup('2026-04');
    assert.ok(rollup.by_day['2026-04-10']);
    assert.ok(rollup.by_category['mouse']);
    assert.ok(rollup.by_product['prod-1']);
    assert.ok(rollup.by_model['openai:gpt-5']);
    assert.ok(rollup.by_reason['extract']);
  });

  it('buckets option filters which bucket queries run', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', category: 'mouse', product_id: 'prod-1', provider: 'openai', model: 'gpt-5', reason: 'extract' }));
    const rollup = db.getBillingRollup('2026-04', '', {}, { buckets: new Set(['by_model']) });
    // Requested bucket is populated.
    assert.ok(rollup.by_model['openai:gpt-5']);
    // Unrequested buckets are empty objects (not undefined).
    assert.deepEqual(rollup.by_day, {});
    assert.deepEqual(rollup.by_category, {});
    assert.deepEqual(rollup.by_product, {});
    assert.deepEqual(rollup.by_reason, {});
    // Totals always computed (the dashboard summary needs them).
    assert.equal(rollup.totals.calls, 1);
  });

  it('buckets option supports multiple buckets', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', category: 'mouse', product_id: 'prod-1', provider: 'openai', model: 'gpt-5', reason: 'extract' }));
    const rollup = db.getBillingRollup('2026-04', '', {}, { buckets: new Set(['by_model', 'by_reason', 'by_category']) });
    assert.ok(rollup.by_model['openai:gpt-5']);
    assert.ok(rollup.by_reason['extract']);
    assert.ok(rollup.by_category['mouse']);
    assert.deepEqual(rollup.by_day, {});
    assert.deepEqual(rollup.by_product, {});
  });
});

describe('AppDb — billing getBillingEntriesForMonth', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns empty array for month with no entries', () => {
    assert.deepEqual(db.getBillingEntriesForMonth('2026-04'), []);
  });

  it('returns entries ordered by ts', () => {
    db.insertBillingEntry(makeBillingEntry({ ts: '2026-04-10T14:00:00Z' }));
    db.insertBillingEntry(makeBillingEntry({ ts: '2026-04-10T12:00:00Z' }));
    const entries = db.getBillingEntriesForMonth('2026-04');
    assert.equal(entries[0].ts, '2026-04-10T12:00:00Z');
    assert.equal(entries[1].ts, '2026-04-10T14:00:00Z');
  });

  it('hydrates estimated_usage as boolean', () => {
    db.insertBillingEntry(makeBillingEntry({ estimated_usage: 1 }));
    db.insertBillingEntry(makeBillingEntry({ estimated_usage: 0 }));
    const entries = db.getBillingEntriesForMonth('2026-04');
    assert.equal(entries[0].estimated_usage, true);
    assert.equal(entries[1].estimated_usage, false);
  });
});

describe('AppDb — billing getBillingSnapshot', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns zeros for empty month', () => {
    const snap = db.getBillingSnapshot('2026-04', 'prod-1');
    assert.equal(snap.monthly_cost_usd, 0);
    assert.equal(snap.product_cost_usd, 0);
  });

  it('separates monthly vs product costs', () => {
    db.insertBillingEntry(makeBillingEntry({ product_id: 'prod-1', cost_usd: 0.01 }));
    db.insertBillingEntry(makeBillingEntry({ product_id: 'prod-2', cost_usd: 0.02 }));
    const snap = db.getBillingSnapshot('2026-04', 'prod-1');
    assert.equal(snap.product_calls, 1);
    assert.equal(snap.monthly_calls, 2);
  });
});

describe('AppDb — billing countBillingEntries', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns 0 for empty table', () => {
    assert.equal(db.countBillingEntries(), 0);
  });

  it('returns count after inserts', () => {
    db.insertBillingEntry(makeBillingEntry());
    db.insertBillingEntry(makeBillingEntry());
    assert.equal(db.countBillingEntries(), 2);
  });
});

describe('AppDb — billing getGlobalDaily', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns empty arrays for no data', () => {
    const result = db.getGlobalDaily({ days: 7 });
    assert.deepEqual(result.days, []);
    assert.deepEqual(result.by_day_reason, []);
  });

  it('aggregates totals by day', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', cost_usd: 0.01 }));
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', cost_usd: 0.02 }));
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-11', cost_usd: 0.05 }));
    const result = db.getGlobalDaily({ days: 30 });
    assert.equal(result.days.length, 2);
    const day10 = result.days.find((d) => d.day === '2026-04-10');
    assert.equal(day10.calls, 2);
  });

  it('returns by_day_reason breakdown for stacked charts', () => {
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', reason: 'extract', cost_usd: 0.01 }));
    db.insertBillingEntry(makeBillingEntry({ day: '2026-04-10', reason: 'health', cost_usd: 0.02 }));
    const result = db.getGlobalDaily({ days: 30 });
    assert.equal(result.by_day_reason.length, 2);
    const extract = result.by_day_reason.find((r) => r.reason === 'extract');
    assert.ok(extract);
    assert.equal(extract.day, '2026-04-10');
  });

  it('filters to recent N days', () => {
    const today = new Date().toISOString().slice(0, 10);
    const oldDay = '2020-01-01';
    db.insertBillingEntry(makeBillingEntry({ day: today, ts: `${today}T12:00:00Z`, month: today.slice(0, 7) }));
    db.insertBillingEntry(makeBillingEntry({ day: oldDay, ts: `${oldDay}T12:00:00Z`, month: oldDay.slice(0, 7) }));
    const result = db.getGlobalDaily({ days: 7 });
    assert.equal(result.days.length, 1);
    assert.equal(result.days[0].day, today);
  });
});

describe('AppDb — billing getGlobalEntries', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('returns empty for no data', () => {
    const result = db.getGlobalEntries({ limit: 10, offset: 0 });
    assert.deepEqual(result.entries, []);
    assert.equal(result.total, 0);
  });

  it('paginates with limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      db.insertBillingEntry(makeBillingEntry({ ts: `2026-04-10T1${i}:00:00Z` }));
    }
    const page1 = db.getGlobalEntries({ limit: 2, offset: 0 });
    assert.equal(page1.entries.length, 2);
    assert.equal(page1.total, 5);
    const page2 = db.getGlobalEntries({ limit: 2, offset: 2 });
    assert.equal(page2.entries.length, 2);
    assert.equal(page2.total, 5);
  });

  it('returns entries newest first', () => {
    db.insertBillingEntry(makeBillingEntry({ ts: '2026-04-10T10:00:00Z' }));
    db.insertBillingEntry(makeBillingEntry({ ts: '2026-04-10T14:00:00Z' }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0 });
    assert.equal(result.entries[0].ts, '2026-04-10T14:00:00Z');
    assert.equal(result.entries[1].ts, '2026-04-10T10:00:00Z');
  });

  it('filters by category', () => {
    db.insertBillingEntry(makeBillingEntry({ category: 'mouse' }));
    db.insertBillingEntry(makeBillingEntry({ category: 'keyboard' }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0, category: 'mouse' });
    assert.equal(result.entries.length, 1);
    assert.equal(result.total, 1);
    assert.equal(result.entries[0].category, 'mouse');
  });

  it('filters by model', () => {
    db.insertBillingEntry(makeBillingEntry({ model: 'gpt-5' }));
    db.insertBillingEntry(makeBillingEntry({ model: 'claude-sonnet-4-6' }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0, model: 'gpt-5' });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].model, 'gpt-5');
  });

  it('filters by reason', () => {
    db.insertBillingEntry(makeBillingEntry({ reason: 'extract' }));
    db.insertBillingEntry(makeBillingEntry({ reason: 'health' }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0, reason: 'extract' });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].reason, 'extract');
  });

  it('combines multiple filters', () => {
    db.insertBillingEntry(makeBillingEntry({ category: 'mouse', reason: 'extract' }));
    db.insertBillingEntry(makeBillingEntry({ category: 'mouse', reason: 'health' }));
    db.insertBillingEntry(makeBillingEntry({ category: 'keyboard', reason: 'extract' }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0, category: 'mouse', reason: 'extract' });
    assert.equal(result.entries.length, 1);
    assert.equal(result.total, 1);
  });

  it('hydrates estimated_usage as boolean', () => {
    db.insertBillingEntry(makeBillingEntry({ estimated_usage: 1 }));
    const result = db.getGlobalEntries({ limit: 10, offset: 0 });
    assert.equal(result.entries[0].estimated_usage, true);
  });
});
