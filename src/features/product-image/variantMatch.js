/**
 * Variant matching predicate — centralized filter for PIF data.
 *
 * WHY: variant_id is the stable join key (never changes). variant_key is
 * mutable (renames on CEF identity check). Match by variant_id when both
 * sides have it; fall back to variant_key for legacy data.
 */

/**
 * @param {object|null|undefined} img — image/eval record with variant_id? and variant_key
 * @param {{ variantId?: string|null, variantKey?: string }} selector
 * @returns {boolean}
 */
export function matchVariant(img, { variantId, variantKey } = {}) {
  if (!img) return false;

  const imgId = img.variant_id || '';
  const selId = variantId || '';

  // WHY: When both sides have variant_id, it wins — even if variant_key drifted.
  if (imgId && selId) return imgId === selId;

  // Fall back to variant_key matching
  const imgKey = img.variant_key || '';
  const selKey = variantKey || '';
  if (!imgKey || !selKey) return false;

  return imgKey === selKey;
}
