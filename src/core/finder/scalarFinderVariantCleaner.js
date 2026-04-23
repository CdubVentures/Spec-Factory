/**
 * scalarFinderVariantCleaner — dispatches per-variant JSON + SQL cleanup for
 * scalar finders (RDF, SKU, future: msrp, pricing, upc, ...).
 *
 * Why this exists:
 *   `clearPublishedField` + `delete-variant-field` route handlers touch the
 *   shared layers — `field_candidates` table and `product.json.variant_fields`
 *   — which are enough for the Review Grid. But scalar finders also persist
 *   per-variant entries in their OWN JSON store (`release_date.json`,
 *   `sku.json`) and a `candidates` column in their SQL summary table. Those
 *   are what the RDF / SKU panels render. If we don't also clean them, the
 *   finder panel shows stale data after the user clicks UnPub / Del.
 *
 * Dispatch key: the field_key (e.g. 'release_date', 'sku'). Each scalar
 * finder's feature file registers its store via `registerScalarFinderCleaner`
 * in this module — keeps the cleaner decoupled from review routes while
 * avoiding feature → review circular imports.
 */

import { releaseDateFinderStore } from '../../features/release-date/releaseDateStore.js';
import { skuFinderStore } from '../../features/sku/skuStore.js';

// Static registry — every scalar finder that owns a variant_id-scoped
// candidate in its selected.candidates[] is listed here. Keyed by field_key
// so the review route can look up without knowing finder-specific names.
// finderId matches specDb.getFinderStore(id) for the SQL summary upsert.
const SCALAR_FINDER_CLEANERS = {
  release_date: {
    finderId: 'releaseDateFinder',
    store: releaseDateFinderStore,
  },
  sku: {
    finderId: 'skuFinder',
    store: skuFinderStore,
  },
};

/**
 * Returns true when a scalar finder owns the given field_key. Used by the
 * review routes to decide whether to invoke the cleaner.
 */
export function isScalarFinderField(fieldKey) {
  return Boolean(SCALAR_FINDER_CLEANERS[String(fieldKey || '')]);
}

/**
 * Clear one variant's entry from the scalar finder's JSON store AND mirror
 * the change into the SQL summary table's `candidates` column.
 *
 * No-op and returns `{ cleaned: false }` when:
 *   - fieldKey isn't a scalar finder field (not in the registry)
 *   - variantId is empty
 *   - the JSON doc didn't exist or the variant wasn't selected
 *
 * @param {object} opts
 * @param {object} opts.specDb — SpecDb instance; used to upsert the SQL summary
 * @param {string} opts.productId
 * @param {string} opts.productRoot — product root dir (tests override; prod uses default)
 * @param {string} opts.fieldKey — e.g. 'release_date' or 'sku'
 * @param {string} opts.variantId
 * @returns {{ cleaned: boolean, finderId?: string, candidates_after?: number }}
 */
export function clearScalarFinderVariant({ specDb, productId, productRoot, fieldKey, variantId }) {
  const entry = SCALAR_FINDER_CLEANERS[String(fieldKey || '')];
  if (!entry) return { cleaned: false };
  if (!productId || !variantId) return { cleaned: false };

  const { changed, candidates } = entry.store.clearVariantCandidate({ productId, productRoot, variantId });
  if (!changed) return { cleaned: false, finderId: entry.finderId };

  // SQL summary mirror: reset the candidates column to the new list so the
  // panel's /finder-prefix/:cat/:pid GET reflects the JSON immediately.
  const sqlStore = specDb?.getFinderStore?.(entry.finderId);
  if (sqlStore) {
    const summary = sqlStore.get?.(productId) || {};
    sqlStore.upsert({
      category: specDb.category,
      product_id: productId,
      candidates,
      candidate_count: candidates.length,
      cooldown_until: summary.cooldown_until || '',
      latest_ran_at: summary.latest_ran_at || '',
      run_count: summary.run_count || 0,
    });
  }

  return { cleaned: true, finderId: entry.finderId, candidates_after: candidates.length };
}

/**
 * Delete every run tied to a variant in the scalar finder's JSON + SQL, so
 * the Discovery History counts for that variant go to zero after a per-
 * variant "Del". Scalar finders produce one-variant-per-run (via
 * `variantScalarFieldProducer`), so `response.variant_id` on each run is the
 * primary attribution key the history drawer groups by. If we leave those
 * runs in place, `(Nqu)(Nurl)` sticks around forever.
 *
 * Unlike `clearScalarFinderVariant` (which only touches selected.candidates),
 * this removes the runs from JSON, cascades the SQL runs table via
 * `specDb.deleteFinderRun`, and re-upserts the SQL summary so `candidates`,
 * `run_count`, and `latest_ran_at` all reflect the new state. Safe no-op for
 * non-scalar-finder fields.
 */
