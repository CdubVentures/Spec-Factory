// WHY: Search Planner phase of the prefetch pipeline (tier-aware LLM enhancement).
// Receives tier-tagged query_rows from Search Profile, enhances query strings via LLM.
// Tier metadata (tier, hint_source, group_key, normalized_key, target_fields) is passthrough.

import { enhanceQueryRows } from './queryPlanner.js';
import { toArray } from '../shared/discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ enhancedRows: Array<object>, source: string }}
 */
export async function runSearchPlanner({
  searchProfileBase,
  queryExecutionHistory = null,
  config,
  logger,
  identityLock,
  missingFields,
  llmContext = null,
}) {
  const queryRows = toArray(searchProfileBase?.query_rows);
  // WHY: Query history should include actual prior-round queries from frontier
  // (not just this round's deterministic templates) so the LLM avoids repeating
  // patterns that were already tried.
  const priorQueries = toArray(queryExecutionHistory?.queries)
    .map((q) => String(q?.query_text || '').trim())
    .filter(Boolean);
  const queryHistory = [...new Set([
    ...toArray(searchProfileBase?.base_templates),
    ...priorQueries,
  ])];

  const result = await enhanceQueryRows({
    queryRows,
    queryHistory,
    missingFields,
    identityLock,
    config,
    logger,
    llmContext,
  });

  const llmCount = result.rows.filter((r) => String(r.hint_source || '').endsWith('_llm')).length;
  logger?.info?.('search_plan_generated', {
    pass_index: 0,
    pass_name: 'enhance',
    source: result.source,
    total_rows: result.rows.length,
    llm_enhanced_count: llmCount,
    mode: 'tier_enhance',
    queries_generated: result.rows.map((r) => String(r.query || '').trim()).filter(Boolean),
    query_target_map: Object.fromEntries(
      result.rows
        .filter((r) => r.query && Array.isArray(r.target_fields) && r.target_fields.length > 0)
        .map((r) => [String(r.query).trim(), r.target_fields])
    ),
    missing_critical_fields: toArray(missingFields),
    stop_condition: result.source === 'llm' ? 'planner_complete' : 'deterministic_fallback',
    plan_rationale: result.source === 'llm'
      ? `LLM enhanced ${llmCount} of ${result.rows.length} queries`
      : `Deterministic fallback — ${result.rows.length} queries unchanged`,
    enhancement_rows: result.rows.map((r) => ({
      query: String(r.query || '').trim(),
      original_query: String(r.original_query || r.query || '').trim(),
      hint_source: String(r.hint_source || '').trim(),
      tier: String(r.tier || '').trim(),
      group_key: String(r.group_key || '').trim(),
      target_fields: toArray(r.target_fields),
    })),
  });

  return { enhancedRows: result.rows, source: result.source };
}
