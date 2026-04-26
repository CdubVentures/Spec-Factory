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
 * Chip-preset comparator. Live sort is owned by TanStack (custom sortingFn
 * on the Live column) so shift-click composes Live with other columns.
 */
export function compareBySort(
  a: CatalogRow,
  b: CatalogRow,
  sortBy: OverviewSortKey,
): number {
  switch (sortBy) {
    case 'confidence': return (b.confidence - a.confidence) || defaultCompare(a, b);
    case 'coverage':   return (b.coverage - a.coverage) || defaultCompare(a, b);
    case 'fields':     return (b.fieldsFilled - a.fieldsFilled) || defaultCompare(a, b);
    default: return defaultCompare(a, b);
  }
}
