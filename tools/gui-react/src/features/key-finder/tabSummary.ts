import type { FinderTabSummary } from '../../shared/ui/finder/tabSummary.ts';

/**
 * Key Finder — tab summary hook (Phase 2 stub).
 *
 * Phase 4 replaces this with real per-key progress derived from
 * the keyFinder queries. For now it returns an idle summary so
 * FinderTabBar renders without errors.
 */
export function useKeyFinderTabSummary(/* productId: string, category: string */): FinderTabSummary {
  return { kpi: 'Phase 3', status: 'idle' };
}
