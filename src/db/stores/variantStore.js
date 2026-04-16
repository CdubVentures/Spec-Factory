/**
 * Variant SQL store.
 *
 * First-class entity table for CEF-discovered color/edition variants.
 * Each variant gets a stable hash (v_<8hex>) assigned once, never changes.
 * Variants are the SSOT join point for PIF images, release data, SKUs, pricing.
 *
 * Rebuildable from color_edition.json variant_registry arrays.
 */

function safeParse(str, fallback) {
  try { return JSON.parse(str); }
  catch { return fallback; }
}

function hydrateRow(row) {
  if (!row) return null;
  return {
    ...row,
    color_atoms: safeParse(row.color_atoms, []),
  };
}

/**
 * @param {{ db: import('better-sqlite3').Database, category: string, stmts: object }} deps
 */
export function createVariantStore({ db, category, stmts }) {

  function upsert({ productId, variantId, variantKey, variantType, variantLabel, colorAtoms, editionSlug, editionDisplayName, createdAt, updatedAt }) {
    stmts._upsertVariant.run({
      category,
      product_id: String(productId || ''),
      variant_id: String(variantId || ''),
      variant_key: String(variantKey || ''),
      variant_type: String(variantType || 'color'),
      variant_label: String(variantLabel || ''),
      color_atoms: JSON.stringify(colorAtoms || []),
      edition_slug: editionSlug ?? null,
      edition_display_name: editionDisplayName ?? null,
      created_at: createdAt || new Date().toISOString(),
      updated_at: updatedAt || null,
    });
  }

  function get(productId, variantId) {
    return hydrateRow(
      stmts._getVariant.get(category, String(productId || ''), String(variantId || ''))
    );
  }

  function listByProduct(productId) {
    return stmts._listVariantsByProduct.all(category, String(productId || '')).map(hydrateRow);
  }

  function listActive(productId) {
    return stmts._listActiveVariantsByProduct.all(category, String(productId || '')).map(hydrateRow);
  }

  function remove(productId, variantId) {
    stmts._deleteVariant.run(category, String(productId || ''), String(variantId || ''));
  }

  function removeByProduct(productId) {
    stmts._deleteVariantsByProduct.run(category, String(productId || ''));
  }

  /**
   * Bulk-upsert from a variant_registry array (CEF JSON format).
   * WHY: Single entry point for both dual-write and reseed paths.
   * Maps registry entry field names to store column names.
   */
  function syncFromRegistry(productId, registryArray, { onAfterSync } = {}) {
    if (!Array.isArray(registryArray) || registryArray.length === 0) return;

    // WHY: Full sync — remove stale variants not in the incoming registry.
    // Without this, variants from rejected runs or removed discoveries
    // persist in the table and leak into published state via derivePublishedFromVariants.
    const incomingIds = new Set(registryArray.map(e => e.variant_id));
    const existing = listByProduct(productId);
    for (const row of existing) {
      if (!incomingIds.has(row.variant_id)) {
        remove(productId, row.variant_id);
      }
    }

    for (const entry of registryArray) {
      upsert({
        productId,
        variantId: entry.variant_id,
        variantKey: entry.variant_key,
        variantType: entry.variant_type,
        variantLabel: entry.variant_label,
        colorAtoms: entry.color_atoms,
        editionSlug: entry.edition_slug,
        editionDisplayName: entry.edition_display_name,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      });
    }

    onAfterSync?.({ productId });
  }

  return { upsert, get, listByProduct, listActive, remove, removeByProduct, syncFromRegistry };
}
