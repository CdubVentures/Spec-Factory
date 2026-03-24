export interface RenameHistoryEntry {
  previous_slug: string;
  previous_model: string;
  previous_variant: string;
  renamed_at: string;
  migration_result: { migrated_count: number; failed_count: number };
}

export interface MigrationResult {
  ok: boolean;
  migrated_count: number;
  failed_count: number;
}

// WHY: Raw CRUD product from /api/v1/catalog/{cat}/products (productCatalog.js).
// Contract: CATALOG_PRODUCT_SHAPE in src/features/catalog/contracts/catalogShapes.js.
export interface CatalogProduct {
  productId: string;
  id: number;
  identifier: string;
  brand: string;
  model: string;
  variant: string;
  status: string;
  seed_urls: string[];
  added_at: string;
  added_by: string;
  updated_at?: string;
  rename_history?: RenameHistoryEntry[];
}

// WHY: Enriched summary from /api/v1/catalog/{cat} (buildCatalog in catalogHelpers.js).
// This is a DIFFERENT shape than CatalogProduct — shares identity fields but drops
// seed_urls/added_at/added_by and adds pipeline summary fields.
// Contract: CATALOG_ROW_SHAPE in src/features/catalog/contracts/catalogShapes.js.
export interface CatalogRow {
  productId: string;
  id: number;
  identifier: string;
  brand: string;
  model: string;
  base_model: string;
  variant: string;
  status: string;
  hasFinal: boolean;
  validated: boolean;
  confidence: number;
  coverage: number;
  fieldsFilled: number;
  fieldsTotal: number;
  lastRun: string;
  inActive: boolean;
}

export interface ProductSummary {
  productId: string;
  category: string;
  confidence: number;
  coverage_overall: number;
  fields_total: number;
  fields_filled: number;
  fields_below_pass_target: string[];
  critical_fields_below_pass_target: string[];
  missing_required_fields: string[];
  generated_at: string;
  runId?: string;
  field_reasoning?: Record<string, unknown>;
  constraint_analysis?: {
    contradictions: Array<{
      code: string;
      severity: string;
      message: string;
      fields: string[];
    }>;
  };
  [key: string]: unknown;
}

export interface NormalizedProduct {
  identity: {
    brand: string;
    model: string;
    variant?: string;
  };
  fields: Record<string, unknown>;
}

export interface TrafficLight {
  color: 'green' | 'yellow' | 'red' | 'gray';
  field: string;
}

export interface QueueProduct {
  productId: string;
  status: string;
  priority: number;
  attempts: number;
  updated_at: string;
}

// ── Brand Types ─────────────────────────────────────────────────────

export interface BrandRenameHistoryEntry {
  previous_slug: string;
  previous_name: string;
  renamed_at: string;
}

// WHY: Shared Brand type from brandRegistry.js.
// Contract: BRAND_SHAPE in src/features/catalog/contracts/catalogShapes.js.
export interface Brand {
  slug: string;
  canonical_name: string;
  identifier: string;
  aliases: string[];
  categories: string[];
  website: string;
  added_at: string;
  added_by: string;
  updated_at?: string;
  rename_history?: BrandRenameHistoryEntry[];
}

export interface BrandMutationResult {
  ok: boolean;
  error?: string;
  slug?: string;
  brand?: Brand;
  seeded?: number;
  skipped?: number;
  total_brands?: number;
  categories_scanned?: number;
  oldSlug?: string;
  newSlug?: string;
  identifier?: string;
  oldName?: string;
  newName?: string;
  cascaded_products?: number;
  cascade_failures?: number;
}

export interface BrandImpactAnalysis {
  ok: boolean;
  slug: string;
  identifier: string;
  canonical_name: string;
  categories: string[];
  products_by_category: Record<string, number>;
  product_details: Record<string, string[]>;
  total_products: number;
}
