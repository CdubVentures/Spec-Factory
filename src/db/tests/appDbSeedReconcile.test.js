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
