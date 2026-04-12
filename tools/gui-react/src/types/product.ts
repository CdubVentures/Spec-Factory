// WHY: Re-exports generated types from backend shape descriptors under stable names.
// Generated types are the SSOT — run codegen, not manual edits, to update shapes.
// Run: node tools/gui-react/scripts/generateProductTypes.js

import type {
  BrandRenameHistoryEntryGen,
  CatalogProductGen,
  CatalogRowGen,
  BrandGen,
  QueueProductGen,
} from './product.generated.ts';

// ── Generated re-exports (stable names for consumers) ──

export type BrandRenameHistoryEntry = BrandRenameHistoryEntryGen;
export type CatalogProduct = CatalogProductGen;
export type CatalogRow = CatalogRowGen;
export type Brand = BrandGen;
export type QueueProduct = QueueProductGen;

// ── Manual types (no backend shape descriptor) ──

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
