// WHY: Stage 03 of the prefetch pipeline — Search Profile generation.
// ALWAYS runs — deterministic query generation. No LLM call.

import {
  buildSearchProfile,
  buildScoredQueryRowsFromHostPlan,
  collectHostPlanHintTokens,
} from '../../search/queryBuilder.js';
import { lookupFieldRule } from '../../search/queryFieldRuleGates.js';
import { buildEffectiveHostPlan } from '../domainHintResolver.js';
import { configInt } from '../../../../shared/settingsAccessor.js';
import { toArray } from '../discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ searchProfileBase: object, effectiveHostPlan: object|null, hostPlanQueryRows: Array }}
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
    })),
  });

  const brandResolutionHints = [...new Set(
    [
      brandResolution?.officialDomain,
      ...toArray(brandResolution?.aliases),
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  )];

  let effectiveHostPlan = null;
  let hostPlanQueryRows = [];
  if (categoryConfig?.validatedRegistry) {
    const hostPlanHintTokens = collectHostPlanHintTokens({
      categoryConfig,
      focusFields: missingFields,
    });
    effectiveHostPlan = buildEffectiveHostPlan({
      domainHints: hostPlanHintTokens,
      registry: categoryConfig.validatedRegistry,
      providerName: config.searchEngines,
      brandResolutionHints,
    });
    if (!effectiveHostPlan?.blocked) {
      const hostPlanFocusTerms = missingFields.slice(0, 3).map((field) => {
        const rule = lookupFieldRule(categoryConfig, field);
        const terms = toArray(rule?.search_hints?.query_terms)
          .map((t) => String(t || '').trim()).filter(Boolean);
        return terms[0] || field.replace(/_/g, ' ');
      });
      hostPlanQueryRows = buildScoredQueryRowsFromHostPlan(
        effectiveHostPlan,
        { brand: variables.brand, model: variables.model, variant: variables.variant },
        missingFields,
        { resolvedTerms: hostPlanFocusTerms },
      );
    }
  }

  return { searchProfileBase, effectiveHostPlan, hostPlanQueryRows };
}
