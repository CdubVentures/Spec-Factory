// WHY: One-time backfill — creates .workspace/products/{pid}/product.json for
// every product in the SQL products table that doesn't already have one.
// Existing products were added before writeProductIdentity existed.
// writeProductIdentity is idempotent (skips existing files), so this is safe to re-run.

import { writeProductIdentity } from './writeProductIdentity.js';
import { normalizeProductIdentity } from '../identity/identityDedup.js';

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

    const cat = category || row.category || '';
    const identity = normalizeProductIdentity(cat, row.brand, row.base_model, row.variant);

    const result = writeProductIdentity({
      productId: pid,
      category: cat,
      identity: {
        brand: identity.brand,
        base_model: identity.base_model,
        model: identity.model,
        variant: identity.variant,
        brand_identifier: row.brand_identifier || '',
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
