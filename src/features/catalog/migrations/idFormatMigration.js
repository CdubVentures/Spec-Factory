/**
 * One-time migration: rekey all products from slug-based IDs to {category}-{identifier} format.
 *
 * Each catalog product already has an 8-char hex `identifier` field. This migration:
 * 1. Loads the product catalog for a category
 * 2. For each product whose key doesn't match {category}-{8hex}:
 *    - New key = `{category}-{identifier}`
 *    - Rekeys the catalog JSON object
 *    - Batch UPDATEs all SQL tables with product_id
 *    - Calls migrateProductArtifacts() to move storage keys
 *    - Logs the rename
 * 3. Saves the updated catalog
 *
 * Safe to run multiple times — already-migrated products are skipped.
 */

import { loadProductCatalog, saveProductCatalog } from '../products/productCatalog.js';
import { migrateProductArtifacts, appendRenameLog } from './artifactMigration.js';

const HEX_ID_RE = /^[a-z][a-z0-9-]*-[a-f0-9]{8}$/;

// WHY: All 26 tables with a product_id column. Each gets a batch UPDATE.
const TABLES_WITH_PRODUCT_ID = [
  'products',
  'product_runs',
  'product_queue',
  'item_field_state',
  'item_component_links',
  'item_list_links',
  'candidates',
  'crawl_sources',
  'source_screenshots',
  'source_videos',
  'source_pdfs',
  'field_history',
  'runs',
  'run_artifacts',
  'bridge_events',
  'runtime_events',
  'billing_entries',
  'evidence_documents',
  'evidence_facts',
  'source_registry',
  'curation_suggestions',
  'component_review_queue',
  'query_index',
  'knob_snapshots',
  'audit_log',
  'domain_classifications',
];

/**
 * Migrate all products in a category from slug-based IDs to hex-based IDs.
 *
 * @param {object} opts
 * @param {object} opts.config — app config (for categoryAuthorityRoot)
 * @param {string} opts.category — category to migrate
 * @param {object} opts.storage — storage instance
 * @param {object|null} opts.specDb — open SpecDb for this category
 * @param {boolean} opts.dryRun — if true, don't write anything, just report what would change
 * @returns {{ ok, migrated, skipped, failed, results }}
 */
export async function migrateProductIds({
  config,
  category,
  storage = null,
  specDb = null,
  dryRun = false,
}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) throw new Error('migrateProductIds requires a category');

  const catalog = await loadProductCatalog(config, cat);
  const entries = Object.entries(catalog.products || {});

  const results = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [oldPid, product] of entries) {
    // Skip already-migrated products (hex format)
    if (HEX_ID_RE.test(oldPid)) {
      skipped += 1;
      results.push({ oldPid, newPid: oldPid, status: 'skipped_already_hex' });
      continue;
    }

    const identifier = String(product.identifier || '').trim();
    if (!identifier || identifier.length !== 8) {
      failed += 1;
      results.push({ oldPid, newPid: null, status: 'failed_no_identifier', error: `missing or invalid identifier: "${identifier}"` });
      continue;
    }

    const newPid = `${cat}-${identifier}`;

    // Safety: don't overwrite an existing product with the new key
    if (catalog.products[newPid]) {
      failed += 1;
      results.push({ oldPid, newPid, status: 'failed_key_collision', error: `target key ${newPid} already exists` });
      continue;
    }

    if (dryRun) {
      migrated += 1;
      results.push({ oldPid, newPid, status: 'would_migrate' });
      continue;
    }

    try {
      // 1. Rekey catalog entry
      catalog.products[newPid] = product;
      delete catalog.products[oldPid];

      // 2. SQL batch UPDATE (inside a transaction)
      if (specDb) {
        const db = specDb._db || specDb.db;
        if (db) {
          const transaction = db.transaction(() => {
            for (const table of TABLES_WITH_PRODUCT_ID) {
              try {
                db.prepare(`UPDATE ${table} SET product_id = ? WHERE product_id = ?`).run(newPid, oldPid);
              } catch {
                // Table might not exist in this DB — skip
              }
            }
          });
          transaction();
        }
      }

      // 3. Migrate storage artifacts
      if (storage) {
        await migrateProductArtifacts({
          storage,
          config,
          category: cat,
          oldProductId: oldPid,
          newProductId: newPid,
          identifier,
          specDb,
        });
      }

      // 4. Log rename
      await appendRenameLog(config, cat, {
        identifier,
        id: product.id,
        old_slug: oldPid,
        new_slug: newPid,
        migrated_count: 0,
        failed_count: 0,
        migration_type: 'id_format_migration',
      });

      migrated += 1;
      results.push({ oldPid, newPid, status: 'migrated' });
    } catch (err) {
      // Rollback catalog change on failure
      catalog.products[oldPid] = product;
      delete catalog.products[newPid];
      failed += 1;
      results.push({ oldPid, newPid, status: 'failed', error: err.message || String(err) });
    }
  }

  // Save the updated catalog (all renames applied)
  if (!dryRun && migrated > 0) {
    await saveProductCatalog(config, cat, catalog);
  }

  return {
    ok: failed === 0,
    category: cat,
    total: entries.length,
    migrated,
    skipped,
    failed,
    dryRun,
    results,
  };
}
