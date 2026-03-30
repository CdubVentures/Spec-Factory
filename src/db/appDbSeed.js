// WHY: One-time seed path for app.sqlite. Reads brand_registry.json and
// user-settings.json, populates the SQL tables. Only runs when the brands
// table is empty (first launch or after DB deletion).

import fsSync from 'node:fs';

function readJsonSafe(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
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
  if (appDb.isSeeded()) {
    return { skipped: true, brands_seeded: 0, settings_seeded: 0, studio_maps_seeded: 0 };
  }

  let brands_seeded = 0;
  let settings_seeded = 0;
  let studio_maps_seeded = 0;

  // ── Seed brands ──
  const registry = readJsonSafe(brandRegistryPath);
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
        brands_seeded++;
      }
    });
    seedBrandsTx();
  }

  // ── Seed settings + studio maps ──
  const settingsDoc = readJsonSafe(userSettingsPath);
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
  }

  return { skipped: false, brands_seeded, settings_seeded, studio_maps_seeded };
}
