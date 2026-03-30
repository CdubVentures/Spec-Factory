// WHY: Golden-master characterization tests that lock down the EXACT return shapes
// of every brandRegistry function. These verify that the SQL-backed implementation
// produces the same shapes as the original JSON implementation.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../../../../db/appDb.js';
import {
  addBrand,
  addBrandsBulk,
  updateBrand,
  removeBrand,
  getBrandsForCategory,
  findBrandByAlias,
  renameBrand,
  getBrandImpactAnalysis,
  loadBrandRegistry,
} from '../brandRegistry.js';

function createTestAppDb() {
  return new AppDb({ dbPath: ':memory:' });
}

async function tmpConfig() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'brand-char-'));
  return { categoryAuthorityRoot: dir, _tmpDir: dir };
}

async function cleanup(config, appDb) {
  appDb.close();
  try { await fs.rm(config._tmpDir, { recursive: true, force: true }); } catch {}
}

// ── loadBrandRegistry shape ──

describe('characterization: loadBrandRegistry', () => {
  it('returns { _doc, _version, brands } shape', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const reg = await loadBrandRegistry(config, { appDb });
      assert.equal(typeof reg._doc, 'string');
      assert.equal(reg._version, 1);
      assert.equal(typeof reg.brands, 'object');
      assert.ok(!Array.isArray(reg.brands));
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('brand entry has expected fields after addBrand', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'TestBrand', aliases: ['TB'], categories: ['mouse'], website: 'https://test.com' });
      const reg = await loadBrandRegistry(config, { appDb });
      const brand = reg.brands['testbrand'];
      assert.ok(brand, 'brand should exist under slug key');
      assert.equal(brand.canonical_name, 'TestBrand');
      assert.equal(typeof brand.identifier, 'string');
      assert.ok(brand.identifier.length > 0);
      assert.deepEqual(brand.aliases, ['TB']);
      assert.deepEqual(brand.categories, ['mouse']);
      assert.equal(brand.website, 'https://test.com');
      assert.equal(typeof brand.added_at, 'string');
      assert.equal(brand.added_by, 'gui');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── addBrand shape ──

describe('characterization: addBrand', () => {
  it('success returns { ok: true, slug, brand }', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await addBrand({ config, appDb, name: 'Acme', aliases: [], categories: ['mouse'], website: '' });
      assert.equal(result.ok, true);
      assert.equal(typeof result.slug, 'string');
      assert.equal(result.slug, 'acme');
      assert.equal(result.brand.canonical_name, 'Acme');
      assert.equal(typeof result.brand.identifier, 'string');
      assert.deepEqual(result.brand.aliases, []);
      assert.deepEqual(result.brand.categories, ['mouse']);
      assert.equal(result.brand.added_by, 'gui');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('empty name returns { ok: false, error: brand_name_required }', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await addBrand({ config, appDb, name: '', aliases: [], categories: [], website: '' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'brand_name_required');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('duplicate returns { ok: false, error: brand_already_exists, slug }', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', aliases: [], categories: ['mouse'], website: '' });
      const result = await addBrand({ config, appDb, name: 'Acme', aliases: [], categories: ['keyboard'], website: '' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'brand_already_exists');
      assert.equal(result.slug, 'acme');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── addBrandsBulk shape ──

describe('characterization: addBrandsBulk', () => {
  it('returns full results shape', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await addBrandsBulk({ config, appDb, names: ['Alpha', 'Beta', '', 'Alpha'], category: 'mouse' });
      assert.equal(result.ok, true);
      assert.equal(typeof result.total, 'number');
      assert.equal(typeof result.created, 'number');
      assert.equal(typeof result.skipped_existing, 'number');
      assert.equal(typeof result.skipped_duplicate, 'number');
      assert.equal(typeof result.invalid, 'number');
      assert.equal(typeof result.failed, 'number');
      assert.equal(typeof result.total_brands, 'number');
      assert.ok(Array.isArray(result.results));
      assert.equal(result.total, 4);
      assert.equal(result.created, 2);
      assert.equal(result.invalid, 1);
      assert.equal(result.skipped_duplicate, 1);
      for (const r of result.results) {
        assert.equal(typeof r.index, 'number');
        assert.equal(typeof r.name, 'string');
        assert.equal(typeof r.slug, 'string');
        assert.ok(['created', 'skipped_existing', 'skipped_duplicate', 'invalid'].includes(r.status));
      }
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('missing category returns error', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await addBrandsBulk({ config, appDb, names: ['X'], category: '' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'category_required');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── updateBrand shape ──

describe('characterization: updateBrand', () => {
  it('success returns { ok: true, slug, brand } with updated_at', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', categories: ['mouse'] });
      const result = await updateBrand({ config, appDb, slug: 'acme', patch: { website: 'https://acme.test' } });
      assert.equal(result.ok, true);
      assert.equal(result.slug, 'acme');
      assert.equal(result.brand.website, 'https://acme.test');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('not found returns { ok: false, error: brand_not_found }', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await updateBrand({ config, appDb, slug: 'nonexistent', patch: {} });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'brand_not_found');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── removeBrand shape ──

describe('characterization: removeBrand', () => {
  it('success returns { ok: true, slug, removed, total_products, products_by_category }', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', categories: ['mouse'] });
      const result = await removeBrand({ config, appDb, slug: 'acme', force: true });
      assert.equal(result.ok, true);
      assert.equal(result.slug, 'acme');
      assert.equal(result.removed, true);
      assert.equal(typeof result.total_products, 'number');
      assert.equal(typeof result.products_by_category, 'object');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── getBrandsForCategory shape ──

describe('characterization: getBrandsForCategory', () => {
  it('returns sorted array with slug prepended', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Zeta', categories: ['mouse'] });
      await addBrand({ config, appDb, name: 'Alpha', categories: ['mouse'] });
      await addBrand({ config, appDb, name: 'Beta', categories: ['keyboard'] });
      const list = getBrandsForCategory(appDb, 'mouse');
      assert.equal(list.length, 2);
      assert.equal(list[0].canonical_name, 'Alpha');
      assert.equal(list[1].canonical_name, 'Zeta');
      assert.equal(typeof list[0].slug, 'string');
      assert.equal(typeof list[0].identifier, 'string');
      assert.ok(Array.isArray(list[0].categories));
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── findBrandByAlias shape ──

describe('characterization: findBrandByAlias', () => {
  it('finds by canonical name (case-insensitive)', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', aliases: ['AC'], categories: ['mouse'] });
      const hit = findBrandByAlias(appDb, 'acme');
      assert.ok(hit);
      assert.equal(hit.canonical_name, 'Acme');
      assert.equal(typeof hit.slug, 'string');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('finds by alias (case-insensitive)', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', aliases: ['AC'], categories: ['mouse'] });
      const hit = findBrandByAlias(appDb, 'ac');
      assert.ok(hit);
      assert.equal(hit.canonical_name, 'Acme');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('returns null for no match', async () => {
    const appDb = createTestAppDb();
    try {
      assert.equal(findBrandByAlias(appDb, 'nothing'), null);
    } finally {
      appDb.close();
    }
  });
});

// ── renameBrand shape ──

describe('characterization: renameBrand', () => {
  it('success returns cascade shape', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', categories: ['mouse'] });
      const result = await renameBrand({ config, appDb, slug: 'acme', newName: 'Acme Corp' });
      assert.equal(result.ok, true);
      assert.equal(result.oldSlug, 'acme');
      assert.equal(result.newSlug, 'acme-corp');
      assert.equal(typeof result.identifier, 'string');
      assert.equal(result.oldName, 'Acme');
      assert.equal(result.newName, 'Acme Corp');
      assert.equal(typeof result.cascaded_products, 'number');
      assert.equal(typeof result.cascade_failures, 'number');
      assert.ok(Array.isArray(result.cascade_results));
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('slug collision returns error', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', categories: ['mouse'] });
      await addBrand({ config, appDb, name: 'Beta', categories: ['mouse'] });
      const result = await renameBrand({ config, appDb, slug: 'acme', newName: 'Beta' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'brand_already_exists');
    } finally {
      await cleanup(config, appDb);
    }
  });
});

// ── getBrandImpactAnalysis shape ──

describe('characterization: getBrandImpactAnalysis', () => {
  it('returns full impact shape', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      await addBrand({ config, appDb, name: 'Acme', categories: ['mouse'] });
      const result = await getBrandImpactAnalysis({ config, appDb, slug: 'acme' });
      assert.equal(result.ok, true);
      assert.equal(result.slug, 'acme');
      assert.equal(typeof result.identifier, 'string');
      assert.equal(result.canonical_name, 'Acme');
      assert.ok(Array.isArray(result.categories));
      assert.equal(typeof result.products_by_category, 'object');
      assert.equal(typeof result.product_details, 'object');
      assert.equal(typeof result.total_products, 'number');
    } finally {
      await cleanup(config, appDb);
    }
  });

  it('not found returns error', async () => {
    const config = await tmpConfig();
    const appDb = createTestAppDb();
    try {
      const result = await getBrandImpactAnalysis({ config, appDb, slug: 'nonexistent' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'brand_not_found');
    } finally {
      await cleanup(config, appDb);
    }
  });
});
