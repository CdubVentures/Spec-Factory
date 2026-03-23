// WHY: Single place to ask "what can I do with this host?"
// Combines static registry data + provider capabilities.
// Health fields are structurally present but nullable in Phase 1.

import { parseHost } from './hostParser.js';
import { getProviderCapabilities } from './providerCapabilities.js';

const TIER_NUMERIC = {
  tier1_manufacturer: 1,
  tier2_lab: 2,
  tier3_retailer: 3,
  tier4_community: 4,
  tier5_aggregator: 5,
};

/**
 * Build a HostPolicy from a source entry and provider name.
 *
 * @param {object} sourceEntry - validated source entry from registry
 * @param {string} providerName
 * @returns {object} HostPolicy
 */
export function buildHostPolicy(sourceEntry, providerName) {
  const caps = getProviderCapabilities(providerName);
  const parsed = parseHost(sourceEntry.host);

  return {
    host: sourceEntry.host,
    registrable_domain: parsed.registrableDomain || sourceEntry.host,
    tier: sourceEntry.tier,
    tier_numeric: TIER_NUMERIC[sourceEntry.tier] ?? 99,
    authority: sourceEntry.authority || 'unknown',
    synthetic: sourceEntry.synthetic || false,
    crawl_config: sourceEntry.crawl_config || null,
    requires_js: sourceEntry.requires_js || false,
    connector_only: sourceEntry.connector_only || false,
    blocked_in_search: sourceEntry.blocked_in_search || false,
    content_types: sourceEntry.content_types || [],
    field_coverage: sourceEntry.field_coverage || null,
    health: sourceEntry.health || null,
    operator_support: {
      site: caps.supports_site,
      filetype: caps.supports_filetype,
      intitle: caps.supports_intitle,
      inurl: caps.supports_inurl,
    },
  };
}

/**
 * Build a HostPolicy map for all entries in a registry.
 *
 * @param {object} registry - validated source registry
 * @param {string} providerName
 * @returns {Map<string, object>} host → HostPolicy
 */
export function resolveHostPolicies(registry, providerName) {
  const map = new Map();
  for (const entry of registry.entries) {
    map.set(entry.host, buildHostPolicy(entry, providerName));
  }
  return map;
}
