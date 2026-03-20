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
}) {
  const profileMaxQueries = Math.max(1, configInt(config, 'searchProfileQueryCap'));
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
