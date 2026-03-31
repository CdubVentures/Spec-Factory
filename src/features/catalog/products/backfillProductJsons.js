// WHY: One-time backfill — creates .workspace/products/{pid}/product.json for
// every product in the SQL products table that doesn't already have one.
// Existing products were added before writeProductIdentity existed.
// writeProductIdentity is idempotent (skips existing files), so this is safe to re-run.

import { writeProductIdentity } from './writeProductIdentity.js';
import { cleanVariant, isFabricatedVariant } from '../identity/identityDedup.js';

export function backfillProductJsons({ specDb, category, productRoot }) {
  if (!specDb) return { total: 0, created: 0, skipped: 0 };

  const allProducts = specDb.getAllProducts() || [];
  let created = 0;
  let skipped = 0;

  for (const row of allProducts) {
    const pid = row.product_id;
    if (!pid) continue;

    let seedUrls = [];
    try {
      seedUrls = row.seed_urls ? JSON.parse(row.seed_urls) : [];
    } catch { /* ignore parse errors */ }

    const model = String(row.model || '').trim();
    // WHY: Fabricated variants (tokens already in model) must never reach product.json.
    let variant = cleanVariant(row.variant);
    if (variant && isFabricatedVariant(model, variant)) {
      variant = '';
    }

    const result = writeProductIdentity({
      productId: pid,
      category: category || row.category || '',
      identity: {
        brand: row.brand || '',
        model,
        variant,
      },
      seedUrls: Array.isArray(seedUrls) ? seedUrls : [],
      identifier: row.identifier || '',
      productRoot,
    });

    if (result.created) {
      created += 1;
    } else {
      skipped += 1;
    }
  }

  return { total: allProducts.length, created, skipped };
}
