export {
  computeDecisionCounts,
  computeTopDomains,
  computeUniqueUrls,
  computeFilteredCount,
  buildFunnelBullets,
  buildDecisionSegments,
  buildQueryTargetMap,
  queryPassName,
  buildEnrichedFunnelBullets,
  computePerQueryStats,
  computeDomainDecisionBreakdown,
  extractSiteScope,
  providerDisplayLabel,
  parseDomainFromUrl,
  enrichResultDomains,
  resolveDomainCapSummary,
  resolveRuntimeDomainCapSummary,
} from '../../searchResultsHelpers.js';

// Shared factories for searchResultsHelpers test slices.

export function makeResult(overrides = {}) {
  return {
    title: 'Product Page',
    url: 'https://example.com/page',
    domain: 'example.com',
    snippet: 'Some snippet text',
    rank: 1,
    relevance_score: 0.8,
    decision: 'keep',
    reason: 'High relevance',
    ...overrides,
  };
}

export function makeDetail(overrides = {}) {
  return {
    query: 'test query',
    provider: 'google',
    dedupe_count: 0,
    results: [],
    ...overrides,
  };
}

export function makeBasicResult(overrides = {}) {
  return {
    query: 'test query',
    provider: 'google',
    result_count: 10,
    duration_ms: 500,
    worker_id: 'search-1',
    ts: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeSearchPlan(overrides = {}) {
  return {
    pass_index: 0,
    pass_name: 'primary',
    queries_generated: [],
    query_target_map: {},
    missing_critical_fields: [],
    mode: 'standard',
    stop_condition: 'planner_complete',
    plan_rationale: '',
    ...overrides,
  };
}

// ── computeDecisionCounts ──
