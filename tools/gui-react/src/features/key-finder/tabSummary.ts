import type { FinderTabSummary } from '../../shared/ui/finder/tabSummary.ts';
import { useIsModuleRunning } from '../operations/hooks/useFinderOperations.ts';
import { useKeyFinderSummaryQuery } from './api/keyFinderQueries.ts';

/**
 * Key Finder — tab summary hook.
 *
 * Shows "resolved / eligible" in the Indexing Lab tab bar, plus a running
 * indicator when any per-key run is in flight on this product.
 */
export function useKeyFinderTabSummary(productId: string, category: string): FinderTabSummary {
  const { data: summary } = useKeyFinderSummaryQuery(category, productId);
  const isRunning = useIsModuleRunning('kf', productId);

  if (isRunning) {
    return { kpi: 'Running', status: 'running' };
  }
  if (!summary || summary.length === 0) {
    return { kpi: '0 / 0', status: 'idle' };
  }
  const resolved = summary.filter((r) => r.published || r.last_status === 'resolved').length;
  const total = summary.filter((r) => !r.variant_dependent).length;
  return { kpi: `${resolved} / ${total}`, status: 'idle' };
}
