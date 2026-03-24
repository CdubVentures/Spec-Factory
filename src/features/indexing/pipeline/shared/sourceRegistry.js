// WHY: Canonical schema-validated source registry. Produces a self-contained
// artifact from category_authority sources.json. Synthetic entries are marked
// explicitly for sparsity reporting.

import { z } from 'zod';
import { normalizeHost, hostMatchesDomain } from './hostParser.js';

export const TIER_ENUM = [
  'tier1_manufacturer',
  'tier2_lab',
  'tier3_retailer',
  'tier4_community',
  'tier5_aggregator',
];

export const TIER_TO_ROLE = {
  manufacturer: 'tier1_manufacturer',
  lab: 'tier2_lab',
  database: 'tier5_aggregator',
  retailer: 'tier3_retailer',
  community: 'tier4_community',
};

export const AUTHORITY_ENUM = [
  'authoritative', 'instrumented', 'aggregator', 'community', 'unknown',
];

// WHY: Raw ZodObject schemas exported for shape introspection (O(1) key derivation).
// The wrapped versions (with .passthrough/.optional/.nullable) are used in sourceEntrySchema.
export const crawlConfigSchema = z.object({
  method: z.enum(['http', 'playwright']).optional().default('http'),
  rate_limit_ms: z.number().optional(),
  timeout_ms: z.number().optional(),
  max_concurrent: z.number().optional(),
  robots_txt_compliant: z.boolean().optional().default(true),
});
const crawlConfigField = crawlConfigSchema.passthrough().optional().nullable();

export const discoverySchema = z.object({
  method: z.enum(['manual', 'search_first']).optional().default('manual'),
  source_type: z.string().optional().default(''),
  search_pattern: z.string().optional().default(''),
  priority: z.number().optional().default(50),
  enabled: z.boolean().optional().default(true),
  notes: z.string().optional().default(''),
});
const discoveryField = discoverySchema.optional().nullable();

const fieldCoverageSchema = z.object({
  high: z.array(z.string()).optional().default([]),
  medium: z.array(z.string()).optional().default([]),
  low: z.array(z.string()).optional().default([]),
}).optional().nullable();

export const sourceEntrySchema = z.object({
  host: z.string(),
  display_name: z.string().optional().default(''),
  tier: z.enum(TIER_ENUM),
  authority: z.enum(AUTHORITY_ENUM).optional().default('unknown'),
  base_url: z.string().optional().default(''),
  content_types: z.array(z.string()).optional().default([]),
  doc_kinds: z.array(z.string()).optional().default([]),
  field_coverage: fieldCoverageSchema.default(null),
  preferred_paths: z.array(z.string()).optional().default([]),
  crawl_config: crawlConfigField.default(null),
  discovery: discoveryField.default(null),
  requires_js: z.boolean().optional().default(false),
  connector_only: z.boolean().optional().default(false),
  blocked_in_search: z.boolean().optional().default(false),
  synthetic: z.boolean().optional().default(false),
  health: z.object({
    last_success_at: z.string().nullable().optional(),
    last_failure_at: z.string().nullable().optional(),
    success_rate_7d: z.number().nullable().optional(),
    avg_latency_ms: z.number().nullable().optional(),
    block_rate_7d: z.number().nullable().optional(),
  }).nullable().optional().default(null),
}).passthrough();

const SCHEMA_VERSION = '1.0.0';

