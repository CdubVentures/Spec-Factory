import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../appDb.js';
import { seedAppDb } from '../appDbSeed.js';
import { sha256Hex } from '../../shared/contentHash.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURE_BRANDS = {
  _doc: 'Test brand registry',
  _version: 1,
  brands: {
    acme: {
      canonical_name: 'Acme',
      identifier: 'aabb1122',
      aliases: [],
      categories: ['mouse'],
      website: '',
      added_at: '2026-01-01T00:00:00.000Z',
      added_by: 'seed',
    },
  },
};

const FIXTURE_BRANDS_V2 = {
  ...FIXTURE_BRANDS,
  brands: {
    acme: {
      ...FIXTURE_BRANDS.brands.acme,
      canonical_name: 'Acme Corp',
      website: 'https://acme.test',
    },
  },
};

const FIXTURE_SETTINGS = {
  schemaVersion: 2,
  runtime: { llmProvider: 'gemini' },
  convergence: {},
  storage: {},
  studio: {},
  ui: {},
};

const FIXTURE_SETTINGS_V2 = {
  ...FIXTURE_SETTINGS,
  runtime: { llmProvider: 'openai' },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

function writeTempJson(dir, filename, data) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

// ── getSeedHash / setSeedHash ───────────────────────────────────────────────

describe('AppDb seed hash storage', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  test('getSeedHash returns null on fresh DB', () => {
    assert.equal(db.getSeedHash('brand_registry'), null);
  });

  test('setSeedHash + getSeedHash round-trips', () => {
    const hash = sha256Hex('test content');
    db.setSeedHash('brand_registry', hash);
    assert.equal(db.getSeedHash('brand_registry'), hash);
  });

  test('setSeedHash overwrites previous hash', () => {
    db.setSeedHash('brand_registry', 'aaa');
    db.setSeedHash('brand_registry', 'bbb');
    assert.equal(db.getSeedHash('brand_registry'), 'bbb');
  });

  test('different source keys are independent', () => {
    db.setSeedHash('brand_registry', 'hash-a');
    db.setSeedHash('user_settings', 'hash-b');
    assert.equal(db.getSeedHash('brand_registry'), 'hash-a');
    assert.equal(db.getSeedHash('user_settings'), 'hash-b');
  });

  test('_seed_hashes section does not pollute user settings', () => {
    db.setSeedHash('brand_registry', 'some-hash');
    const runtimeSection = db.getSection('runtime');
    assert.equal(runtimeSection.length, 0);
    const hashSection = db.getSection('_seed_hashes');
    assert.equal(hashSection.length, 1);
  });
});

// ── seedAppDb hash-gated reconcile ──────────────────────────────────────────

describe('seedAppDb hash-gated reconcile', () => {
  let db;
  let tmpDir;
  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdb-reconcile-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('seeds brands on first run (no stored hash)', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(result.brands_seeded, 1);
    assert.ok(db.getBrand('aabb1122'));
    assert.ok(db.getSeedHash('brand_registry'));
  });

  test('skips brands when hash unchanged', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(result.brands_seeded, 0);
  });

  test('re-seeds brands when file changes', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getBrand('aabb1122').canonical_name, 'Acme');

    writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS_V2);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(result.brands_seeded, 1);
    assert.equal(db.getBrand('aabb1122').canonical_name, 'Acme Corp');
    assert.equal(db.getBrand('aabb1122').website, 'https://acme.test');
  });

  test('seeds settings on first run (no stored hash)', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(result.settings_seeded > 0);
    assert.equal(db.getSetting('runtime', 'llmProvider').value, 'gemini');
    assert.ok(db.getSeedHash('user_settings'));
  });

  test('skips settings when hash unchanged', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(result.settings_seeded, 0);
  });

  test('re-seeds settings when file changes', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(db.getSetting('runtime', 'llmProvider').value, 'gemini');

    writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS_V2);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(result.settings_seeded > 0);
    assert.equal(db.getSetting('runtime', 'llmProvider').value, 'openai');
  });

  test('each source reconciles independently', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });

    // Change only brands, settings file stays same
    writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS_V2);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    assert.equal(result.brands_seeded, 1);
    assert.equal(result.settings_seeded, 0);
  });

  test('handles missing brand file gracefully', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(result.brands_seeded, 0);
    assert.ok(result.settings_seeded > 0);
  });

  test('handles missing settings file gracefully', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(result.brands_seeded, 1);
    assert.equal(result.settings_seeded, 0);
  });

  test('handles both files missing gracefully', () => {
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: '/nonexistent' });
    assert.equal(result.brands_seeded, 0);
    assert.equal(result.settings_seeded, 0);
  });
});

// ── Delete reconcile (stale row removal) ───────────────────────────────────

