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

  const base = createFinderJsonStore({
    filePrefix,
    emptySelected: () => ({ candidates: [] }),
    recalculateSelected,
  });

  /**
   * Remove every `selected.candidates[]` entry whose variant_id (or
   * variant_key fallback) matches. Used by the per-variant UnPub / Del
   * actions in the RDF / SKU panels so the finder-owned JSON copy stays in
   * sync with field_candidates + product.json.
   *
   * Runs themselves are UNTOUCHED — each run's `selected.candidates` for
   * this variant stays put, so re-deriving via recalculateFromRuns would
   * resurrect the value. That's intentional for the UnPub case: we want the
   * top-level selected wiped but historical run records preserved. For the
   * Del case the caller is expected to also scrub runs (future follow-up).
   *
   * Returns the new candidates array so callers can push it into the SQL
   * summary's `candidates` column in one round-trip.
   */
  function clearVariantCandidate({ productId, productRoot, variantId }) {
    const doc = base.read({ productId, productRoot });
    if (!doc) return { changed: false, candidates: [] };
    const match = String(variantId || '');
    if (!match) return { changed: false, candidates: doc.selected?.candidates || [] };
    const before = doc.selected?.candidates || [];
    const after = before.filter((c) => String(c.variant_id || c.variant_key || '') !== match);
    if (after.length === before.length) return { changed: false, candidates: before };
    doc.selected = { ...(doc.selected || {}), candidates: after };
    base.write({ productId, productRoot, data: doc });
    return { changed: true, candidates: after };
  }

  return { ...base, clearVariantCandidate };
}
