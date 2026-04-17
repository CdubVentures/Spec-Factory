// WHY: Hash-gated reconcile for app.sqlite. Reads brand_registry.json and
// user-settings.json, populates SQL tables. Only re-imports a source when
// its SHA256 hash differs from the stored hash (or on first run).

import fsSync from 'node:fs';
import { sha256Hex } from '../shared/contentHash.js';

function readRawSafe(filePath) {
  try {
    return fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function detectSettingType(value) {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'number';
  if (value !== null && typeof value === 'object') return 'json';
  return 'string';
}

function serializeSettingValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const FLAT_SETTINGS_SECTIONS = ['runtime', 'convergence', 'storage', 'ui'];

export function seedAppDb({ appDb, brandRegistryPath, userSettingsPath, unitRegistryPath }) {
  let brands_seeded = 0;
  let brands_removed = 0;
  let renames_seeded = 0;
  let renames_removed = 0;
  let settings_seeded = 0;
  let settings_removed = 0;
  let studio_maps_seeded = 0;
  let studio_maps_removed = 0;
  let units_seeded = 0;

  // ── Brand registry reconcile ──
  const brandRaw = readRawSafe(brandRegistryPath);
  const brandHash = brandRaw ? sha256Hex(brandRaw) : null;
  const storedBrandHash = appDb.getSeedHash('brand_registry');

  if (brandRaw && brandHash !== storedBrandHash) {
    let registry;
    try { registry = JSON.parse(brandRaw); } catch { registry = null; }

    if (registry && registry.brands && typeof registry.brands === 'object') {
      const jsonIdentifiers = new Set();

      const seedBrandsTx = appDb.db.transaction(() => {
        for (const [slug, brand] of Object.entries(registry.brands)) {
          if (!brand || !brand.identifier) continue;
          jsonIdentifiers.add(brand.identifier);
          appDb.upsertBrand({
            identifier: brand.identifier,
            canonical_name: brand.canonical_name || slug,
            slug,
            aliases: JSON.stringify(brand.aliases || []),
            website: brand.website || '',
            added_by: brand.added_by || 'seed',
          });
          const categories = Array.isArray(brand.categories) ? brand.categories : [];
          if (categories.length > 0) {
            appDb.setBrandCategories(brand.identifier, categories);
          }
          // WHY: Clean-slate per brand — delete existing renames before re-inserting
          // from JSON. Prevents both stale renames (removed from JSON) and duplicate
          // rows (plain INSERT on reseed with unchanged renames).
          const existingRenameCount = appDb.db
            .prepare('DELETE FROM brand_renames WHERE identifier = ?')
            .run(brand.identifier).changes || 0;
          const renames = Array.isArray(brand.renames) ? brand.renames : [];
          if (existingRenameCount > renames.length) {
            renames_removed += existingRenameCount - renames.length;
          }
          for (const rename of renames) {
            appDb.insertBrandRename({
              identifier: brand.identifier,
              old_slug: rename.old_slug || '',
              new_slug: rename.new_slug || '',
              old_name: rename.old_name || '',
              new_name: rename.new_name || '',
            });
            renames_seeded++;
          }
          brands_seeded++;
        }

        // WHY: Delete stale brands not in JSON. Without this, removing a brand
        // from brand_registry.json leaves orphan rows in SQL.
        const existingBrands = appDb.db
          .prepare('SELECT identifier FROM brands')
          .all();
        for (const row of existingBrands) {
          if (!jsonIdentifiers.has(row.identifier)) {
            appDb.db.prepare('DELETE FROM brand_categories WHERE identifier = ?').run(row.identifier);
            appDb.db.prepare('DELETE FROM brand_renames WHERE identifier = ?').run(row.identifier);
            appDb.db.prepare('DELETE FROM brands WHERE identifier = ?').run(row.identifier);
            brands_removed++;
          }
        }
      });
      seedBrandsTx();
      appDb.setSeedHash('brand_registry', brandHash);
    }
  }

  // ── Settings + studio maps reconcile ──
  const settingsRaw = readRawSafe(userSettingsPath);
  const settingsHash = settingsRaw ? sha256Hex(settingsRaw) : null;
  const storedSettingsHash = appDb.getSeedHash('user_settings');

  if (settingsRaw && settingsHash !== storedSettingsHash) {
    let settingsDoc;
    try { settingsDoc = JSON.parse(settingsRaw); } catch { settingsDoc = null; }

    if (settingsDoc && typeof settingsDoc === 'object') {
      const jsonSettingKeys = new Set();
      const jsonStudioCategories = new Set();

      const seedSettingsTx = appDb.db.transaction(() => {
        for (const section of FLAT_SETTINGS_SECTIONS) {
          const sectionData = settingsDoc[section];
          if (!sectionData || typeof sectionData !== 'object') continue;
          for (const [key, value] of Object.entries(sectionData)) {
            jsonSettingKeys.add(`${section}::${key}`);
            appDb.upsertSetting({
              section,
              key,
              value: serializeSettingValue(value),
              type: detectSettingType(value),
            });
            settings_seeded++;
          }
        }

        // WHY: Delete stale settings not in JSON. Excludes _seed_hashes section
        // which is internal bookkeeping, not user-facing settings.
        const existingSettings = appDb.db
          .prepare("SELECT section, key FROM settings WHERE section != '_seed_hashes'")
          .all();
        for (const row of existingSettings) {
          if (!jsonSettingKeys.has(`${row.section}::${row.key}`)) {
            appDb.db.prepare('DELETE FROM settings WHERE section = ? AND key = ?').run(row.section, row.key);
            settings_removed++;
          }
        }

        // Studio maps are per-category nested objects
        const studioData = settingsDoc.studio;
        if (studioData && typeof studioData === 'object') {
          for (const [category, entry] of Object.entries(studioData)) {
            if (!entry || typeof entry !== 'object') continue;
            jsonStudioCategories.add(category);
            appDb.upsertStudioMap({
              category,
              map_json: JSON.stringify(entry),
              file_path: entry.file_path || '',
            });
            studio_maps_seeded++;
          }
        }

        // WHY: Delete stale studio_maps not in JSON.
        const existingMaps = appDb.db
          .prepare('SELECT category FROM studio_maps')
          .all();
        for (const row of existingMaps) {
          if (!jsonStudioCategories.has(row.category)) {
            appDb.db.prepare('DELETE FROM studio_maps WHERE category = ?').run(row.category);
            studio_maps_removed++;
          }
        }
      });
      seedSettingsTx();
      appDb.setSeedHash('user_settings', settingsHash);
    }
  }

  // ── Unit Registry ──
  const unitRaw = unitRegistryPath ? readRawSafe(unitRegistryPath) : null;
  const unitHash = unitRaw ? sha256Hex(unitRaw) : null;
  const storedUnitHash = appDb.getSeedHash('unit_registry');

  if (unitRaw && unitHash !== storedUnitHash) {
    try {
      const unitDoc = JSON.parse(unitRaw);
      const units = Array.isArray(unitDoc?.units) ? unitDoc.units : [];
      const seedUnitsTx = appDb.db.transaction(() => {
        appDb.db.prepare('DELETE FROM unit_registry').run();
        for (const u of units) {
          if (!u.canonical) continue;
          appDb.upsertUnit({
            canonical: u.canonical,
            label: u.label || '',
            synonyms: Array.isArray(u.synonyms) ? u.synonyms : [],
            conversions: Array.isArray(u.conversions) ? u.conversions : [],
          });
          units_seeded++;
        }
      });
      seedUnitsTx();
      appDb.setSeedHash('unit_registry', unitHash);
    } catch { /* ignore malformed JSON — leave existing data */ }
  }

  const skipped = !brandRaw && !settingsRaw && !unitRaw;
  return {
    skipped, brands_seeded, brands_removed, renames_seeded, renames_removed,
    settings_seeded, settings_removed, studio_maps_seeded, studio_maps_removed,
    units_seeded,
  };
}

// WHY: Rebuild contract for billing_entries. If the table is empty (e.g. deleted
// app.sqlite) but JSONL ledger files exist, re-import them to restore the
// runtime projection. Append-only data — no hash-gating (hash changes every write).
export function seedBillingFromJsonl({ appDb, billingLedgerDir }) {
  if (!appDb || !billingLedgerDir) return { billing_seeded: 0 };
  if (appDb.countBillingEntries() > 0) return { billing_seeded: 0 };

  let files;
  try {
    files = fsSync.readdirSync(billingLedgerDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return { billing_seeded: 0 };
  }
  if (!files.length) return { billing_seeded: 0 };

  let billing_seeded = 0;
  for (const file of files) {
    let text;
    try {
      text = fsSync.readFileSync(fsSync.realpathSync(`${billingLedgerDir}/${file}`), 'utf8');
    } catch { continue; }

    const entries = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        entries.push({
          ts: parsed.ts || '',
          month: parsed.month || String(parsed.ts || '').slice(0, 7),
          day: parsed.day || String(parsed.ts || '').slice(0, 10),
          provider: parsed.provider || 'unknown',
          model: parsed.model || 'unknown',
          category: parsed.category || '',
          product_id: parsed.productId || parsed.product_id || '',
          run_id: parsed.runId || parsed.run_id || '',
          round: parsed.round ?? 0,
          prompt_tokens: parsed.prompt_tokens ?? 0,
          completion_tokens: parsed.completion_tokens ?? 0,
          cached_prompt_tokens: parsed.cached_prompt_tokens ?? 0,
          total_tokens: parsed.total_tokens ?? 0,
          cost_usd: parsed.cost_usd ?? 0,
          reason: parsed.reason || '',
          host: parsed.host || '',
          url_count: parsed.url_count ?? 0,
          evidence_chars: parsed.evidence_chars ?? 0,
          estimated_usage: parsed.estimated_usage ? 1 : 0,
          meta: typeof parsed.meta === 'object' ? JSON.stringify(parsed.meta) : (parsed.meta || '{}'),
        });
      } catch { /* skip malformed line */ }
    }
    if (entries.length) {
      try {
        appDb.insertBillingEntriesBatch(entries);
        billing_seeded += entries.length;
      } catch { /* best-effort */ }
    }
  }
  return { billing_seeded };
}
