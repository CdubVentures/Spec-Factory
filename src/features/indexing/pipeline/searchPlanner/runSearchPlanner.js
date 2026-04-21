// WHY: Search Planner phase of the prefetch pipeline (tier-aware LLM enhancement).
// Receives tier-tagged query_rows from Search Profile, enhances query strings via LLM.
// Tier metadata (tier, hint_source, group_key, normalized_key, target_fields) is passthrough.

import { enhanceQueryRows } from './queryPlanner.js';
import { enforceNovelty } from './enforceNovelty.js';
import { toArray } from '../shared/discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ enhancedRows: Array<object>, source: string }}
 */
export async function runSearchPlanner({
  searchProfileBase,
  queryExecutionHistory = null,
  urlExecutionHistory = null,
  config,
  logger,
  identityLock,
  missingFields,
  llmContext = null,
  _di = {},
}) {
  const queryRows = toArray(searchProfileBase?.query_rows);
  // WHY: Discovery History knobs — both default OFF. When the user flips
  // discoveryQueryHistoryEnabled on, prior-run queries get injected into the
  // LLM prompt so it avoids repeats. When off, queryHistory stays empty and
  // the LLM gets no hint that these queries are stale. Same shape for URLs.
  // The cooldown execution gate (queryCooldownDays) is a separate concern
  // living in runQueryJourney.
  const queryHistoryEnabled = Boolean(config?.discoveryQueryHistoryEnabled);
  const urlHistoryEnabled = Boolean(config?.discoveryUrlHistoryEnabled);

  let queryHistory = [];
  if (queryHistoryEnabled) {
    const priorQueries = toArray(queryExecutionHistory?.queries)
      .map((q) => String(q?.query_text || '').trim())
      .filter(Boolean);
    queryHistory = [...new Set([
      ...toArray(searchProfileBase?.base_templates),
      ...priorQueries,
    ])];
  }

  let urlHistory = [];
  if (urlHistoryEnabled) {
    urlHistory = toArray(urlExecutionHistory?.urls)
      .map((u) => String(u || '').trim())
      .filter(Boolean);
    urlHistory = [...new Set(urlHistory)];
  }

  const enhanceFn = _di.enhanceQueryRowsFn || enhanceQueryRows;
  const result = await enhanceFn({
    queryRows,
    queryHistory,
    urlHistory,
    missingFields,
    identityLock,
    config,
    logger,
    llmContext,
  });

  // WHY: Novelty safety net. When query history was injected and the LLM still
  // returned queries matching the history (rubber-stamping the TIER 1 unchanged
  // rule), enforceNovelty rotates those by appending a phrasing-family suffix
  // so the executed query differs from what was already tried. Skipped when
  // queryHistory is empty (nothing to diff against).
  const novelty = queryHistory.length > 0
    ? enforceNovelty({ rows: result.rows, queryHistory })
    : { rows: result.rows, rotated: 0, noveltyRate: 1 };
  const finalRows = novelty.rows;

  const llmCount = finalRows.filter((r) => String(r.hint_source || '').endsWith('_llm')).length;
  logger?.info?.('search_plan_generated', {
    pass_index: 0,
    pass_name: 'enhance',
    source: result.source,
    total_rows: finalRows.length,
    llm_enhanced_count: llmCount,
    novelty_rate: novelty.noveltyRate,
    rotations_applied: novelty.rotated,
    mode: 'tier_enhance',
    queries_generated: finalRows.map((r) => String(r.query || '').trim()).filter(Boolean),
    query_target_map: Object.fromEntries(
      finalRows
        .filter((r) => r.query && Array.isArray(r.target_fields) && r.target_fields.length > 0)
        .map((r) => [String(r.query).trim(), r.target_fields])
    ),
    missing_critical_fields: toArray(missingFields),
    stop_condition: result.source === 'llm' ? 'planner_complete' : 'deterministic_fallback',
    plan_rationale: result.source === 'llm'
      ? `LLM enhanced ${llmCount} of ${finalRows.length} queries`
      : `Deterministic fallback — ${finalRows.length} queries unchanged`,
    enhancement_rows: finalRows.map((r) => ({
      query: String(r.query || '').trim(),
      original_query: String(r.original_query || r.query || '').trim(),
      hint_source: String(r.hint_source || '').trim(),
      tier: String(r.tier || '').trim(),
      group_key: String(r.group_key || '').trim(),
      target_fields: toArray(r.target_fields),
    })),
  });

  return { enhancedRows: finalRows, source: result.source };
}
