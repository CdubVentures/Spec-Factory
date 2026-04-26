import type { CatalogRow } from '../../types/product.ts';

export function estimatePifEvalOperationCount(products: readonly CatalogRow[]): number {
  return products.reduce((count, row) => count + row.pifVariants.length, 0);
}
