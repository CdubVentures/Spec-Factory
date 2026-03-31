// WHY: Single shared upsert mapper for catalog product rows.
// Previously duplicated in catalogRoutes.js and brandRoutes.js.

import { cleanVariant, isFabricatedVariant } from '../identity/identityDedup.js';

export function upsertCatalogProductRow(specDb, category, productId, product) {
  if (!specDb?.upsertProduct || !productId || !product || typeof product !== 'object') return false;
  const model = String(product.model || '').trim();
  let variant = cleanVariant(product.variant);
  // WHY: Fabricated variants (tokens already in model) must never reach the DB.
  if (variant && isFabricatedVariant(model, variant)) {
    variant = '';
  }
  specDb.upsertProduct({
    category: specDb.category || String(category || '').trim().toLowerCase(),
    product_id: productId,
    brand: String(product.brand || '').trim(),
    model,
    variant,
    status: String(product.status || '').trim() || 'active',
    seed_urls: Array.isArray(product.seed_urls) ? product.seed_urls : [],
    identifier: String(product.identifier || '').trim() || null,
    brand_identifier: String(product.brand_identifier || '').trim() || '',
  });
  return true;
}
