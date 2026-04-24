/**
 * PIF variant progress SQL store.
 *
 * Materialized per-variant carousel progress for the Overview catalog panel.
 * Written incrementally by PIF run/loop/delete handlers; rebuildable from
 * per-product product_images.json via rebuildPifVariantProgressFromJson.
 *
 * Shape matches the `pif_variant_progress` table (see specDbSchema.js).
 */

/**
 * @param {{ category: string, stmts: object }} deps
 */
export function createPifVariantProgressStore({ category, stmts }) {

  function upsert({ productId, variantId, variantKey, priorityFilled, priorityTotal, loopFilled, loopTotal, heroFilled, heroTarget }) {
    stmts._upsertPifVariantProgress.run({
      category,
      product_id: String(productId || ''),
      variant_id: String(variantId || ''),
      variant_key: String(variantKey || ''),
      priority_filled: Number(priorityFilled) || 0,
      priority_total: Number(priorityTotal) || 0,
      loop_filled: Number(loopFilled) || 0,
      loop_total: Number(loopTotal) || 0,
      hero_filled: Number(heroFilled) || 0,
      hero_target: Number(heroTarget) || 0,
    });
  }

  function listByProduct(productId) {
    return stmts._listPifVariantProgressByProduct.all(category, String(productId || ''));
  }

  function removeByProduct(productId) {
    stmts._deletePifVariantProgressByProduct.run(category, String(productId || ''));
  }

  function removeByVariant(productId, variantId) {
    stmts._deletePifVariantProgressByVariant.run(
      category,
      String(productId || ''),
      String(variantId || ''),
    );
  }

  return { upsert, listByProduct, removeByProduct, removeByVariant };
}
