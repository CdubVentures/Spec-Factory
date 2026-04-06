// WHY: Resolves a pipeline job object from the products table in spec.sqlite.
// Replaces the fixture-file-based job loading for the critical pipeline path.
// The products table is the SSOT for product identity (brand, base_model, model, variant).

import { normalizeProductIdentity } from '../../../catalog/identity/identityDedup.js';

/**
 * @param {{ productId: string, category: string, specDb: { getProduct(pid: string): object|null }|null }} opts
 * @returns {{ productId: string, category: string, identityLock: object }|null}
 */
export function buildJobFromDb({ productId, category, specDb }) {
  if (!specDb || !productId || !category) return null;

  const row = specDb.getProduct(productId);
  if (!row) return null;

  const brand = String(row.brand || '').trim();
  const baseModel = String(row.base_model || '').trim();
  if (!brand || !baseModel) return null;

  const identity = normalizeProductIdentity(category, brand, baseModel, row.variant);

  return {
    productId,
    category,
    identityLock: {
      brand: identity.brand,
      base_model: identity.base_model,
      model: identity.model,
      variant: identity.variant,
      brand_identifier: String(row.brand_identifier || ''),
      sku: '',
      title: '',
    },
  };
}
