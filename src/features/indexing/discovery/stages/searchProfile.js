// WHY: Stage 03 of the prefetch pipeline — Search Profile generation.
// ALWAYS runs — deterministic query generation. No LLM call.

import {
  buildSearchProfile,
} from '../../search/queryBuilder.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ searchProfileBase: object }}
 */
export function runSearchProfile({
  job,
  categoryConfig,
  missingFields,
  learning,
  brandResolution,
  config,
  searchProfileCaps,
  variables,
  focusGroups,
  seedStatus = null,
  logger,
  runId,
}) {
  if (!Array.isArray(focusGroups) || focusGroups.length === 0) {
    logger?.warn?.('search_profile_tier_fallback', {
      reason: focusGroups == null ? 'focusGroups_null' : 'focusGroups_empty',
    });
  }

  const profileMaxQueries = configInt(config, 'searchProfileQueryCap');
  const searchProfileBase = buildSearchProfile({
    job,
    categoryConfig,
    missingFields,
    lexicon: learning?.enrichedLexicon || learning?.lexicon || {},
    learnedQueries: learning?.queryTemplates || [],
    maxQueries: profileMaxQueries,
    brandResolution,
    aliasValidationCap: searchProfileCaps.llmAliasValidationCap,
    fieldTargetQueriesCap: searchProfileCaps.llmFieldTargetQueriesCap,
    docHintQueriesCap: searchProfileCaps.llmDocHintQueriesCap,
    fieldYieldByDomain: learning?.fieldYield?.by_domain || null,
    seedStatus,
    focusGroups,
  });

  // WHY: Emit search_profile_generated HERE (Stage 03) so the runtime bridge
  // receives the deterministic-only count. Query Journey (Stage 05) merges
  // profile + planner queries but that merged count belongs to query_journey_completed.
  logger?.info?.('search_profile_generated', {
    run_id: runId,
    category: categoryConfig.category,
    product_id: job.productId,
    alias_count: toArray(searchProfileBase?.identity_aliases).length,
    query_count: toArray(searchProfileBase?.queries).length,
    source: 'deterministic',
    query_rows: toArray(searchProfileBase?.query_rows).slice(0, 220).map((row) => ({
      query: String(row?.query || '').trim(),
      hint_source: String(row?.hint_source || '').trim(),
      target_fields: Array.isArray(row?.target_fields) ? row.target_fields : [],
      doc_hint: String(row?.doc_hint || '').trim(),
      domain_hint: String(row?.domain_hint || '').trim(),
      source_host: String(row?.source_host || '').trim(),
      attempts: 0,
      result_count: 0,
      providers: [],
      score: Number.isFinite(Number(row?.score)) ? Number(row.score) : 0,
      score_breakdown: row?.score_breakdown && typeof row.score_breakdown === 'object'
        ? row.score_breakdown : null,
      warnings: Array.isArray(row?.warnings) ? row.warnings : [],
      // WHY: Tier metadata from NeedSet → Search Profile tier builders.
      tier: String(row?.tier || '').trim(),
      group_key: String(row?.group_key || '').trim(),
      normalized_key: String(row?.normalized_key || '').trim(),
      repeat_count: Number.isFinite(Number(row?.repeat_count)) ? Number(row.repeat_count) : 0,
      all_aliases: Array.isArray(row?.all_aliases) ? row.all_aliases : [],
      domain_hints: Array.isArray(row?.domain_hints) ? row.domain_hints : [],
      preferred_content_types: Array.isArray(row?.preferred_content_types) ? row.preferred_content_types : [],
      domains_tried_for_key: Array.isArray(row?.domains_tried_for_key) ? row.domains_tried_for_key : [],
      content_types_tried_for_key: Array.isArray(row?.content_types_tried_for_key) ? row.content_types_tried_for_key : [],
    })),
  });

  return { searchProfileBase };
}
