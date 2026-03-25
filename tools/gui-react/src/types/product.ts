// WHY: Re-exports generated types from backend shape descriptors under stable names.
// Generated types are the SSOT — run codegen, not manual edits, to update shapes.
// Run: node tools/gui-react/scripts/generateProductTypes.js

import type {
  RenameHistoryEntryGen,
  BrandRenameHistoryEntryGen,
  CatalogProductGen,
  CatalogRowGen,
  BrandGen,
  ProductSummaryGen,
  QueueProductGen,
} from './product.generated.ts';

// ── Generated re-exports (stable names for consumers) ──

// WHY: Overrides migration_result from Record<string,unknown> to specific shape
// needed by ProductManager.tsx for .migrated_count rendering.
export interface RenameHistoryEntry extends Omit<RenameHistoryEntryGen, 'migration_result'> {
  migration_result: { migrated_count: number; failed_count: number };
}
export type BrandRenameHistoryEntry = BrandRenameHistoryEntryGen;
export interface CatalogProduct extends Omit<CatalogProductGen, 'rename_history'> {
  rename_history?: RenameHistoryEntry[];
}
export type CatalogRow = CatalogRowGen;
export type Brand = BrandGen;
export type QueueProduct = QueueProductGen;

// WHY: ProductSummary extends the generated base with a typed constraint_analysis
// and an index signature for forward-compatible field_reasoning payloads.
export interface ProductSummary extends ProductSummaryGen {
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

// ── Manual types (no backend shape descriptor) ──

export interface MigrationResult {
  ok: boolean;
  migrated_count: number;
  failed_count: number;
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
