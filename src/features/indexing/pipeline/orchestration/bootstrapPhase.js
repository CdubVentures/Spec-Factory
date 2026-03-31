// WHY: Convergence logic extracted from runDiscoverySeedPlan.js (lines 124-196).
// Runs AFTER NeedSet + Brand Resolver (parallel), BEFORE Search Profile.
// Handles: brand→categoryConfig promotion, identity resolution, learning
// loading, and ctx assembly.

import { resolveJobIdentity, toArray } from '../shared/discoveryIdentity.js';
import { normalizeHost } from '../shared/hostParser.js';
import {
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  ensureCategorySourceLookups,
} from '../shared/helpers.js';
import { extractRootDomain } from '../../../../shared/valueNormalizers.js';

export const bootstrapPhase = {
  id: 'bootstrap',
  checkpoint: 'afterBootstrap',

  async execute(ctx) {
    let { categoryConfig } = ctx;
    const { brandResolution } = ctx;

    // WHY: Add brand-resolved domain to categoryConfig so downstream stages
    // (host policy, query builder) recognise it as an approved source.
    if (brandResolution?.officialDomain) {
      categoryConfig = ensureCategorySourceLookups(categoryConfig);
      const official = normalizeHost(brandResolution.officialDomain);
      if (official && !categoryConfig.sourceHostMap.has(official)) {
        const entry = {
          host: official,
          tierName: 'manufacturer',
          sourceId: `brand_${official.replace(/[^a-z0-9]/g, '_')}`,
          displayName: `${brandResolution.officialDomain} Official`,
          crawlConfig: { method: 'http', robots_txt_compliant: true },
          fieldCoverage: null,
          robotsTxtCompliant: true,
          baseUrl: `https://${official}`,
        };
        categoryConfig.sourceHosts.push(entry);
        categoryConfig.sourceHostMap.set(official, entry);
        categoryConfig.approvedRootDomains?.add?.(extractRootDomain(official));
      }
    }

    const resolvedIdentity = resolveJobIdentity(ctx.job);
    const variables = {
      brand: resolvedIdentity.brand,
      model: resolvedIdentity.model,
      variant: resolvedIdentity.variant,
      category: ctx.job?.category || categoryConfig?.category,
    };
    const missingFields = ctx.normalizeFieldListFn([
      ...toArray(ctx.planningHints.missingRequiredFields),
      ...toArray(ctx.planningHints.missingCriticalFields),
      ...toArray(ctx.job?.requirements?.focus_fields || ctx.job?.requirements?.llmTargetFields),
    ], {
      fieldOrder: categoryConfig?.fieldOrder || [],
    });

    const learning = await loadLearningArtifacts({
      storage: ctx.storage,
      category: categoryConfig?.category,
    });
    const enrichedLexicon = mergeLearningStoreHintsIntoLexicon(learning.lexicon, ctx.learningStoreHints);
    const identityLock = {
      brand: resolvedIdentity.brand,
      model: resolvedIdentity.model,
      variant: resolvedIdentity.variant,
      brand_identifier: resolvedIdentity.brand_identifier || ctx.job?.identityLock?.brand_identifier || '',
      productId: ctx.job?.productId || '',
    };

    return {
      categoryConfig,
      variables,
      identityLock,
      missingFields,
      learning,
      enrichedLexicon,
    };
  },
};