describe('seedAppDb delete reconcile — brands', () => {
  let db;
  let tmpDir;
  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdb-delete-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removing a brand from JSON deletes it from SQL on reseed', () => {
    const twoBrands = {
      brands: {
        acme: { identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed' },
        globex: { identifier: 'ccdd3344', canonical_name: 'Globex', aliases: [], categories: ['mouse'], website: '', added_by: 'seed' },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', twoBrands);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.ok(db.getBrand('aabb1122'));
    assert.ok(db.getBrand('ccdd3344'));

    const oneBrand = {
      brands: {
        acme: { identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed' },
      },
    };
    writeTempJson(tmpDir, 'brands.json', oneBrand);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.ok(result.brands_removed >= 1);
    assert.ok(db.getBrand('aabb1122'));
    assert.ok(!db.getBrand('ccdd3344'), 'globex brand should be removed');
  });

  test('removing a brand also removes its brand_categories', () => {
    const twoBrands = {
      brands: {
        acme: { identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse', 'keyboard'], website: '', added_by: 'seed' },
        globex: { identifier: 'ccdd3344', canonical_name: 'Globex', aliases: [], categories: ['monitor'], website: '', added_by: 'seed' },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', twoBrands);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.deepEqual(db.getCategoriesForBrand('ccdd3344'), ['monitor']);

    const oneBrand = { brands: { acme: twoBrands.brands.acme } };
    writeTempJson(tmpDir, 'brands.json', oneBrand);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.deepEqual(db.getCategoriesForBrand('ccdd3344'), []);
  });
});

describe('seedAppDb delete reconcile — brand_renames', () => {
  let db;
  let tmpDir;
  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdb-rename-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removing a rename from JSON deletes it from SQL on reseed', () => {
    const v1 = {
      brands: {
        acme: {
          identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed',
          renames: [
            { old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' },
            { old_slug: 'ac', new_slug: 'acme', old_name: 'Ac', new_name: 'Acme' },
          ],
        },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 2);

    const v2 = {
      brands: {
        acme: {
          ...v1.brands.acme,
          renames: [{ old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' }],
        },
      },
    };
    writeTempJson(tmpDir, 'brands.json', v2);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    const renames = db.getRenamesForBrand('aabb1122');
    assert.equal(renames.length, 1);
    assert.equal(renames[0].old_slug, 'acm');
  });

  test('re-seeding same brand does NOT create duplicate renames', () => {
    const v1 = {
      brands: {
        acme: {
          identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed',
          renames: [{ old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' }],
        },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 1);

    // Change something else to trigger reseed (hash must differ)
    const v2 = { brands: { acme: { ...v1.brands.acme, website: 'https://acme.test' } } };
    writeTempJson(tmpDir, 'brands.json', v2);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 1, 'should NOT create duplicate rename rows');
  });

  test('brand with no renames in JSON clears all its renames on reseed', () => {
    const v1 = {
      brands: {
        acme: {
          identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed',
          renames: [{ old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' }],
        },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 1);

    const v2 = { brands: { acme: { ...v1.brands.acme, renames: [] } } };
    writeTempJson(tmpDir, 'brands.json', v2);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 0, 'all renames should be cleared');
  });

  test('adding a rename to JSON inserts it on reseed', () => {
    const v1 = {
      brands: {
        acme: {
          identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: ['mouse'], website: '', added_by: 'seed',
          renames: [{ old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' }],
        },
      },
    };
    const brandPath = writeTempJson(tmpDir, 'brands.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 1);

    const v2 = {
      brands: {
        acme: {
          ...v1.brands.acme,
          renames: [
            { old_slug: 'acm', new_slug: 'acme', old_name: 'Acm', new_name: 'Acme' },
            { old_slug: 'ac', new_slug: 'acme', old_name: 'Ac', new_name: 'Acme' },
          ],
        },
      },
    };
    writeTempJson(tmpDir, 'brands.json', v2);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(db.getRenamesForBrand('aabb1122').length, 2);
  });
});

describe('seedAppDb delete reconcile — settings', () => {
  let db;
  let tmpDir;
  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdb-delete-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removing a setting key from JSON deletes it from SQL on reseed', () => {
    const v1 = { runtime: { llmProvider: 'gemini', llmTimeoutMs: 30000 }, convergence: {}, storage: {}, ui: {} };
    const settingsPath = writeTempJson(tmpDir, 'settings.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(db.getSetting('runtime', 'llmTimeoutMs'));

    const v2 = { runtime: { llmProvider: 'gemini' }, convergence: {}, storage: {}, ui: {} };
    writeTempJson(tmpDir, 'settings.json', v2);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(result.settings_removed >= 1);
    assert.ok(!db.getSetting('runtime', 'llmTimeoutMs'), 'llmTimeoutMs should be removed');
    assert.ok(db.getSetting('runtime', 'llmProvider'));
  });

  test('removing a studio_map category from JSON deletes it from SQL on reseed', () => {
    const v1 = {
      runtime: {}, convergence: {}, storage: {}, ui: {},
      studio: {
        mouse: { map: {}, file_path: '/a' },
        keyboard: { map: {}, file_path: '/b' },
      },
    };
    const settingsPath = writeTempJson(tmpDir, 'settings.json', v1);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(db.getStudioMap('mouse'));
    assert.ok(db.getStudioMap('keyboard'));

    const v2 = {
      runtime: {}, convergence: {}, storage: {}, ui: {},
      studio: { mouse: { map: {}, file_path: '/a' } },
    };
    writeTempJson(tmpDir, 'settings.json', v2);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.ok(result.studio_maps_removed >= 1);
    assert.ok(db.getStudioMap('mouse'));
    assert.ok(!db.getStudioMap('keyboard'), 'keyboard studio map should be removed');
  });

  test('seed hashes section is never deleted during settings reconcile', () => {
    const v1 = { runtime: { llmProvider: 'gemini' }, convergence: {}, storage: {}, ui: {} };
    const settingsPath = writeTempJson(tmpDir, 'settings.json', v1);
    const brandPath = writeTempJson(tmpDir, 'brands.json', { brands: { acme: { identifier: 'aabb1122', canonical_name: 'Acme', aliases: [], categories: [], website: '', added_by: 'seed' } } });
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    assert.ok(db.getSeedHash('brand_registry'));

    const v2 = { runtime: {}, convergence: {}, storage: {}, ui: {} };
    writeTempJson(tmpDir, 'settings.json', v2);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    assert.ok(db.getSeedHash('brand_registry'), '_seed_hashes must survive settings reconcile');
  });
});
