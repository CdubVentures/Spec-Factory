// WHY: Static model of what each search provider supports.
// Single place to query operator support before query compilation.

import { z } from 'zod';

export const providerCapabilitySchema = z.object({
  name: z.string(),
  supports_site: z.boolean(),
  supports_filetype: z.boolean(),
  supports_since: z.boolean(),
  supports_intitle: z.boolean(),
  supports_inurl: z.boolean(),
  supports_exact_phrase: z.boolean(),
  supports_boolean_or: z.boolean(),
  supports_boolean_not: z.boolean(),
  max_query_length: z.number(),
  max_results_per_request: z.number(),
  auth_required: z.boolean(),
  preference_rank: z.number().int().min(1),
  rate_limits: z.object({
    requests_per_second: z.number(),
    burst: z.number().int(),
    cooldown_ms: z.number().int(),
  }),
});

const PROVIDERS = Object.freeze({
  // Measured 2026-03-09: SearXNG meta returns 30+ results with high relevance.
  // site: operator works. filetype: returns 0 results (meta engines strip it).
  searxng: Object.freeze({
    name: 'searxng',
    supports_site: true,
    supports_filetype: false, // Measured: filetype: returns 0 results in meta mode
    supports_since: false, // time_range is a URL param, not query syntax
    supports_intitle: true,
    supports_inurl: true,
    supports_exact_phrase: true,
    supports_boolean_or: true,
    supports_boolean_not: true,
    max_query_length: 2048,
    max_results_per_request: 30,
    auth_required: false,
    preference_rank: 1, // Measured: best automated result quality via meta-search
    rate_limits: { requests_per_second: 1, burst: 3, cooldown_ms: 1000 },
  }),
  // Measured 2026-03-09: Google via SearXNG returns 0 results (anti-bot blocked).
  // Operators are valid if direct API access is available.
  google: Object.freeze({
    name: 'google',
    supports_site: true,
    supports_filetype: true,
    supports_since: true, // Google understands after:/before: in query text
    supports_intitle: true,
    supports_inurl: true,
    supports_exact_phrase: true,
    supports_boolean_or: true,
    supports_boolean_not: true,
    max_query_length: 2048,
    max_results_per_request: 10,
    auth_required: true,
    preference_rank: 3, // Measured: blocked via SearXNG proxy (0 results)
    rate_limits: { requests_per_second: 1, burst: 5, cooldown_ms: 2000 },
  }),
  // Measured 2026-03-09: Bing via SearXNG returns ~10 results, low relevance.
  // site: operator returns 0 results through SearXNG.
  bing: Object.freeze({
    name: 'bing',
    supports_site: true,
    supports_filetype: true,
    supports_since: false, // Bing uses freshness API param, not query syntax
    supports_intitle: true,
    supports_inurl: true,
    supports_exact_phrase: true,
    supports_boolean_or: true,
    supports_boolean_not: true,
    max_query_length: 2048,
    max_results_per_request: 50,
    auth_required: true,
    preference_rank: 2, // Measured: some results, low relevance
    rate_limits: { requests_per_second: 3, burst: 10, cooldown_ms: 500 },
  }),
  // Dual runs the same query against Google and Bing engine lanes.
  // Expose only the shared safe operator subset to avoid engine-specific syntax drift.
  dual: Object.freeze({
    name: 'dual',
    supports_site: true,
    supports_filetype: true,
    supports_since: false,
    supports_intitle: true,
    supports_inurl: true,
    supports_exact_phrase: true,
    supports_boolean_or: true,
    supports_boolean_not: true,
    max_query_length: 2048,
    max_results_per_request: 20,
    auth_required: false,
    preference_rank: 2,
    rate_limits: { requests_per_second: 1, burst: 4, cooldown_ms: 1000 },
  }),
  none: Object.freeze({
    name: 'none',
    supports_site: false,
    supports_filetype: false,
    supports_since: false,
    supports_intitle: false,
    supports_inurl: false,
    supports_exact_phrase: false,
    supports_boolean_or: false,
    supports_boolean_not: false,
    max_query_length: 0,
    max_results_per_request: 0,
    auth_required: false,
    preference_rank: 99,
    rate_limits: { requests_per_second: 0, burst: 0, cooldown_ms: 0 },
  }),
});

const OPERATOR_KEYS = {
  site: 'supports_site',
  filetype: 'supports_filetype',
  since: 'supports_since',
  intitle: 'supports_intitle',
  inurl: 'supports_inurl',
  exact_phrase: 'supports_exact_phrase',
  boolean_or: 'supports_boolean_or',
  boolean_not: 'supports_boolean_not',
};

/**
 * Get frozen capability object for a provider.
 * @throws on unknown provider.
 */
export function getProviderCapabilities(providerName) {
  const caps = PROVIDERS[providerName];
  if (!caps) throw new Error(`Unknown provider: ${providerName}`);
  return caps;
}

/**
 * Check if a provider supports a specific operator.
 * Returns false for unknown operators (safe default).
 */
export function supportsOperator(providerName, operatorName) {
  const caps = getProviderCapabilities(providerName);
  const key = OPERATOR_KEYS[operatorName];
  if (!key) return false;
  return caps[key] === true;
}

/**
 * List all known provider names.
 */
export function listProviders() {
  return Object.keys(PROVIDERS);
}
