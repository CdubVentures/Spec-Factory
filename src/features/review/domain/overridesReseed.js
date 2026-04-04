// WHY: Hash-gated reseed for consolidated overrides.json.
// On boot, compares SHA256 of overrides.json against stored hash. If changed,
// clears all override-derived state and marks the products surface as needing
// a full re-run. The actual re-seeding is done by the existing seedProducts +
// backfillComponentLinks + seedSourceAndKeyReview surfaces.
//
// This surface is intentionally lightweight — it only wipes and flags.
// The re-population is handled by the category seed engine on the same boot.

import fsSync from 'node:fs';
import path from 'node:path';
import { sha256Hex } from '../../../shared/contentHash.js';

export function reseedOverridesFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const jsonPath = path.join(helperRoot, category, '_overrides', 'overrides.json');

  let raw;
  try {
    raw = fsSync.readFileSync(jsonPath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { reseeded: false };
    throw err;
  }

  const currentHash = sha256Hex(raw);
  const storedHash = specDb.getFileSeedHash('overrides');
  if (currentHash && currentHash === storedHash) return { reseeded: false };

  // Validate JSON before wiping
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${jsonPath}: ${err.message}`);
  }

  // WHY: Clear all override-derived columns so the next products seed re-applies
  // from fresh JSON. Column-level wipe (not row-level) because base product values
  // from normalized.json must survive.
  const clearOverrideColumns = specDb.db.prepare(`
    UPDATE item_field_state
    SET overridden = 0,
        override_source = NULL,
        override_value = NULL,
        override_reason = NULL,
        override_provenance = NULL,
        overridden_by = NULL,
        overridden_at = NULL
    WHERE category = ?
  `);

  const clearProductReviewState = specDb.db.prepare(`
    DELETE FROM product_review_state WHERE category = ?
  `);

  const tx = specDb.db.transaction(() => {
    clearOverrideColumns.run(category);
    clearProductReviewState.run(category);
  });
  tx();

  // WHY: Invalidate the field_rules_signature so the category seed engine
  // re-runs products + backfill_links + source_key_review on this same boot.
  // This is the cleanest way to trigger a full re-seed of the dependent surfaces
  // without duplicating the seed logic.
  const syncState = specDb.getSpecDbSyncState(category);
  const meta = { ...syncState.last_sync_meta };
  meta.field_rules_signature = null;
  specDb.recordSpecDbSync({
    category,
    status: syncState.last_sync_status || 'ok',
    meta,
    version: syncState.specdb_sync_version,
  });

  specDb.setFileSeedHash('overrides', currentHash);

  const productCount = Object.keys(parsed?.products || {}).length;
  return { reseeded: true, productCount };
}
