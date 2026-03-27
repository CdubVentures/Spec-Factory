// WHY: Convergence logic extracted from runDiscoverySeedPlan.js (lines 124-196).
// Runs AFTER NeedSet + Brand Resolver (parallel), BEFORE Search Profile.
// Handles: brand→categoryConfig promotion, planner brand hints, identity
// resolution, learning loading, and ctx assembly.

import { resolveJobIdentity, toArray } from '../shared/discoveryIdentity.js';
import { normalizeHost } from '../shared/hostParser.js';
import {
  mergeLearningStoreHintsIntoLexicon,
  loadLearningArtifacts,
  ensureCategorySourceLookups,
} from '../shared/helpers.js';
import { extractRootDomain } from '../../../../shared/valueNormalizers.js';
import { resolveTierNameForHost } from '../../../../categories/loader.js';

// WHY: Pure function replacing SourcePlanner._manufacturerHostsFromConfig,
// _selectManufacturerHostsForBrand, updateBrandHints, and seedManufacturerDeepUrls.
// Returns robots.txt seed URLs for brand-targeted manufacturer hosts.
export function buildManufacturerSeedUrls({ job, categoryConfig, brandResolution }) {
  // 1. Collect manufacturer hosts from categoryConfig
  const configHosts = new Set();
  for (const sourceHost of categoryConfig?.sourceHosts || []) {
    if (sourceHost.tierName === 'manufacturer') {
      configHosts.add(normalizeHost(sourceHost.host));
    }
  }
  for (const host of job?.preferredSources?.manufacturerHosts || []) {
    configHosts.add(normalizeHost(host));
  }

  // 2. Build brand hints from brand resolution (same as updateBrandHints)
  const brandHints = new Set();
  for (const alias of brandResolution?.aliases || []) {
    const token = String(alias || '').trim().toLowerCase();
    if (token) brandHints.add(token);
  }
  const official = normalizeHost(String(brandResolution?.officialDomain || ''));
  if (official) {
    brandHints.add(official);
    const slug = official.split('.')[0];
    if (slug) brandHints.add(slug);
  }
  const support = normalizeHost(String(brandResolution?.supportDomain || ''));
  if (support) {
    brandHints.add(support);
    const slug = support.split('.')[0];
    if (slug) brandHints.add(slug);
  }

  // 3. Filter manufacturer hosts by brand hints (same as _selectManufacturerHostsForBrand)
  let manufacturerHosts;
  const candidates = [...configHosts].filter(Boolean);
  if (!candidates.length) {
    manufacturerHosts = new Set();
  } else if (!brandHints.size) {
    manufacturerHosts = new Set(candidates);
  } else {
    const strict = candidates.filter((host) =>
      [...brandHints].some((hint) => hint && host.includes(hint))
    );
    manufacturerHosts = strict.length > 0 ? new Set(strict) : new Set();
  }

  // 4. Add seed URLs that are manufacturer-tier hosts (same as seedManufacturerDeepUrls)
  for (const seedUrl of job?.seedUrls || []) {
    let host;
    try { host = normalizeHost(new URL(seedUrl).hostname); } catch { continue; }
    if (host && resolveTierNameForHost(host, categoryConfig) === 'manufacturer') {
      if (!manufacturerHosts.size || [...manufacturerHosts].some((mh) => host.includes(mh) || mh.includes(host))) {
        manufacturerHosts.add(host);
      }
    }
  }

  // 5. Generate robots.txt seed URLs
  const queryText = [
    job?.identityLock?.brand || '',
    job?.identityLock?.model || '',
    job?.identityLock?.variant || '',
  ].join(' ').replace(/\s+/g, ' ').trim();
  if (!queryText) return [];

  const urls = [];
  for (const host of manufacturerHosts) {
    if (host) urls.push(`https://${host}/robots.txt`);
  }
  return urls;
}

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

    // WHY: Generate manufacturer seed URLs from brand resolution data.
    // Pure function — no planner mutation.
    const manufacturerSeedUrls = buildManufacturerSeedUrls({
      job: ctx.job,
      categoryConfig,
      brandResolution,
    });

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
      productId: ctx.job?.productId || '',
    };

    return {
      categoryConfig,
      variables,
      identityLock,
      missingFields,
      learning,
      enrichedLexicon,
      manufacturerSeedUrls,
    };
  },
};
