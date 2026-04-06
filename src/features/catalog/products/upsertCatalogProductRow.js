// WHY: Single shared upsert mapper for catalog product rows.
// Previously duplicated in catalogRoutes.js and brandRoutes.js.

import { normalizeProductIdentity } from '../identity/identityDedup.js';

export function upsertCatalogProductRow(specDb, category, productId, product) {
  if (!specDb?.upsertProduct || !productId || !product || typeof product !== 'object') return false;
  const identity = normalizeProductIdentity(
    category, product.brand, product.base_model, product.variant
  );
  specDb.upsertProduct({
    category: specDb.category || String(category || '').trim().toLowerCase(),
    product_id: productId,
    brand: identity.brand,
    model: identity.model,
    base_model: identity.base_model,
    variant: identity.variant,
    status: String(product.status || '').trim() || 'active',
    identifier: String(product.identifier || '').trim() || null,
    brand_identifier: String(product.brand_identifier || '').trim() || '',
  });
  return true;
}
