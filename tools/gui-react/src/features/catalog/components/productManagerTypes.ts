import type { CatalogProduct } from '../../../types/product.ts';

export interface MutationResult {
  ok: boolean;
  error?: string;
  productId?: string;
  product?: CatalogProduct;
  seeded?: number;
  skipped?: number;
  total?: number;
  fields_imported?: number;
}

export type BulkPreviewStatus = 'ready' | 'already_exists' | 'duplicate_in_paste' | 'invalid';

export interface BulkPreviewRow {
  rowNumber: number;
  raw: string;
  brand: string;
  model: string;
  variant: string;
  status: BulkPreviewStatus;
  reason: string;
  productId: string;
}

export interface BulkImportResultRow {
  index: number;
  brand: string;
  base_model: string;
  model: string;
  variant: string;
  productId?: string;
  status: 'created' | 'skipped_existing' | 'skipped_duplicate' | 'invalid' | 'failed';
  reason?: string;
}

export interface BulkImportResult {
  ok: boolean;
  error?: string;
  total?: number;
  created?: number;
  skipped_existing?: number;
  skipped_duplicate?: number;
  invalid?: number;
  failed?: number;
  total_catalog?: number;
  results?: BulkImportResultRow[];
  products?: CatalogProduct[];
}
