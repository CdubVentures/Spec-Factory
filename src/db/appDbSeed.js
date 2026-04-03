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

export function seedAppDb({ appDb, brandRegistryPath, userSettingsPath }) {
  let brands_seeded = 0;
  let renames_seeded = 0;
  let settings_seeded = 0;
  let studio_maps_seeded = 0;

  // ── Brand registry reconcile ──
  const brandRaw = readRawSafe(brandRegistryPath);
  const brandHash = brandRaw ? sha256Hex(brandRaw) : null;
  const storedBrandHash = appDb.getSeedHash('brand_registry');

  if (brandRaw && brandHash !== storedBrandHash) {
    let registry;
    try { registry = JSON.parse(brandRaw); } catch { registry = null; }

    if (registry && registry.brands && typeof registry.brands === 'object') {
      const seedBrandsTx = appDb.db.transaction(() => {
        for (const [slug, brand] of Object.entries(registry.brands)) {
          if (!brand || !brand.identifier) continue;
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
          const renames = Array.isArray(brand.renames) ? brand.renames : [];
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
      const seedSettingsTx = appDb.db.transaction(() => {
        for (const section of FLAT_SETTINGS_SECTIONS) {
          const sectionData = settingsDoc[section];
          if (!sectionData || typeof sectionData !== 'object') continue;
          for (const [key, value] of Object.entries(sectionData)) {
            appDb.upsertSetting({
              section,
              key,
              value: serializeSettingValue(value),
              type: detectSettingType(value),
            });
            settings_seeded++;
          }
        }

        // Studio maps are per-category nested objects
        const studioData = settingsDoc.studio;
        if (studioData && typeof studioData === 'object') {
          for (const [category, entry] of Object.entries(studioData)) {
            if (!entry || typeof entry !== 'object') continue;
            appDb.upsertStudioMap({
              category,
              map_json: JSON.stringify(entry),
              file_path: entry.file_path || '',
            });
            studio_maps_seeded++;
          }
        }
      });
      seedSettingsTx();
      appDb.setSeedHash('user_settings', settingsHash);
    }
  }

  const skipped = !brandRaw && !settingsRaw;
  return { skipped, brands_seeded, renames_seeded, settings_seeded, studio_maps_seeded };
}
