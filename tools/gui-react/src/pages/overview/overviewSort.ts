import type { CatalogRow } from '../../types/product.ts';
import type { OverviewSortKey } from './OverviewFilterBar.tsx';

/**
 * Cycle the sort key through the Live column's three states. Called by the
 * Live column header click. Pure helper so the rotation is testable.
 *   off (anything else) → 'live' → 'live-grouped' → 'default'
 */
export function cycleLiveSort(current: OverviewSortKey): OverviewSortKey {
  if (current === 'live') return 'live-grouped';
  if (current === 'live-grouped') return 'default';
  return 'live';
}

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
    case 'live-grouped': {
      // Cluster rows by joined module signature; rows with no live ops sink
      // to the bottom. Tie-break by signature alpha (stable group order),
      // then defaultCompare within the group.
      const sa = (runningByProduct.get(a.productId) ?? []).join(',');
      const sb = (runningByProduct.get(b.productId) ?? []).join(',');
      const aHas = sa.length > 0;
      const bHas = sb.length > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (sa !== sb) return sa.localeCompare(sb);
      return defaultCompare(a, b);
    }
    default: return defaultCompare(a, b);
  }
}
