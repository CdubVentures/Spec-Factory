// WHY: O(1) Feature Scaling — single source of truth for catalog/brand response shapes.
// Shape descriptors carry type info ({key, coerce}) enabling contract alignment tests
// that verify frontend TS interfaces match backend shapes. Adding a product field =
// add it here + in the builder + update the TS interface. Alignment test catches drift.

// ── Sub-types (item shapes for array fields) ──


export const BRAND_RENAME_HISTORY_ENTRY_SHAPE = Object.freeze([
  { key: 'previous_slug', coerce: 'string' },
  { key: 'previous_name', coerce: 'string' },
  { key: 'renamed_at', coerce: 'string' },
]);

export const PIF_VARIANT_PROGRESS_SHAPE = Object.freeze([
  { key: 'variant_id', coerce: 'string' },
  { key: 'variant_key', coerce: 'string' },
  { key: 'variant_label', coerce: 'string' },
  { key: 'color_atoms', coerce: 'array', itemType: 'string' },
  { key: 'priority_filled', coerce: 'int' },
  { key: 'priority_total', coerce: 'int' },
  { key: 'loop_filled', coerce: 'int' },
  { key: 'loop_total', coerce: 'int' },
  { key: 'hero_filled', coerce: 'int' },
  { key: 'hero_target', coerce: 'int' },
  { key: 'image_count', coerce: 'int' },
]);

// Per-variant scalar-finder snapshot: SKU finder + RDF use the same shape
// (one value + one confidence per variant). Drives the confidence-diamond
// Overview cells. Empty string value + 0 confidence = "no candidate yet".
export const SCALAR_VARIANT_PROGRESS_SHAPE = Object.freeze([
  { key: 'variant_id', coerce: 'string' },
  { key: 'variant_key', coerce: 'string' },
  { key: 'variant_label', coerce: 'string' },
  { key: 'color_atoms', coerce: 'array', itemType: 'string' },
  { key: 'value', coerce: 'string' },
  { key: 'confidence', coerce: 'float' },
]);

// KeyFinder per-tier rollup — one row per tier (easy/medium/hard/very_hard/
// mandatory), where mandatory is an overlapping bucket counting any key with
// required_level='mandatory'. Drives the 5-cluster dual-ring Keys cell:
// outer ring = resolved / total · inner ring = perfect / total.
export const KEY_TIER_PROGRESS_SHAPE = Object.freeze([
  { key: 'tier', coerce: 'string' },
  { key: 'total', coerce: 'int' },
  { key: 'resolved', coerce: 'int' },
  { key: 'perfect', coerce: 'int' },
]);

// ── Catalog Product (raw CRUD shape from productCatalog.js) ──

export const CATALOG_PRODUCT_SHAPE = Object.freeze([
  { key: 'productId', coerce: 'string' },
  { key: 'id', coerce: 'int' },
  { key: 'identifier', coerce: 'string' },
  { key: 'brand', coerce: 'string' },
  { key: 'brand_identifier', coerce: 'string', optional: true },
  { key: 'model', coerce: 'string' },
  { key: 'base_model', coerce: 'string' },
  { key: 'variant', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'added_at', coerce: 'string' },
  { key: 'added_by', coerce: 'string' },
  { key: 'updated_at', coerce: 'string', optional: true },
]);
export const CATALOG_PRODUCT_KEYS = Object.freeze(CATALOG_PRODUCT_SHAPE.map(s => s.key));

// ── Catalog Row (enriched summary from buildCatalog in catalogHelpers.js) ──
// WHY: buildCatalog returns a DIFFERENT shape than the CRUD endpoint.
// It shares identity fields with CatalogProduct but drops added_at/added_by
// and adds per-product resolved-key summary (confidence, coverage, fields).

export const CATALOG_ROW_SHAPE = Object.freeze([
  { key: 'productId', coerce: 'string' },
  { key: 'id', coerce: 'int' },
  { key: 'identifier', coerce: 'string' },
  { key: 'brand', coerce: 'string' },
  { key: 'brand_identifier', coerce: 'string', optional: true },
  { key: 'model', coerce: 'string' },
  { key: 'base_model', coerce: 'string' },
  { key: 'variant', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'confidence', coerce: 'float' },
  { key: 'coverage', coerce: 'float' },
  { key: 'fieldsFilled', coerce: 'int' },
  { key: 'fieldsTotal', coerce: 'int' },
  { key: 'cefRunCount', coerce: 'int' },
  { key: 'pifVariants', coerce: 'array', itemRef: 'PifVariantProgressGen' },
  { key: 'skuVariants', coerce: 'array', itemRef: 'ScalarVariantProgressGen' },
  { key: 'rdfVariants', coerce: 'array', itemRef: 'ScalarVariantProgressGen' },
  { key: 'keyTierProgress', coerce: 'array', itemRef: 'KeyTierProgressGen' },
]);
export const CATALOG_ROW_KEYS = Object.freeze(CATALOG_ROW_SHAPE.map(s => s.key));

// ── Brand (from brandRegistry.js) ──

export const BRAND_SHAPE = Object.freeze([
  { key: 'slug', coerce: 'string' },
  { key: 'canonical_name', coerce: 'string' },
  { key: 'identifier', coerce: 'string' },
  { key: 'aliases', coerce: 'array', itemType: 'string' },
  { key: 'categories', coerce: 'array', itemType: 'string' },
  { key: 'website', coerce: 'string' },
  { key: 'added_at', coerce: 'string' },
  { key: 'added_by', coerce: 'string' },
  { key: 'updated_at', coerce: 'string', optional: true },
  { key: 'rename_history', coerce: 'array', optional: true, itemRef: 'BrandRenameHistoryEntryGen' },
]);
export const BRAND_KEYS = Object.freeze(BRAND_SHAPE.map(s => s.key));
