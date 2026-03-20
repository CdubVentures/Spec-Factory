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
  variables,
  config,
  logger,
  identityLock,
  missingFields,
  job,
}) {
  const queryRows = toArray(searchProfileBase?.query_rows);
  const queryHistory = toArray(searchProfileBase?.base_templates);

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
