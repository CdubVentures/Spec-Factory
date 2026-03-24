// WHY: Runtime response validators for catalog API endpoints.
// Catches shape mismatches (e.g., server returning error object instead of array)
// at the HTTP boundary instead of deep inside React components.

import type { CatalogRow, CatalogProduct } from '../../../types/product.ts';

export function parseCatalogRows(raw: unknown): CatalogRow[] {
  if (!Array.isArray(raw)) throw new TypeError('Expected array for catalog rows');
  return raw as CatalogRow[];
}

export function parseCatalogProducts(raw: unknown): CatalogProduct[] {
  if (!Array.isArray(raw)) throw new TypeError('Expected array for catalog products');
  return raw as CatalogProduct[];
}
