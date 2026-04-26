import type { CatalogRow } from '../../types/product.ts';
import type { OverviewSortKey } from './OverviewFilterBar.tsx';

export function defaultCompare(a: CatalogRow, b: CatalogRow): number {
  return (
    a.brand.localeCompare(b.brand) ||
    a.base_model.localeCompare(b.base_model) ||
    a.variant.localeCompare(b.variant)
  );
}

/**
 * Catalog-row comparator. The `'live'` branch sorts rows with more currently-
 * running modules first, breaking ties via defaultCompare. All other keys are
 * static row-derived.
 */
export function compareBySort(
  a: CatalogRow,
  b: CatalogRow,
  sortBy: OverviewSortKey,
  runningByProduct: ReadonlyMap<string, readonly string[]>,
): number {
  switch (sortBy) {
    case 'confidence': return (b.confidence - a.confidence) || defaultCompare(a, b);
    case 'coverage':   return (b.coverage - a.coverage) || defaultCompare(a, b);
    case 'fields':     return (b.fieldsFilled - a.fieldsFilled) || defaultCompare(a, b);
    case 'live': {
      const ca = runningByProduct.get(a.productId)?.length ?? 0;
      const cb = runningByProduct.get(b.productId)?.length ?? 0;
      return (cb - ca) || defaultCompare(a, b);
    }
    default: return defaultCompare(a, b);
  }
}
