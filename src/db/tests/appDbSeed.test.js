import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../appDb.js';
import { seedAppDb, seedBillingFromJsonl } from '../appDbSeed.js';

const FIXTURE_BRANDS = {
  _doc: 'Test brand registry',
  _version: 1,
  brands: {
    'acme': {
      canonical_name: 'Acme',
      identifier: 'aabb1122',
      aliases: [],
      categories: ['mouse', 'keyboard'],
      website: '',
      added_at: '2026-01-01T00:00:00.000Z',
      added_by: 'seed',
    },
    'globex': {
      canonical_name: 'Globex',
      identifier: 'ccdd3344',
      aliases: ['GX'],
      categories: ['mouse'],
      website: 'https://globex.test',
      added_at: '2026-01-01T00:00:00.000Z',
      added_by: 'gui',
    },
  },
};

const FIXTURE_SETTINGS = {
  schemaVersion: 2,
  runtime: {
    autoScrollEnabled: true,
    llmTimeoutMs: 30000,
    llmProvider: 'gemini',
  },
  convergence: {},
  storage: {
    enabled: false,
    destinationType: 'local',
  },
  studio: {
    mouse: {
      map: { key_list: { sheet: 'Sheet1' } },
      file_path: '/test/map.json',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  },
  ui: {
    studioAutoSaveEnabled: true,
    runtimeAutoSaveEnabled: false,
  },
};

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

function writeTempJson(dir, filename, data) {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

describe('seedAppDb', () => {
  let db;
  let tmpDir;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appdb-seed-'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips when file hashes unchanged (hash-gated)', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    assert.equal(result.brands_seeded, 0);
    assert.equal(result.settings_seeded, 0);
    assert.equal(db.counts().brands, 2);
  });

  it('seeds brands from registry JSON', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    assert.equal(result.skipped, false);
    assert.equal(result.brands_seeded, 2);
    const acme = db.getBrand('aabb1122');
    assert.equal(acme.canonical_name, 'Acme');
    assert.equal(acme.slug, 'acme');
    const globex = db.getBrand('ccdd3344');
    assert.equal(globex.canonical_name, 'Globex');
    assert.equal(globex.aliases, '["GX"]');
    assert.equal(globex.website, 'https://globex.test');
  });

  it('seeds brand_categories correctly', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent' });
    const acmeCats = db.getCategoriesForBrand('aabb1122');
    assert.deepEqual(acmeCats.sort(), ['keyboard', 'mouse']);
    const globexCats = db.getCategoriesForBrand('ccdd3344');
    assert.deepEqual(globexCats, ['mouse']);
  });

  it('seeds settings from runtime section with correct types', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(result.skipped, false);

    const autoScroll = db.getSetting('runtime', 'autoScrollEnabled');
    assert.equal(autoScroll.value, 'true');
    assert.equal(autoScroll.type, 'bool');

    const timeout = db.getSetting('runtime', 'llmTimeoutMs');
    assert.equal(timeout.value, '30000');
    assert.equal(timeout.type, 'number');

    const provider = db.getSetting('runtime', 'llmProvider');
    assert.equal(provider.value, 'gemini');
    assert.equal(provider.type, 'string');
  });

  it('seeds settings from storage section', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    const section = db.getSection('storage');
    assert.equal(section.length, 2);
  });

  it('seeds settings from ui section', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    const section = db.getSection('ui');
    assert.equal(section.length, 2);
    const autoSave = db.getSetting('ui', 'studioAutoSaveEnabled');
    assert.equal(autoSave.value, 'true');
    assert.equal(autoSave.type, 'bool');
  });

  it('seeds studio_maps from studio section', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(result.studio_maps_seeded, 1);
    const m = db.getStudioMap('mouse');
    assert.ok(m);
    assert.equal(m.file_path, '/test/map.json');
    const parsed = JSON.parse(m.map_json);
    assert.ok(parsed.map);
    assert.ok(parsed.map.key_list);
  });

  it('empty convergence section produces zero rows', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent', userSettingsPath: settingsPath });
    assert.equal(db.getSection('convergence').length, 0);
  });

  it('returns accurate counts', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: settingsPath });
    assert.equal(result.skipped, false);
    assert.equal(result.brands_seeded, 2);
    assert.equal(result.settings_seeded, 7); // 3 runtime + 2 storage + 2 ui
    assert.equal(result.studio_maps_seeded, 1);
  });

  it('handles missing brand registry path gracefully', () => {
    const settingsPath = writeTempJson(tmpDir, 'settings.json', FIXTURE_SETTINGS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: '/nonexistent/brands.json', userSettingsPath: settingsPath });
    assert.equal(result.skipped, false);
    assert.equal(result.brands_seeded, 0);
    assert.ok(result.settings_seeded > 0);
  });

  it('handles missing settings path gracefully', () => {
    const brandPath = writeTempJson(tmpDir, 'brands.json', FIXTURE_BRANDS);
    const result = seedAppDb({ appDb: db, brandRegistryPath: brandPath, userSettingsPath: '/nonexistent/settings.json' });
    assert.equal(result.skipped, false);
    assert.equal(result.brands_seeded, 2);
    assert.equal(result.settings_seeded, 0);
    assert.equal(result.studio_maps_seeded, 0);
  });

  it('handles malformed JSON gracefully', () => {
    const badPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badPath, '{not valid json!!!', 'utf8');
    const result = seedAppDb({ appDb: db, brandRegistryPath: badPath, userSettingsPath: badPath });
    assert.equal(result.skipped, false);
    assert.equal(result.brands_seeded, 0);
    assert.equal(result.settings_seeded, 0);
  });
});