function titleCaseHostLabel(host) {
  const base = String(host || '').split('.')[0] || 'Unknown';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Infer tier for a host from the approved lists.
 */
function inferTierFromApproved(host, approved) {
  for (const [role, hosts] of Object.entries(approved)) {
    if (hosts.includes(host)) {
      return TIER_TO_ROLE[role] || 'tier5_aggregator';
    }
  }
  return null;
}

/**
 * Load and validate a source registry from raw sources.json data.
 *
 * @param {string} category
 * @param {object} rawSources - parsed sources.json content
 * @returns {{ registry, validationErrors: string[], sparsityWarnings: string[] }}
 */
export function loadSourceRegistry(category, rawSources) {
  const validationErrors = [];
  const sparsityWarnings = [];
  const entries = [];
  const seenHosts = new Set();

  const approved = rawSources.approved || {};
  const sources = rawSources.sources || {};

  // Process explicit sources
  for (const [key, raw] of Object.entries(sources)) {
    const host = normalizeHost(raw.base_url || key.replace(/_/g, '.'));
    if (!host) {
      validationErrors.push(`source "${key}": could not derive host`);
      continue;
    }

    const candidate = {
      host,
      display_name: raw.display_name || '',
      tier: raw.tier,
      authority: raw.authority || 'unknown',
      base_url: raw.base_url || '',
      content_types: raw.content_types || [],
      doc_kinds: raw.doc_kinds || [],
      field_coverage: raw.field_coverage || null,
      preferred_paths: raw.preferred_paths || [],
      crawl_config: raw.crawl_config || null,
      requires_js: raw.requires_js || (raw.crawl_config?.method === 'playwright'),
      connector_only: raw.connector_only || false,
      blocked_in_search: raw.blocked_in_search || false,
      synthetic: false,
      health: raw.health || null,
    };

    const result = sourceEntrySchema.safeParse(candidate);
    if (!result.success) {
      const issues = result.error.issues.map(i =>
        `${i.path.join('.')}: ${i.message}`
      );
      validationErrors.push(`source "${key}" (${host}): ${issues.join('; ')}`);
      continue;
    }

    if (seenHosts.has(host)) {
      validationErrors.push(`source "${key}" (${host}): duplicate host — already loaded`);
      continue;
    }
    entries.push(result.data);
    seenHosts.add(host);
  }

  // Generate synthetic entries for approved hosts not in sources
  for (const [role, hosts] of Object.entries(approved)) {
    const tier = TIER_TO_ROLE[role] || 'tier5_aggregator';
    for (const approvedHost of hosts) {
      const normalized = normalizeHost(approvedHost);
      if (!normalized || seenHosts.has(normalized)) continue;

      const syntheticEntry = {
        host: normalized,
        display_name: normalized,
        tier,
        authority: 'unknown',
        base_url: '',
        content_types: [],
        doc_kinds: [],
        field_coverage: null,
        preferred_paths: [],
        crawl_config: null,
        requires_js: false,
        connector_only: false,
        blocked_in_search: false,
        synthetic: true,
        health: null,
      };

      const result = sourceEntrySchema.safeParse(syntheticEntry);
      if (result.success) {
        entries.push(result.data);
        seenHosts.add(normalized);
        sparsityWarnings.push(
          `synthetic_entry: ${normalized} (${tier}) — no source detail in sources.json`
        );
      }
    }
  }

  const registry = {
    version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    category,
    entries,
    validationErrors: [...validationErrors],
    sparsity_warnings: [...sparsityWarnings],
  };

  return { registry, validationErrors, sparsityWarnings };
}

/**
 * Lookup a source entry by host (subdomain-aware).
 */
export function lookupSource(registry, host) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;

  // Exact match first
  const exact = registry.entries.find(e => e.host === normalized);
  if (exact) return exact;

  // Subdomain match
  const sub = registry.entries.find(e => hostMatchesDomain(normalized, e.host));
  return sub || null;
}

/**
 * List entries filtered by tier name.
 */
export function listSourcesByTier(registry, tierName) {
  return registry.entries.filter(e => e.tier === tierName);
}

/**
 * Get field coverage for a host.
 */
export function fieldCoverageForHost(registry, host) {
  const entry = lookupSource(registry, host);
  if (!entry || !entry.field_coverage) return null;
  return entry.field_coverage;
}

/**
 * Check if a host is connector-only.
 */
export function isConnectorOnly(registry, host) {
  const entry = lookupSource(registry, host);
  return entry ? entry.connector_only : false;
}

/**
 * Check if a host is blocked in search.
 */
export function isBlockedInSearch(registry, host) {
  const entry = lookupSource(registry, host);
  return entry ? entry.blocked_in_search : false;
}

/**
 * Population hard gate. Validates a registry has enough entries
 * to safely enable v2 for a category.
 *
 * Requirements:
 * - >= 3 total entries
 * - >= 3 distinct tiers
 * - >= 2 manufacturer hosts
 * - >= 2 retailer hosts
 * - >= 1 lab or aggregator host
 *
 * @param {object} registry
 * @returns {{ passed: boolean, reasons: string[], counts: object }}
 */
export function checkCategoryPopulationHardGate(registry) {
  const reasons = [];
  const entries = registry.entries || [];
  const total = entries.length;

  const tierCounts = {};
  for (const e of entries) {
    tierCounts[e.tier] = (tierCounts[e.tier] || 0) + 1;
  }

  const distinctTiers = Object.keys(tierCounts).length;
  const mfgCount = tierCounts.tier1_manufacturer || 0;
  const retCount = tierCounts.tier3_retailer || 0;
  const labCount = tierCounts.tier2_lab || 0;
  const aggCount = tierCounts.tier5_aggregator || 0;
  const labOrAgg = labCount + aggCount;

  if (total < 3) reasons.push(`total entries ${total} < 3`);
  if (distinctTiers < 3) reasons.push(`distinct tiers ${distinctTiers} < 3`);
  // WHY: manufacturer hosts are auto-promoted at runtime from brand resolver — no static requirement
  if (retCount < 2) reasons.push(`retailer hosts ${retCount} < 2`);
  if (labOrAgg < 1) reasons.push(`lab/aggregator hosts ${labOrAgg} < 1`);

  return {
    passed: reasons.length === 0,
    reasons,
    counts: {
      total,
      distinct_tiers: distinctTiers,
      manufacturer: mfgCount,
      retailer: retCount,
      lab: labCount,
      aggregator: aggCount,
    },
  };
}

/**
 * Generate a sparsity report for the registry.
 */
export function registrySparsityReport(registry) {
  const synthetic = registry.entries.filter(e => e.synthetic);
  const real = registry.entries.filter(e => !e.synthetic);
  const total = registry.entries.length;

  return {
    total,
    real_count: real.length,
    synthetic_count: synthetic.length,
    synthetic_ratio: total > 0 ? synthetic.length / total : 0,
    detailed: synthetic.map(e => ({
      host: e.host,
      tier: e.tier,
      reason: 'no source detail in sources.json',
    })),
  };
}
