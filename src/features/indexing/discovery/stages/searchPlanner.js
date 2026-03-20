// WHY: Stage 04 of the prefetch pipeline — Search Planner (tier-aware LLM enhancement).
// Receives tier-tagged query_rows from Search Profile, enhances query strings via LLM.
// Tier metadata (tier, hint_source, group_key, normalized_key, target_fields) is passthrough.

import { enhanceQueryRows } from '../../../../research/queryPlanner.js';
import { toArray } from '../discoveryIdentity.js';

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
  });

  if (result.source === 'llm' && result.rows.length > 0) {
    const llmCount = result.rows.filter((r) => String(r.hint_source || '').endsWith('_llm')).length;
    logger?.info?.('search_plan_generated', {
      pass_index: 0,
      pass_name: 'enhance',
      source: result.source,
      total_rows: result.rows.length,
      llm_enhanced_count: llmCount,
      mode: 'tier_enhance',
    });
  }

  return { enhancedRows: result.rows, source: result.source };
}