// ── Billing rebuild from JSONL ──

describe('seedBillingFromJsonl', () => {
  let db, tmpDir;
  beforeEach(() => {
    db = new AppDb({ dbPath: ':memory:' });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-seed-'));
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports JSONL entries into empty billing_entries table', () => {
    const ledgerDir = path.join(tmpDir, 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    const lines = [
      JSON.stringify({ ts: '2026-04-10T12:00:00Z', month: '2026-04', day: '2026-04-10', provider: 'openai', model: 'gpt-5', category: 'mouse', productId: 'p1', cost_usd: 0.01, prompt_tokens: 100, completion_tokens: 50, reason: 'extract' }),
      JSON.stringify({ ts: '2026-04-11T12:00:00Z', month: '2026-04', day: '2026-04-11', provider: 'anthropic', model: 'claude-sonnet-4-6', category: 'keyboard', productId: 'p2', cost_usd: 0.02, prompt_tokens: 200, completion_tokens: 100, reason: 'plan' }),
    ];
    fs.writeFileSync(path.join(ledgerDir, '2026-04.jsonl'), lines.join('\n') + '\n', 'utf8');

    const result = seedBillingFromJsonl({ appDb: db, billingLedgerDir: ledgerDir });
    assert.equal(result.billing_seeded, 2);
    assert.equal(db.countBillingEntries(), 2);

    const entries = db.getBillingEntriesForMonth('2026-04');
    assert.equal(entries[0].provider, 'openai');
    assert.equal(entries[1].provider, 'anthropic');
  });

  it('skips import when table already has data', () => {
    db.insertBillingEntry({ ts: '2026-04-01T00:00:00Z', month: '2026-04', day: '2026-04-01', provider: 'x', model: 'y', cost_usd: 0 });
    const ledgerDir = path.join(tmpDir, 'ledger');
    fs.mkdirSync(ledgerDir, { recursive: true });
    fs.writeFileSync(path.join(ledgerDir, '2026-04.jsonl'), JSON.stringify({ ts: '2026-04-10T12:00:00Z', month: '2026-04', provider: 'z', model: 'w' }) + '\n', 'utf8');

    const result = seedBillingFromJsonl({ appDb: db, billingLedgerDir: ledgerDir });
    assert.equal(result.billing_seeded, 0);
    assert.equal(db.countBillingEntries(), 1);
  });

  it('returns 0 when no JSONL files exist', () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = seedBillingFromJsonl({ appDb: db, billingLedgerDir: emptyDir });
    assert.equal(result.billing_seeded, 0);
    assert.equal(db.countBillingEntries(), 0);
  });

  it('returns 0 when ledger directory does not exist', () => {
    const result = seedBillingFromJsonl({ appDb: db, billingLedgerDir: path.join(tmpDir, 'nope') });
    assert.equal(result.billing_seeded, 0);
  });
});
