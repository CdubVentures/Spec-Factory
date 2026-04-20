/**
 * createScalarFinderStore — scalar finder JSON store factory.
 *
 * Thin wrapper over createFinderJsonStore that bakes in the recalculation
 * strategy used by every scalar field finder (release_date, sku, msrp, ...):
 *
 *   latestWinsPerVariant — for each variant_id (falling back to variant_key),
 *     the newest non-rejected run's candidate replaces any older one. Other
 *     variants are preserved.
 *
 * Returns the full store API (read/write/merge/deleteRun/deleteRuns/deleteAll/
 * recalculateFromRuns) so feature-level store files shrink to one call.
 */

import { createFinderJsonStore } from './finderJsonStore.js';

// WHY: Strategies live in a named map so future scalar finders can opt into a
// different accumulation rule (e.g. latestPerVariantPerMode for mode-scoped
// finders) by declaring the name in their registry entry, without patching the
// factory body.
const STRATEGIES = {
  latestWinsPerVariant: (runs) => {
    const latestByKey = new Map();
    const sorted = [...runs]
      .filter((r) => r.status !== 'rejected')
      .sort((a, b) => a.run_number - b.run_number);
    for (const run of sorted) {
      for (const cand of (run.selected?.candidates || [])) {
        const key = cand.variant_id || cand.variant_key || '';
        if (!key) continue;
        latestByKey.set(key, cand);
      }
    }
    return { candidates: [...latestByKey.values()] };
  },
};

export function createScalarFinderStore({ filePrefix, strategy = 'latestWinsPerVariant' } = {}) {
  if (!filePrefix) throw new Error('createScalarFinderStore: filePrefix required');
  const recalculateSelected = STRATEGIES[strategy];
  if (!recalculateSelected) {
    throw new Error(`createScalarFinderStore: unknown strategy '${strategy}'`);
  }

  return createFinderJsonStore({
    filePrefix,
    emptySelected: () => ({ candidates: [] }),
    recalculateSelected,
  });
}
