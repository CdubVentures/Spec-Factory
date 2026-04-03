// WHY: Global cross-category SQLite database for brands, settings, and studio maps.
// Unlike specDb (per-category, lazy-loaded), appDb is a single global instance
// opened eagerly at bootstrap. Mirrors specDb constructor pattern.

import Database from 'better-sqlite3';
import { APP_DB_SCHEMA } from './appDbSchema.js';

export class AppDb {
  constructor({ dbPath }) {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(APP_DB_SCHEMA);

    // ── Prepared statements ──

    this._upsertBrand = this.db.prepare(`
      INSERT INTO brands (identifier, canonical_name, slug, aliases, website, added_by)
      VALUES (@identifier, @canonical_name, @slug, @aliases, @website, @added_by)
      ON CONFLICT(identifier) DO UPDATE SET
        canonical_name = excluded.canonical_name,
        slug = excluded.slug,
        aliases = excluded.aliases,
        website = excluded.website,
        added_by = excluded.added_by,
        updated_at = datetime('now')
    `);

    this._getBrand = this.db.prepare('SELECT * FROM brands WHERE identifier = ?');
    this._getBrandBySlug = this.db.prepare('SELECT * FROM brands WHERE slug = ?');
    this._listBrands = this.db.prepare('SELECT * FROM brands ORDER BY canonical_name');
    this._deleteBrand = this.db.prepare('DELETE FROM brands WHERE identifier = ?');

    this._listBrandsForCategory = this.db.prepare(`
      SELECT b.* FROM brands b
      JOIN brand_categories bc ON b.identifier = bc.identifier
      WHERE bc.category = ?
      ORDER BY b.canonical_name
    `);

    this._deleteBrandCategories = this.db.prepare('DELETE FROM brand_categories WHERE identifier = ?');
    this._insertBrandCategory = this.db.prepare('INSERT INTO brand_categories (identifier, category) VALUES (?, ?)');
    this._getCategoriesForBrand = this.db.prepare('SELECT category FROM brand_categories WHERE identifier = ? ORDER BY category');

    this._insertBrandRename = this.db.prepare(`
      INSERT INTO brand_renames (identifier, old_slug, new_slug, old_name, new_name)
      VALUES (@identifier, @old_slug, @new_slug, @old_name, @new_name)
    `);
    this._getRenamesForBrand = this.db.prepare('SELECT * FROM brand_renames WHERE identifier = ? ORDER BY renamed_at');

    this._upsertSetting = this.db.prepare(`
      INSERT INTO settings (section, key, value, type)
      VALUES (@section, @key, @value, @type)
      ON CONFLICT(section, key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        updated_at = datetime('now')
    `);
    this._getSetting = this.db.prepare('SELECT * FROM settings WHERE section = ? AND key = ?');
    this._getSection = this.db.prepare('SELECT * FROM settings WHERE section = ?');
    this._deleteSection = this.db.prepare('DELETE FROM settings WHERE section = ?');

    this._upsertStudioMap = this.db.prepare(`
      INSERT INTO studio_maps (category, map_json, file_path)
      VALUES (@category, @map_json, @file_path)
      ON CONFLICT(category) DO UPDATE SET
        map_json = excluded.map_json,
        file_path = excluded.file_path,
        updated_at = datetime('now')
    `);
    this._getStudioMap = this.db.prepare('SELECT * FROM studio_maps WHERE category = ?');
    this._listStudioMaps = this.db.prepare('SELECT * FROM studio_maps ORDER BY category');

    this._findBrandByCanonicalName = this.db.prepare('SELECT * FROM brands WHERE LOWER(canonical_name) = LOWER(?)');
    this._findBrandsByAliasLike = this.db.prepare("SELECT * FROM brands WHERE aliases LIKE '%' || ? || '%'");
    this._updateBrandSlug = this.db.prepare('UPDATE brands SET slug = ?, updated_at = datetime(\'now\') WHERE identifier = ?');
    this._updateBrandCanonicalName = this.db.prepare('UPDATE brands SET canonical_name = ?, updated_at = datetime(\'now\') WHERE identifier = ?');
    this._updateBrandAliases = this.db.prepare('UPDATE brands SET aliases = ?, updated_at = datetime(\'now\') WHERE identifier = ?');
    this._updateBrandWebsite = this.db.prepare('UPDATE brands SET website = ?, updated_at = datetime(\'now\') WHERE identifier = ?');

    this._countBrands = this.db.prepare('SELECT COUNT(*) as c FROM brands');
    this._countBrandCategories = this.db.prepare('SELECT COUNT(*) as c FROM brand_categories');
    this._countBrandRenames = this.db.prepare('SELECT COUNT(*) as c FROM brand_renames');
    this._countSettings = this.db.prepare('SELECT COUNT(*) as c FROM settings');
    this._countStudioMaps = this.db.prepare('SELECT COUNT(*) as c FROM studio_maps');

    // ── Color Registry ──

    this._upsertColor = this.db.prepare(`
      INSERT INTO color_registry (name, hex, css_var)
      VALUES (@name, @hex, @css_var)
      ON CONFLICT(name) DO UPDATE SET
        hex = excluded.hex,
        css_var = excluded.css_var,
        updated_at = datetime('now')
    `);
    this._getColor = this.db.prepare('SELECT * FROM color_registry WHERE name = ?');
    this._listColors = this.db.prepare('SELECT * FROM color_registry ORDER BY name');
    this._deleteColor = this.db.prepare('DELETE FROM color_registry WHERE name = ?');
    this._countColors = this.db.prepare('SELECT COUNT(*) as c FROM color_registry');

    // WHY: transaction for setBrandCategories (delete + re-insert atomically)
    this._setBrandCategoriesTx = this.db.transaction((identifier, categories) => {
      this._deleteBrandCategories.run(identifier);
      for (const cat of categories) {
        this._insertBrandCategory.run(identifier, cat);
      }
    });
  }

