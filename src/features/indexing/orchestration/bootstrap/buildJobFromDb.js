// WHY: Resolves a pipeline job object from the products table in spec.sqlite.
// Replaces the fixture-file-based job loading for the critical pipeline path.
// The products table is the SSOT for product identity (brand, base_model, model, variant).

import { cleanVariant, isFabricatedVariant } from '../../../catalog/identity/identityDedup.js';

function parseSeedUrls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {{ productId: string, category: string, specDb: { getProduct(pid: string): object|null }|null }} opts
 * @returns {{ productId: string, category: string, identityLock: object, seedUrls: string[] }|null}
 */
export function buildJobFromDb({ productId, category, specDb }) {
  if (!specDb || !productId || !category) return null;

  const row = specDb.getProduct(productId);
  if (!row) return null;

  const brand = String(row.brand || '').trim();
  const model = String(row.model || '').trim();
  const baseModel = String(row.base_model || '').trim();
  if (!brand || !model) return null;

  // WHY: Fabricated variants must never enter the pipeline.
  // Use base_model for the check — variant tokens naturally appear in the full
  // model name (e.g., "Scream" is in "ULX Prophecy - Scream") but NOT in the
  // base_model ("ULX Prophecy"). Checking against model strips real variants.
  let variant = cleanVariant(row.variant);
  const fabricationRef = baseModel !== model ? baseModel : model;
  if (variant && isFabricatedVariant(fabricationRef, variant)) {
    variant = '';
  }

  return {
    productId,
    category,
    identityLock: {
      brand,
      base_model: baseModel,
      model,
      variant,
      brand_identifier: String(row.brand_identifier || ''),
      sku: '',
      title: '',
    },
    seedUrls: parseSeedUrls(row.seed_urls),
  };
}
