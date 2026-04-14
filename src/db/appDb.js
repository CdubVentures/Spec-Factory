// WHY: Global cross-category SQLite database for brands, settings, and studio maps.
// Unlike specDb (per-category, lazy-loaded), appDb is a single global instance
// opened eagerly at bootstrap. Mirrors specDb constructor pattern.

import Database from 'better-sqlite3';
import { APP_DB_SCHEMA } from './appDbSchema.js';

function safeParseJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function hydrateUnitRow(row) {
  return {
    ...row,
    synonyms: safeParseJson(row.synonyms_json, []),
    conversions: safeParseJson(row.conversions_json, []),
  };
}

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

    // ── Unit Registry ──

    this._upsertUnit = this.db.prepare(`
      INSERT INTO unit_registry (canonical, label, synonyms_json, conversions_json)
      VALUES (@canonical, @label, @synonyms_json, @conversions_json)
      ON CONFLICT(canonical) DO UPDATE SET
        label = excluded.label,
        synonyms_json = excluded.synonyms_json,
        conversions_json = excluded.conversions_json,
        updated_at = datetime('now')
    `);
    this._getUnit = this.db.prepare('SELECT * FROM unit_registry WHERE canonical = ?');
    this._listUnits = this.db.prepare('SELECT * FROM unit_registry ORDER BY canonical');
    this._deleteUnit = this.db.prepare('DELETE FROM unit_registry WHERE canonical = ?');

    // ── Billing ──

    this._insertBillingEntry = this.db.prepare(`
      INSERT INTO billing_entries (
        ts, month, day, provider, model, category, product_id, run_id, round,
        prompt_tokens, completion_tokens, cached_prompt_tokens, total_tokens,
        cost_usd, reason, host, url_count, evidence_chars, estimated_usage, meta
      ) VALUES (
        @ts, @month, @day, @provider, @model, @category, @product_id, @run_id, @round,
        @prompt_tokens, @completion_tokens, @cached_prompt_tokens, @total_tokens,
        @cost_usd, @reason, @host, @url_count, @evidence_chars, @estimated_usage, @meta
      )
    `);
    this._countBillingEntries = this.db.prepare('SELECT COUNT(*) as c FROM billing_entries');

    this._insertBillingEntriesBatchTx = this.db.transaction((entries) => {
      for (const entry of entries) { this._insertBillingEntry.run(entry); }
    });

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

  // ── Unit Registry ──

  upsertUnit({ canonical, label, synonyms, conversions }) {
    this._upsertUnit.run({
      canonical,
      label: label || '',
      synonyms_json: JSON.stringify(Array.isArray(synonyms) ? synonyms : []),
      conversions_json: JSON.stringify(Array.isArray(conversions) ? conversions : []),
    });
  }

  getUnit(canonical) {
    const row = this._getUnit.get(canonical);
    return row ? hydrateUnitRow(row) : null;
  }

  listUnits() {
    return this._listUnits.all().map(hydrateUnitRow);
  }

  deleteUnit(canonical) {
    return this._deleteUnit.run(canonical).changes;
  }

  // ── Billing ──

  insertBillingEntry(entry) {
    this._insertBillingEntry.run({
      ts: entry.ts || new Date().toISOString(),
      month: entry.month || String(entry.ts || '').slice(0, 7),
      day: entry.day || String(entry.ts || '').slice(0, 10),
      provider: entry.provider || 'unknown',
      model: entry.model || 'unknown',
      category: entry.category || '',
      product_id: entry.product_id || entry.productId || '',
      run_id: entry.run_id || entry.runId || '',
      round: entry.round ?? 0,
      prompt_tokens: entry.prompt_tokens ?? 0,
      completion_tokens: entry.completion_tokens ?? 0,
      cached_prompt_tokens: entry.cached_prompt_tokens ?? 0,
      total_tokens: entry.total_tokens ?? 0,
      cost_usd: entry.cost_usd ?? 0,
      reason: entry.reason || 'extract',
      host: entry.host || '',
      url_count: entry.url_count ?? 0,
      evidence_chars: entry.evidence_chars ?? 0,
      estimated_usage: entry.estimated_usage ? 1 : 0,
      meta: typeof entry.meta === 'object' ? JSON.stringify(entry.meta) : (entry.meta || '{}'),
    });
  }

  insertBillingEntriesBatch(entries) {
    this._insertBillingEntriesBatchTx(entries);
  }

  getBillingRollup(month, category = '') {
    const catFilter = category ? ' AND category = ?' : '';
    const params = category ? [month, category] : [month];

    const totals = this.db.prepare(`
      SELECT COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter}
    `).get(...params) || { calls: 0, cost_usd: 0, prompt_tokens: 0, completion_tokens: 0 };

    const by_day = {};
    for (const row of this.db.prepare(`
      SELECT day, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter} GROUP BY day
    `).all(...params)) {
      by_day[row.day] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_category = {};
    for (const row of this.db.prepare(`
      SELECT category, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter} GROUP BY category
    `).all(...params)) {
      by_category[row.category || ''] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_product = {};
    for (const row of this.db.prepare(`
      SELECT product_id, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter} GROUP BY product_id
    `).all(...params)) {
      by_product[row.product_id || ''] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_model = {};
    for (const row of this.db.prepare(`
      SELECT provider || ':' || model as model_key, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter} GROUP BY model_key
    `).all(...params)) {
      by_model[row.model_key] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    const by_reason = {};
    for (const row of this.db.prepare(`
      SELECT reason, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE month = ?${catFilter} GROUP BY reason
    `).all(...params)) {
      by_reason[row.reason || 'extract'] = { cost_usd: row.cost_usd, prompt_tokens: row.prompt_tokens, completion_tokens: row.completion_tokens, calls: row.calls };
    }

    return {
      month,
      generated_at: new Date().toISOString(),
      totals,
      by_day,
      by_category,
      by_product,
      by_model,
      by_reason,
    };
  }

  getBillingEntriesForMonth(month) {
    const rows = this.db.prepare('SELECT * FROM billing_entries WHERE month = ? ORDER BY ts').all(month);
    return rows.map((row) => {
      const out = { ...row };
      out.estimated_usage = Number(out.estimated_usage) === 1;
      return out;
    });
  }

  getBillingSnapshot(month, productId) {
    const monthly = this.getBillingRollup(month);
    const product = monthly.by_product[productId] || { cost_usd: 0, calls: 0, prompt_tokens: 0, completion_tokens: 0 };
    return {
      month,
      monthly_cost_usd: monthly.totals.cost_usd,
      monthly_calls: monthly.totals.calls,
      product_cost_usd: product.cost_usd,
      product_calls: product.calls,
      monthly,
    };
  }

  countBillingEntries() {
    return this._countBillingEntries.get().c;
  }

  getGlobalDaily({ days = 30 } = {}) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const dayRows = this.db.prepare(`
      SELECT day, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens
      FROM billing_entries WHERE day >= ? GROUP BY day ORDER BY day
    `).all(cutoff);

    const reasonRows = this.db.prepare(`
      SELECT day, reason, COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM billing_entries WHERE day >= ? GROUP BY day, reason ORDER BY day, reason
    `).all(cutoff);

    return { days: dayRows, by_day_reason: reasonRows };
  }

  getGlobalEntries({ limit = 100, offset = 0, category = '', model = '', reason = '' } = {}) {
    const filters = [];
    const params = [];
    if (category) { filters.push('category = ?'); params.push(category); }
    if (model) { filters.push('model = ?'); params.push(model); }
    if (reason) { filters.push('reason = ?'); params.push(reason); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const total = this.db.prepare(`SELECT COUNT(*) as c FROM billing_entries ${where}`).get(...params).c;

    const entries = this.db.prepare(
      `SELECT * FROM billing_entries ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`
    ).all(...params, Math.max(1, limit), Math.max(0, offset));

    return {
      entries: entries.map((row) => ({ ...row, estimated_usage: Number(row.estimated_usage) === 1 })),
      total,
    };
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
      billing_entries: this._countBillingEntries.get().c,
    };
  }

  close() {
    this.db.close();
  }
}
