/**
 * One-time migration: backfill brand_identifier on all products in a category.
 *
 * For each product with an empty brand_identifier, resolves the brand display
 * name to its stable 8-hex identifier via appDb. Batch UPDATEs in a single
 * SQLite transaction. Safe to re-run (idempotent).
 *
 * Pattern follows idFormatMigration.js exactly.
 */

import { resolveBrandIdentifier } from '../identity/resolveBrandIdentifier.js';

/**
 * @param {object} opts
 * @param {string} opts.category — category to backfill
 * @param {object} opts.appDb — global AppDb instance (brands table)
 * @param {object} opts.specDb — open SpecDb for this category
 * @param {boolean} [opts.dryRun=false] — if true, report without writing
 * @returns {{ ok, category, total, backfilled, skipped, dryRun, results[] }}
 */
export async function backfillBrandIdentifier({
  category,
  appDb,
  specDb,
  dryRun = false,
} = {}) {
  const cat = String(category ?? '').trim().toLowerCase();
  if (!cat) return { ok: false, error: 'category_required' };
  if (!specDb) return { ok: false, error: 'specDb_required' };
  if (!appDb) return { ok: false, error: 'appDb_required' };

  const allProducts = typeof specDb.getAllProducts === 'function'
    ? specDb.getAllProducts()
    : [];

  const results = [];
  let backfilled = 0;
  let skipped = 0;
  const updates = []; // collect { product_id, brand_identifier } for batch UPDATE

  for (const product of allProducts) {
    const pid = product.product_id;
    const existingBi = String(product.brand_identifier || '').trim();

    // Skip products that already have brand_identifier
    if (existingBi) {
      skipped += 1;
      results.push({ product_id: pid, status: 'skipped_already_set', brand_identifier: existingBi });
      continue;
    }

    const resolved = resolveBrandIdentifier(appDb, product.brand);

    if (!resolved) {
      // Unknown brand — skip, don't fail
      skipped += 1;
      results.push({ product_id: pid, status: 'skipped_unknown_brand', brand: product.brand });
      continue;
    }

    backfilled += 1;
    results.push({ product_id: pid, status: dryRun ? 'would_backfill' : 'backfilled', brand_identifier: resolved });
    if (!dryRun) {
      updates.push({ product_id: pid, brand_identifier: resolved });
    }
  }

  // Batch SQL UPDATE in a single transaction
  if (updates.length > 0) {
    const db = specDb._db || specDb.db;
    const stmt = db.prepare('UPDATE products SET brand_identifier = ?, updated_at = datetime(\'now\') WHERE product_id = ?');
    const tx = db.transaction(() => {
      for (const { product_id, brand_identifier } of updates) {
        stmt.run(brand_identifier, product_id);
      }
    });
    tx();
  }

  return {
    ok: true,
    category: cat,
    total: allProducts.length,
    backfilled,
    skipped,
    dryRun,
    results,
  };
}
