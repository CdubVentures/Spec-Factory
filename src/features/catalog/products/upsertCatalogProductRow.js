// WHY: Single shared upsert mapper for catalog product rows.
// Previously duplicated in catalogRoutes.js and brandRoutes.js.

export function upsertCatalogProductRow(specDb, category, productId, product) {
  if (!specDb?.upsertProduct || !productId || !product || typeof product !== 'object') return false;
  specDb.upsertProduct({
    category: specDb.category || String(category || '').trim().toLowerCase(),
    product_id: productId,
    brand: String(product.brand || '').trim(),
    model: String(product.model || '').trim(),
    variant: String(product.variant || '').trim(),
    status: String(product.status || '').trim() || 'active',
    seed_urls: Array.isArray(product.seed_urls) ? product.seed_urls : [],
    identifier: String(product.identifier || '').trim() || null,
  });
  return true;
}
