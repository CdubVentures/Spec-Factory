import type { CatalogRow } from '../../../types/product.ts';

export interface StaleSelectionInput {
  singleProductId: string;
  selectedCatalogProduct: CatalogRow | null;
}

export interface StaleSelectionResult {
  isStale: boolean;
  lastKnownId: string;
}

export function deriveStaleSelection({
  singleProductId,
  selectedCatalogProduct,
}: StaleSelectionInput): StaleSelectionResult {
  const id = String(singleProductId || '').trim();
  const isStale = id.length > 0 && selectedCatalogProduct === null;
  return { isStale, lastKnownId: isStale ? id : '' };
}
