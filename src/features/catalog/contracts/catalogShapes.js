// WHY: O(1) Feature Scaling — single source of truth for catalog/brand response shapes.
// Shape descriptors carry type info ({key, coerce}) enabling contract alignment tests
// that verify frontend TS interfaces match backend shapes. Adding a product field =
// add it here + in the builder + update the TS interface. Alignment test catches drift.

// ── Catalog Product (raw CRUD shape from productCatalog.js) ──

export const CATALOG_PRODUCT_SHAPE = Object.freeze([
  { key: 'productId', coerce: 'string' },
  { key: 'id', coerce: 'int' },
  { key: 'identifier', coerce: 'string' },
  { key: 'brand', coerce: 'string' },
  { key: 'model', coerce: 'string' },
  { key: 'variant', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'seed_urls', coerce: 'array', itemType: 'string' },
  { key: 'added_at', coerce: 'string' },
  { key: 'added_by', coerce: 'string' },
  { key: 'updated_at', coerce: 'string', optional: true },
  { key: 'rename_history', coerce: 'array', optional: true },
]);
export const CATALOG_PRODUCT_KEYS = Object.freeze(CATALOG_PRODUCT_SHAPE.map(s => s.key));

// ── Catalog Row Enrichment (additional fields from buildCatalog in catalogHelpers.js) ──

export const CATALOG_ROW_ENRICHMENT_SHAPE = Object.freeze([
  { key: 'base_model', coerce: 'string' },
  { key: 'hasFinal', coerce: 'bool' },
  { key: 'validated', coerce: 'bool' },
  { key: 'confidence', coerce: 'float' },
  { key: 'coverage', coerce: 'float' },
  { key: 'fieldsFilled', coerce: 'int' },
  { key: 'fieldsTotal', coerce: 'int' },
  { key: 'lastRun', coerce: 'string' },
  { key: 'inActive', coerce: 'bool' },
]);
export const CATALOG_ROW_KEYS = Object.freeze([
  ...CATALOG_PRODUCT_KEYS,
  ...CATALOG_ROW_ENRICHMENT_SHAPE.map(s => s.key),
]);

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
  { key: 'rename_history', coerce: 'array', optional: true },
]);
export const BRAND_KEYS = Object.freeze(BRAND_SHAPE.map(s => s.key));
