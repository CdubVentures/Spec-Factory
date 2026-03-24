// WHY: Stage 02 of the prefetch pipeline — Brand Resolution.
// Runs IN PARALLEL with NeedSet (Stage 01) via Promise.all. Both LLM
// workers appear simultaneously in the GUI. Resolves brand domain and
// returns brand resolution data for the orchestrator to apply explicitly.

import { callLlmWithRouting, hasLlmRouteApiKey } from '../../../../core/llm/client/routing.js';
import { createBrandResolverCallLlm } from '../discoveryLlmAdapters.js';
import { resolveBrandDomain as defaultResolveBrandDomain } from '../brandResolver.js';

/**
 * @param {object} ctx
 * @returns {{ brandResolution: object|null }}
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
        logger,
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
    aliases: brandResolution?.aliases || [],
    support_domain: brandResolution?.supportDomain || '',
    confidence: brandResolution?.confidence ?? null,
    reasoning: Array.isArray(brandResolution?.reasoning) ? brandResolution.reasoning : [],
  });

  return { brandResolution };
}
