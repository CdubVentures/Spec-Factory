import { useColorEditionFinderQuery } from './api/colorEditionFinderQueries.ts';
import type { ColorEditionFinderResult } from './types.ts';
import type { FinderTabSummary } from '../../shared/ui/finder/tabSummary.ts';

/**
 * Pure derivation of CEF's tab summary. Tested under `node --test` via the
 * __tests__ folder. Hook wrapper below consumes the same useQuery cache
 * as the panel so no extra network round-trip occurs.
 */
export function deriveCefTabSummary(data: ColorEditionFinderResult | null): FinderTabSummary {
  const colors = data?.published?.colors?.length ?? 0;
  const editions = data?.published?.editions?.length ?? 0;
  if (colors === 0 && editions === 0) {
    return { kpi: '— · —', status: 'idle' };
  }
  return {
    kpi: `${colors}c · ${editions}ed`,
    status: 'complete',
  };
}

export function useCefTabSummary(productId: string, category: string): FinderTabSummary {
  const { data } = useColorEditionFinderQuery(category, productId);
  return deriveCefTabSummary(data ?? null);
}
