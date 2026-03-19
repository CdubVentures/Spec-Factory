// WHY: Stage 02 of the prefetch pipeline — Brand Resolution.
// Runs AFTER needset_computed fires so the NeedSet LLM worker appears
// first in the GUI. Resolves brand domain and auto-promotes hosts.

import { extractRootDomain } from '../../../../utils/common.js';
import { callLlmWithRouting, hasLlmRouteApiKey } from '../../../../core/llm/client/routing.js';
import { createBrandResolverCallLlm } from '../discoveryLlmAdapters.js';
import { resolveBrandDomain as defaultResolveBrandDomain } from '../brandResolver.js';
import { promoteFromBrandResolution } from '../../sources/manufacturerPromoter.js';
import { mergeManufacturerPromotions } from '../../sources/sourceFileService.js';
import { normalizeHost } from '../discoveryIdentity.js';

/**
 * @param {object} ctx
 * @returns {{ brandResolution: object|null, brandStatus: string, promotedHosts: string[] }}
 */
export async function runBrandResolver({
  job,
  category,
  config,
  storage,
  logger,
  categoryConfig,
  resolveBrandDomainFn = defaultResolveBrandDomain,
}) {
  let brandResolution = null;
  let brandStatus = 'skipped';
  let brandSkipReason = '';
  const brandName = String(job?.brand || job?.identityLock?.brand || '').trim();

  if (!brandName) {
    brandSkipReason = 'no_brand_in_identity_lock';
  } else {
    try {
      const canCallBrandLlm = Boolean(hasLlmRouteApiKey(config, { role: 'triage' }));
      const brandCallLlm = canCallBrandLlm
        ? createBrandResolverCallLlm({ callRoutedLlmFn: callLlmWithRouting, config, logger })
        : null;
      brandResolution = await resolveBrandDomainFn({
        brand: brandName,
        category: categoryConfig?.category || category,
        config,
        callLlmFn: brandCallLlm,
        storage,
      });
      if (brandResolution?.officialDomain) {
        brandStatus = 'resolved';
      } else if (canCallBrandLlm) {
        brandStatus = 'resolved_empty';
      } else {
        brandSkipReason = 'no_api_key_for_triage_role';
      }
    } catch (err) {
      brandStatus = 'failed';
      brandSkipReason = String(err?.message || 'unknown_error');
      logger?.warn?.('brand_resolution_failed', {
        error: String(err?.message || 'unknown'),
      });
    }
  }

  // WHY: The bridge handler and prefetch builder depend on this event
  // to populate the brand_resolution panel in the GUI.
  logger?.info?.('brand_resolved', {
    brand: brandName || '',
    status: brandStatus,
    skip_reason: brandSkipReason,
    official_domain: brandResolution?.officialDomain || '',
    aliases: brandResolution?.aliases?.slice(0, 5) || [],
    support_domain: brandResolution?.supportDomain || '',
    confidence: brandResolution?.confidence ?? 0,
    candidates: Array.isArray(brandResolution?.candidates)
      ? brandResolution.candidates.slice(0, 10).map((c) => ({
        name: c?.name || '',
        confidence: c?.confidence ?? 0,
        evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets.slice(0, 5) : [],
        disambiguation_note: c?.disambiguation_note || '',
      }))
      : [],
    reasoning: Array.isArray(brandResolution?.reasoning) ? brandResolution.reasoning.slice(0, 10) : [],
  });

  // WHY: Auto-promote brand-resolved domains into first-class source entries
  // so they pass isApprovedHost() and carry correct crawl config.
  const promotedHosts = [];
  if (config.manufacturerAutoPromote && brandResolution?.officialDomain) {
    const variables = {
      brand: String(job?.brand || job?.identityLock?.brand || '').trim(),
    };
    const sourcesFileData = categoryConfig.sources || {};
    const promotedMap = promoteFromBrandResolution(brandResolution, {
      sources: categoryConfig.sourceRegistry || {},
      manufacturer_defaults: sourcesFileData.manufacturer_defaults,
      manufacturer_crawl_overrides: sourcesFileData.manufacturer_crawl_overrides,
    }, { brandName: variables.brand });
    if (promotedMap.size > 0) {
      const tempSourcesData = mergeManufacturerPromotions(
        { sources: categoryConfig.sourceRegistry || {}, approved: {} },
        promotedMap,
      );
      for (const [host, entry] of promotedMap) {
        const norm = normalizeHost(host);
        if (!categoryConfig.sourceHostMap.has(norm)) {
          const hostEntry = {
            host: norm,
            tierName: 'manufacturer',
            sourceId: entry._sourceId,
            displayName: entry.display_name,
            crawlConfig: entry.crawl_config,
            fieldCoverage: null,
            robotsTxtCompliant: entry.crawl_config?.robots_txt_compliant ?? true,
            baseUrl: entry.base_url,
          };
          categoryConfig.sourceHosts.push(hostEntry);
          categoryConfig.sourceHostMap.set(norm, hostEntry);
          categoryConfig.approvedRootDomains?.add?.(extractRootDomain(norm));
        }
      }
      Object.assign(categoryConfig.sourceRegistry, tempSourcesData.sources);
      promotedHosts.push(...promotedMap.keys());
      logger?.info?.('manufacturer_auto_promoted', {
        promoted_hosts: [...promotedMap.keys()],
        count: promotedMap.size,
      });
    }
  }

  return { brandResolution, promotedHosts };
}
