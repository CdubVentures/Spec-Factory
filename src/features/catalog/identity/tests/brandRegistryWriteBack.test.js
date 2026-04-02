// WHY: Tests for writeBackBrandRegistry — ensures brand mutations survive DB rebuild
// by syncing SQL state back to brand_registry.json after every HTTP mutation.

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../../../../db/appDb.js';
import { writeBackBrandRegistry } from '../brandRegistry.js';
import { seedAppDb } from '../../../../db/appDbSeed.js';

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

function tmpJsonPath() {
  return path.join(os.tmpdir(), `brand_registry_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
}

function cleanup(filePath) {
  try { unlinkSync(filePath); } catch { /* ignore */ }
}

function seedOneBrand(appDb, { slug = 'acme', name = 'Acme', identifier = 'abc123', categories = ['mouse'] } = {}) {
  appDb.upsertBrand({
    identifier,
    canonical_name: name,
    slug,
    aliases: '[]',
    website: '',
    added_by: 'gui',
  });
  if (categories.length > 0) {
    appDb.setBrandCategories(identifier, categories);
  }
}

// ── writeBackBrandRegistry ──

describe('writeBackBrandRegistry', () => {
  let jsonPath;
  afterEach(() => { if (jsonPath) cleanup(jsonPath); });

  it('no-op when path is falsy', async () => {
    const db = createTestDb();
    try {
      await writeBackBrandRegistry(db, null);
      await writeBackBrandRegistry(db, '');
      await writeBackBrandRegistry(db, undefined);
    } finally {
      db.close();
    }
  });

  it('produces valid JSON with _doc, _version, and slug-keyed brands', async () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedOneBrand(db);
      await writeBackBrandRegistry(db, jsonPath);
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      assert.equal(data._doc, 'Global brand registry. Managed by GUI.');
      assert.equal(data._version, 1);
      assert.equal(typeof data.brands, 'object');
      assert.ok(!Array.isArray(data.brands));
      assert.ok(data.brands.acme, 'brand keyed by slug');
    } finally {
      db.close();
    }
  });

  it('brand shape has all required fields', async () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedOneBrand(db, { slug: 'razer', name: 'Razer', identifier: 'rz001', categories: ['mouse', 'keyboard'] });
      await writeBackBrandRegistry(db, jsonPath);
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const brand = data.brands.razer;
      assert.equal(brand.canonical_name, 'Razer');
      assert.equal(brand.identifier, 'rz001');
      assert.ok(Array.isArray(brand.aliases), 'aliases is array');
      assert.ok(Array.isArray(brand.categories), 'categories is array');
      assert.deepEqual(brand.categories.sort(), ['keyboard', 'mouse']);
      assert.equal(typeof brand.website, 'string');
      assert.equal(typeof brand.added_by, 'string');
      assert.ok('added_at' in brand, 'has added_at');
    } finally {
      db.close();
    }
  });

  it('round-trip: write-back → re-seed → brand survives', async () => {
    const db1 = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedOneBrand(db1, { slug: 'corsair', name: 'Corsair', identifier: 'cr001', categories: ['keyboard'] });
      await writeBackBrandRegistry(db1, jsonPath);
    } finally {
      db1.close();
    }

    // New DB, seed from the written JSON
    const db2 = createTestDb();
    try {
      seedAppDb({ appDb: db2, brandRegistryPath: jsonPath });
      const brand = db2.getBrandBySlug('corsair');
      assert.ok(brand, 'brand survived DB rebuild');
      assert.equal(brand.canonical_name, 'Corsair');
      assert.equal(brand.identifier, 'cr001');
      const cats = db2.getCategoriesForBrand('cr001');
      assert.deepEqual(cats, ['keyboard']);
    } finally {
      db2.close();
    }
  });

  it('handles empty DB — writes empty brands object', async () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      await writeBackBrandRegistry(db, jsonPath);
      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      assert.deepEqual(data.brands, {});
      assert.equal(data._version, 1);
    } finally {
      db.close();
    }
  });

  it('overwrites existing file with latest state', async () => {
    const db = createTestDb();
    jsonPath = tmpJsonPath();
    try {
      seedOneBrand(db, { slug: 'logitech', name: 'Logitech', identifier: 'lg001' });
      await writeBackBrandRegistry(db, jsonPath);

      // Add second brand, write again
      seedOneBrand(db, { slug: 'steelseries', name: 'SteelSeries', identifier: 'ss001' });
      await writeBackBrandRegistry(db, jsonPath);

      const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
      assert.ok(data.brands.logitech, 'first brand still present');
      assert.ok(data.brands.steelseries, 'second brand added');
      assert.equal(Object.keys(data.brands).length, 2);
    } finally {
      db.close();
    }
  });
});
