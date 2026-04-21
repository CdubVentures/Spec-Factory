import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { APP_DB_SCHEMA } from '../appDbSchema.js';

describe('APP_DB_SCHEMA', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof APP_DB_SCHEMA, 'string');
    assert.ok(APP_DB_SCHEMA.length > 0);
  });

  const expectedTables = [
    'brands',
    'brand_categories',
    'brand_renames',
    'settings',
    'studio_maps',
    'color_registry',
    'finder_global_settings',
  ];

  for (const table of expectedTables) {
    it(`contains CREATE TABLE IF NOT EXISTS ${table}`, () => {
      assert.ok(
        APP_DB_SCHEMA.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `missing CREATE TABLE for ${table}`,
      );
    });
  }

  const expectedIndexes = [
    'idx_brands_slug',
    'idx_bc_category',
    'idx_br_identifier',
  ];

  for (const idx of expectedIndexes) {
    it(`contains index ${idx}`, () => {
      assert.ok(
        APP_DB_SCHEMA.includes(idx),
        `missing index ${idx}`,
      );
    });
  }

  it('is executable against an in-memory database', () => {
    const db = new Database(':memory:');
    try {
      db.exec(APP_DB_SCHEMA);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r) => r.name);
      assert.ok(tables.includes('brands'));
      assert.ok(tables.includes('brand_categories'));
      assert.ok(tables.includes('brand_renames'));
      assert.ok(tables.includes('settings'));
      assert.ok(tables.includes('studio_maps'));
    } finally {
      db.close();
    }
  });

  it('is idempotent (executing twice produces no error)', () => {
    const db = new Database(':memory:');
    try {
      db.exec(APP_DB_SCHEMA);
      db.exec(APP_DB_SCHEMA);
    } finally {
      db.close();
    }
  });
});
