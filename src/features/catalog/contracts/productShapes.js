// WHY: O(1) Feature Scaling — SSOT for product API response shapes not
// covered by catalogShapes.js. Adding a field = add one entry here.
// Alignment test catches TS drift in types/product.ts.

export const PRODUCT_SUMMARY_SHAPE = Object.freeze([
  { key: 'productId', coerce: 'string' },
  { key: 'category', coerce: 'string' },
  { key: 'confidence', coerce: 'float' },
  { key: 'coverage_overall', coerce: 'float' },
  { key: 'fields_total', coerce: 'int' },
  { key: 'fields_filled', coerce: 'int' },
  { key: 'fields_below_pass_target', coerce: 'array' },
  { key: 'critical_fields_below_pass_target', coerce: 'array' },
  { key: 'missing_required_fields', coerce: 'array' },
  { key: 'generated_at', coerce: 'string' },
  { key: 'runId', coerce: 'string', optional: true },
  { key: 'field_reasoning', coerce: 'object', optional: true },
  { key: 'constraint_analysis', coerce: 'object', optional: true },
]);
export const PRODUCT_SUMMARY_KEYS = Object.freeze(PRODUCT_SUMMARY_SHAPE.map(s => s.key));

export const QUEUE_PRODUCT_SHAPE = Object.freeze([
  { key: 'productId', coerce: 'string' },
  { key: 'status', coerce: 'string' },
  { key: 'priority', coerce: 'int' },
  { key: 'attempts', coerce: 'int' },
  { key: 'updated_at', coerce: 'string' },
]);
export const QUEUE_PRODUCT_KEYS = Object.freeze(QUEUE_PRODUCT_SHAPE.map(s => s.key));

// WHY: Polymorphic response — different brand operations return different subsets.
// All keys optional except 'ok'. Alignment test verifies the superset.
export const BRAND_MUTATION_RESULT_KEYS = Object.freeze([
  'ok', 'error', 'slug', 'brand', 'seeded', 'skipped', 'total_brands',
  'categories_scanned', 'oldSlug', 'newSlug', 'identifier', 'oldName', 'newName',
  'cascaded_products', 'cascade_failures',
]);

export const BRAND_IMPACT_ANALYSIS_KEYS = Object.freeze([
  'ok', 'slug', 'identifier', 'canonical_name', 'categories',
  'products_by_category', 'product_details', 'total_products',
]);
