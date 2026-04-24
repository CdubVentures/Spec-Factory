import { normalizeIdentityToken } from '../../utils/identityNormalize.js';

function readProductForFamily({ product = null, specDb = null, productId = '' } = {}) {
  if (product && (product.brand || product.base_model || product.model)) {
    return product;
  }
  return specDb?.getProduct?.(productId) || null;
}

export function resolveKeyFinderFamilySize({ product = null, specDb = null, productId = '' } = {}) {
  const source = readProductForFamily({ product, specDb, productId }) || {};
  const brand = normalizeIdentityToken(source.brand);
  const baseModel = normalizeIdentityToken(source.base_model || source.model);
  if (!brand || !baseModel) return 1;

  try {
    const rows = specDb?.getAllProducts?.() || [];
    if (!Array.isArray(rows) || rows.length === 0) return 1;

    const familyRows = rows.filter((row) =>
      normalizeIdentityToken(row?.brand) === brand
      && normalizeIdentityToken(row?.base_model) === baseModel
    );
    return Math.max(1, familyRows.length);
  } catch {
    return 1;
  }
}
