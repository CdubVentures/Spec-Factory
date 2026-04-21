// WHY: Finalization step for tier-3 enrichment progression. Reads this-run's
// provenance + queries, merges with prior histories via buildFieldHistories(),
// persists as a run_artifact so the next run's roundContext can pick it up
// and Tier 3 rows climb the 3a → 3b → 3c → 3d ladder.

import { buildFieldHistories } from './buildFieldHistories.js';

function extractSearchPlanQueries(runSummary) {
  const events = Array.isArray(runSummary?.telemetry?.events) ? runSummary.telemetry.events : [];
  const out = [];
  for (const e of events) {
    if (e?.event !== 'search_plan_generated') continue;
    // WHY: enhancement_rows is the structured source ({query, target_fields, tier, ...}).
    // queries_generated is just strings (UI-friendly display list). Prefer enhancement_rows
    // so buildFieldHistories can credit queries back to their target field_keys.
    const enhancementRows = Array.isArray(e.payload?.enhancement_rows) ? e.payload.enhancement_rows : [];
    if (enhancementRows.length > 0) {
      for (const q of enhancementRows) {
        out.push({
          query: String(q?.query || '').trim(),
          target_fields: Array.isArray(q?.target_fields) ? q.target_fields : [],
        });
      }
      continue;
    }
    // Fallback: queries_generated may be strings (no target_fields available) or
    // objects (older shape). Handle both, but target_fields will be empty for strings.
    const generated = Array.isArray(e.payload?.queries_generated) ? e.payload.queries_generated : [];
    for (const q of generated) {
      if (typeof q === 'string') {
        out.push({ query: q.trim(), target_fields: [] });
      } else if (q && typeof q === 'object') {
        out.push({
          query: String(q.query || '').trim(),
          target_fields: Array.isArray(q.target_fields) ? q.target_fields : [],
        });
      }
    }
  }
  return out;
}

/**
 * Compute next-run field_histories and persist as a run_artifact.
 *
 * @param {object} params
 * @param {object|null} params.specDb - SpecDb instance (null-safe)
 * @param {string} params.runId
 * @param {string} params.productId - unused for compute, used to pair with logs
 * @param {string} params.category
 * @param {object} params.fieldProvenance - { [fieldKey]: { evidence: [...] } } from bridge
 * @param {object} params.priorFieldHistories - from loadPriorFieldHistories
 * @param {object} params.runSummary - serialized run summary (telemetry.events[])
 * @param {number} [params.duplicatesSuppressed=0]
 * @returns {object} the merged field_histories map (also written to run_artifacts)
 */
export function finalizeFieldHistories({
  specDb,
  runId,
  productId: _productId,
  category,
  fieldProvenance = {},
  priorFieldHistories = {},
  runSummary,
  duplicatesSuppressed = 0,
}) {
  if (!specDb) return {};

  const searchPlanQueries = extractSearchPlanQueries(runSummary);
  const histories = buildFieldHistories({
    previousFieldHistories: priorFieldHistories,
    provenance: fieldProvenance,
    searchPlanQueries,
    duplicatesSuppressed,
  });

  try {
    specDb.upsertRunArtifact({
      run_id: String(runId || ''),
      artifact_type: 'field_histories',
      category: String(category || ''),
      payload: histories,
    });
  } catch { /* best-effort — artifact write must not crash the pipeline */ }

  return histories;
}
