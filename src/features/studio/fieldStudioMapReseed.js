// WHY: Hash-gated reseed for field_studio_map.json.
// On boot, compares SHA256 of JSON file against stored hash. If changed:
// 1. Wipes and re-imports field_studio_map table
// 2. Reconciles list_values source='manual' rows from manual_enum_values
// If field_overrides changed, logs a warning (compile may be needed for
// generated artifacts to be correct).

import fsSync from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../../shared/contentHash.js';

function normalizeToken(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function reseedFieldStudioMapFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const jsonPath = path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');

  let raw;
  try {
    raw = fsSync.readFileSync(jsonPath, 'utf8');
  } catch {
    return { reseeded: false };
  }

  const currentHash = sha256Hex(raw);
  const storedHash = specDb.getFileSeedHash('field_studio_map');
  if (currentHash && currentHash === storedHash) return { reseeded: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${jsonPath}: ${err.message}`);
  }

  const map = parsed && typeof parsed === 'object' ? parsed : {};

  const tx = specDb.db.transaction(() => {
    // 1. Wipe + re-import field_studio_map table
    specDb.db.prepare('DELETE FROM field_studio_map WHERE id = 1').run();
    if (Object.keys(map).length > 0) {
      const mapHash = sha256Hex(JSON.stringify(map));
      specDb.upsertFieldStudioMap(JSON.stringify(map), mapHash);
    }

    // 2. Reconcile list_values source='manual' from manual_enum_values
    const manualEnumValues = map.manual_enum_values && typeof map.manual_enum_values === 'object'
      ? map.manual_enum_values : {};
    const manualEnumTimestamps = map.manual_enum_timestamps && typeof map.manual_enum_timestamps === 'object'
      ? map.manual_enum_timestamps : {};

    // Build expected set from JSON
    const expectedManual = new Set();
    for (const [fieldKey, values] of Object.entries(manualEnumValues)) {
      if (!Array.isArray(values)) continue;
      for (const value of values) {
        const trimmed = String(value || '').trim();
        if (!trimmed) continue;
        expectedManual.add(`${fieldKey}::${normalizeToken(trimmed)}`);

        const tsKey = `${fieldKey}::${normalizeToken(trimmed)}`;
        specDb.upsertListValue({
          category,
          field_key: fieldKey,
          value: trimmed,
          normalized_value: normalizeToken(trimmed),
          source: 'manual',
          overridden: 0,
          needs_review: 0,
          source_timestamp: manualEnumTimestamps[tsKey] || null,
        });
      }
    }

    // Delete stale manual rows not in JSON
    const existingManual = specDb.db
      .prepare("SELECT field_key, value FROM list_values WHERE category = ? AND source = 'manual'")
      .all(category);
    let manualRemoved = 0;
    for (const row of existingManual) {
      const key = `${row.field_key}::${normalizeToken(row.value)}`;
      if (!expectedManual.has(key)) {
        specDb.db.prepare("DELETE FROM list_values WHERE category = ? AND field_key = ? AND value = ? AND source = 'manual'")
          .run(category, row.field_key, row.value);
        manualRemoved++;
      }
    }

    return { manualRemoved };
  });

  const { manualRemoved } = tx();

  // WHY: If field_overrides changed, generated artifacts may be stale.
  if (map.field_overrides && Object.keys(map.field_overrides).length > 0) {
    console.warn(`[reseed] field_studio_map.json changed for ${category} — run compile if field_overrides affect generated output`);
  }

  specDb.setFileSeedHash('field_studio_map', currentHash);
  return { reseeded: true, manualRemoved };
}