export function deleteScalarFinderVariantRuns({ specDb, productId, productRoot, fieldKey, variantId }) {
  const entry = SCALAR_FINDER_CLEANERS[String(fieldKey || '')];
  if (!entry) return { cleaned: false, deletedRuns: [] };
  if (!productId || !variantId) return { cleaned: false, deletedRuns: [] };

  const doc = entry.store.read({ productId, productRoot });
  if (!doc) return { cleaned: false, finderId: entry.finderId, deletedRuns: [] };

  const target = String(variantId);
  const matchingRuns = (doc.runs || []).filter(
    (r) => String(r?.response?.variant_id || '') === target,
  );
  if (matchingRuns.length === 0) {
    return { cleaned: false, finderId: entry.finderId, deletedRuns: [] };
  }

  // Delete from JSON one at a time. finderJsonStore.deleteRun calls
  // recalculateFromRuns internally so selected.candidates drops the matching
  // variant automatically — no extra filtering needed.
  const deletedRuns = [];
  for (const run of matchingRuns) {
    entry.store.deleteRun({ productId, productRoot, runNumber: run.run_number });
    deletedRuns.push(run.run_number);
  }

  // SQL cascade: delete the matching runs rows + re-upsert the summary with
  // the post-delete doc's candidates / run_count / latest_ran_at so the
  // panel's GET reflects the wipe immediately. finderSqlStore exposes
  // `removeRun(pid, runNumber)` — specDb's getFinderStore returns the store
  // directly, so we call removeRun on it (there is no generic
  // specDb.deleteFinderRun wrapper).
  const updated = entry.store.read({ productId, productRoot });
  const candidates = updated?.selected?.candidates || [];
  const sqlStore = specDb?.getFinderStore?.(entry.finderId);
  if (sqlStore) {
    if (typeof sqlStore.removeRun === 'function') {
      for (const rn of deletedRuns) {
        sqlStore.removeRun(productId, rn);
      }
    }
    const summary = sqlStore.get?.(productId) || {};
    sqlStore.upsert({
      category: specDb.category,
      product_id: productId,
      candidates,
      candidate_count: candidates.length,
      cooldown_until: updated?.cooldown_until || summary.cooldown_until || '',
      latest_ran_at: updated?.last_ran_at || '',
      run_count: updated?.run_count ?? (Array.isArray(updated?.runs) ? updated.runs.length : 0),
    });
  }

  return { cleaned: true, finderId: entry.finderId, deletedRuns, candidates_after: candidates.length };
}

/**
 * Delete a single scalar-finder run by run_number — used when Gate 1 detects
 * an inconsistent LLM submission and needs to scrub that run's history so a
 * re-run starts clean (discovery_log.urls_checked / queries_run go away with
 * the run). RDF/SKU produce one field-per-run, so any matching candidate is
 * the "primary" producer of that run; the whole run is fair game.
 *
 * Mirrors deleteScalarFinderVariantRuns's JSON+SQL+summary dance, but scoped
 * to a single run by number, not by variant_id.
 *
 * @param {{ specDb: object, productId: string, productRoot: string, fieldKey: string, runNumber: number }} opts
 * @returns {{ cleaned: boolean, finderId?: string, deletedRuns: number[] }}
 */
export function deleteScalarFinderRunByNumber({ specDb, productId, productRoot, fieldKey, runNumber }) {
  const entry = SCALAR_FINDER_CLEANERS[String(fieldKey || '')];
  if (!entry) return { cleaned: false, deletedRuns: [] };
  if (!productId || !Number.isInteger(runNumber) || runNumber < 0) {
    return { cleaned: false, finderId: entry.finderId, deletedRuns: [] };
  }

  const doc = entry.store.read({ productId, productRoot });
  if (!doc) return { cleaned: false, finderId: entry.finderId, deletedRuns: [] };

  const hasRun = (doc.runs || []).some((r) => r?.run_number === runNumber);
  if (!hasRun) return { cleaned: false, finderId: entry.finderId, deletedRuns: [] };

  entry.store.deleteRun({ productId, productRoot, runNumber });

  const updated = entry.store.read({ productId, productRoot });
  const candidates = updated?.selected?.candidates || [];
  const sqlStore = specDb?.getFinderStore?.(entry.finderId);
  if (sqlStore) {
    if (typeof sqlStore.removeRun === 'function') {
      sqlStore.removeRun(productId, runNumber);
    }
    const summary = sqlStore.get?.(productId) || {};
    sqlStore.upsert({
      category: specDb.category,
      product_id: productId,
      candidates,
      candidate_count: candidates.length,
      cooldown_until: updated?.cooldown_until || summary.cooldown_until || '',
      latest_ran_at: updated?.last_ran_at || '',
      run_count: updated?.run_count ?? (Array.isArray(updated?.runs) ? updated.runs.length : 0),
    });
  }

  return { cleaned: true, finderId: entry.finderId, deletedRuns: [runNumber] };
}