  // ── Brands ──

  upsertBrand({ identifier, canonical_name, slug, aliases = '[]', website = '', added_by = 'seed' }) {
    this._upsertBrand.run({ identifier, canonical_name, slug, aliases, website, added_by });
  }

  getBrand(identifier) {
    return this._getBrand.get(identifier) || null;
  }

  getBrandBySlug(slug) {
    return this._getBrandBySlug.get(slug) || null;
  }

  listBrands() {
    return this._listBrands.all();
  }

  listBrandsForCategory(category) {
    return this._listBrandsForCategory.all(category);
  }

  deleteBrand(identifier) {
    return this._deleteBrand.run(identifier).changes;
  }

  findBrandByAlias(query) {
    const q = String(query ?? '').trim();
    if (!q) return null;
    const byName = this._findBrandByCanonicalName.get(q);
    if (byName) return byName;
    const candidates = this._findBrandsByAliasLike.all(q);
    const lower = q.toLowerCase();
    for (const row of candidates) {
      try {
        const aliases = JSON.parse(row.aliases || '[]');
        if (aliases.some((a) => String(a).toLowerCase() === lower)) return row;
      } catch { /* malformed aliases JSON — skip */ }
    }
    return null;
  }

  updateBrandSlug(identifier, newSlug) {
    return this._updateBrandSlug.run(newSlug, identifier).changes;
  }

  updateBrandFields(identifier, patch = {}) {
    let changes = 0;
    if (patch.canonical_name !== undefined) {
      changes += this._updateBrandCanonicalName.run(patch.canonical_name, identifier).changes;
    }
    if (patch.aliases !== undefined) {
      changes += this._updateBrandAliases.run(patch.aliases, identifier).changes;
    }
    if (patch.website !== undefined) {
      changes += this._updateBrandWebsite.run(patch.website, identifier).changes;
    }
    return changes > 0 ? 1 : 0;
  }

  // ── Brand Categories ──

  setBrandCategories(identifier, categories) {
    this._setBrandCategoriesTx(identifier, categories);
  }

  getCategoriesForBrand(identifier) {
    return this._getCategoriesForBrand.all(identifier).map((r) => r.category);
  }

  // ── Brand Renames ──

  insertBrandRename({ identifier, old_slug, new_slug, old_name, new_name }) {
    this._insertBrandRename.run({ identifier, old_slug, new_slug, old_name, new_name });
  }

  getRenamesForBrand(identifier) {
    return this._getRenamesForBrand.all(identifier);
  }

  // ── Settings ──

  upsertSetting({ section, key, value, type = 'string' }) {
    this._upsertSetting.run({ section, key, value, type });
  }

  getSetting(section, key) {
    return this._getSetting.get(section, key) || null;
  }

  getSection(section) {
    return this._getSection.all(section);
  }

  deleteSection(section) {
    return this._deleteSection.run(section).changes;
  }

  // ── Studio Maps ──

  upsertStudioMap({ category, map_json = '{}', file_path = '' }) {
    this._upsertStudioMap.run({ category, map_json, file_path });
  }

  getStudioMap(category) {
    return this._getStudioMap.get(category) || null;
  }

  listStudioMaps() {
    return this._listStudioMaps.all();
  }

  // ── Color Registry ──

  upsertColor({ name, hex, css_var }) {
    this._upsertColor.run({ name, hex, css_var });
  }

  getColor(name) {
    return this._getColor.get(name) || null;
  }

  listColors() {
    return this._listColors.all();
  }

  deleteColor(name) {
    return this._deleteColor.run(name).changes;
  }

  // ── Seed Hash Tracking ──
  // WHY: Hash-gated reconcile stores SHA256 of source files in the settings
  // table under a reserved '_seed_hashes' section. On startup, if the hash
  // differs from the stored value, the source is re-imported.

  getSeedHash(sourceKey) {
    const row = this._getSetting.get('_seed_hashes', sourceKey);
    return row ? String(row.value || '') : null;
  }

  setSeedHash(sourceKey, hashValue) {
    this._upsertSetting.run({
      section: '_seed_hashes',
      key: sourceKey,
      value: String(hashValue || ''),
      type: 'string',
    });
  }

  // ── Lifecycle ──

  isSeeded() {
    return this._countBrands.get().c > 0;
  }

  counts() {
    return {
      brands: this._countBrands.get().c,
      brand_categories: this._countBrandCategories.get().c,
      brand_renames: this._countBrandRenames.get().c,
      settings: this._countSettings.get().c,
      studio_maps: this._countStudioMaps.get().c,
      color_registry: this._countColors.get().c,
    };
  }

  close() {
    this.db.close();
  }
}
