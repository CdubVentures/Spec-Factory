/**
 * Variant Dossier Helper.
 *
 * Given (productId, variantId), returns the variant identity row plus every
 * field_candidates row tied to that variant: variant-scoped rows
 * (variant_id = target) AND item-default rows (variant_id IS NULL). Candidates
 * are grouped by field_key.
 *
 * Used by the review grid, publisher, and variant-detail views as the single
 * cross-finder query point anchored on variant_id.
 */

/**
 * @param {object} specDb — SpecDb instance (already category-scoped)
 * @param {{ productId: string, variantId: string }} opts
 * @returns {{ variant: object|null, candidates: Record<string, object[]>, hasDefaults: boolean }}
 */
export function getVariantDossier(specDb, { productId, variantId }) {
  const variant = specDb.variants.get(productId, variantId);
  if (!variant) {
    return { variant: null, candidates: {}, hasDefaults: false };
  }

  const all = specDb.getAllFieldCandidatesByProduct(productId);
  const matching = all.filter((row) => row.variant_id === variantId || row.variant_id === null);

  const candidates = {};
  let hasDefaults = false;
  for (const row of matching) {
    if (row.variant_id === null) hasDefaults = true;
    const fieldKey = row.field_key;
    if (!candidates[fieldKey]) candidates[fieldKey] = [];
    candidates[fieldKey].push(row);
  }

  for (const fieldKey of Object.keys(candidates)) {
    candidates[fieldKey].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  }

  return { variant, candidates, hasDefaults };
}
