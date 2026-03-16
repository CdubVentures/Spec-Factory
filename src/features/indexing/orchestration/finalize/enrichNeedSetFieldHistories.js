import { buildFieldHistories } from '../../../../indexlab/buildFieldHistories.js';

// WHY: The NeedSet fields carry per-field history from previousFieldHistories
// (rounds 0..N-1), but the CURRENT round's provenance and queries are not yet
// merged. This helper runs buildFieldHistories one final time with the current
// round's artifacts so the needset_computed event (and needset.json) reflects
// the complete accumulated history including the current round.
export function enrichNeedSetFieldHistories({
  fields,
  provenance = {},
  searchPlanQueries = [],
  duplicatesSuppressed = 0,
} = {}) {
  if (!Array.isArray(fields)) return [];

  // Build previousFieldHistories from the existing field history objects
  const previousFieldHistories = {};
  for (const f of fields) {
    if (f.field_key && f.history) {
      previousFieldHistories[f.field_key] = f.history;
    }
  }

  // Run buildFieldHistories with current round's data to produce merged histories
  const enrichedHistories = buildFieldHistories({
    previousFieldHistories,
    provenance,
    searchPlanQueries,
    duplicatesSuppressed,
  });

  // Return new array with enriched history (do not mutate originals)
  return fields.map((f) => {
    const history = enrichedHistories[f.field_key];
    if (!history) return f;
    return { ...f, history };
  });
}
