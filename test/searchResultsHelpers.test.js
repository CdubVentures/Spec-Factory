import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../tools/gui-react/src/pages/runtime-ops/panels/searchResultsHelpers.js';

function makeResult(overrides = {}) {
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

function makeDetail(overrides = {}) {
  return {
    query: 'test query',
    provider: 'google',
    dedupe_count: 0,
    results: [],
    ...overrides,
  };
}

function makeBasicResult(overrides = {}) {
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

function makeSearchPlan(overrides = {}) {
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

describe('computeDecisionCounts', () => {
  it('returns zero counts for empty details', () => {
    const result = computeDecisionCounts([]);
    assert.deepEqual(result, { keep: 0, maybe: 0, drop: 0, other: 0 });
  });

  it('counts keep/maybe/drop decisions across multiple detail groups', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'drop' }),
          makeResult({ decision: 'maybe' }),
        ],
      }),
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'keep' }),
        ],
      }),
    ];
    const result = computeDecisionCounts(details);
    assert.equal(result.keep, 3);
    assert.equal(result.maybe, 1);
    assert.equal(result.drop, 1);
    assert.equal(result.other, 0);
  });

  it('classifies unknown decisions as other', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'skip' }),
          makeResult({ decision: '' }),
        ],
      }),
    ];
    const result = computeDecisionCounts(details);
    assert.equal(result.keep, 1);
    assert.equal(result.other, 2);
  });
});

// ── computeTopDomains ──

describe('computeTopDomains', () => {
  it('returns empty array for empty details', () => {
    assert.deepEqual(computeTopDomains([], 5), []);
  });

  it('counts and sorts domains by frequency', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'c.com' }),
        ],
      }),
    ];
    const result = computeTopDomains(details, 5);
    assert.equal(result[0].domain, 'a.com');
    assert.equal(result[0].count, 3);
    assert.equal(result[1].domain, 'b.com');
    assert.equal(result[1].count, 2);
    assert.equal(result[2].domain, 'c.com');
    assert.equal(result[2].count, 1);
  });

  it('respects the limit parameter', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'c.com' }),
          makeResult({ domain: 'd.com' }),
        ],
      }),
    ];
    const result = computeTopDomains(details, 2);
    assert.equal(result.length, 2);
  });

  it('aggregates across multiple detail groups', () => {
    const details = [
      makeDetail({ results: [makeResult({ domain: 'x.com' })] }),
      makeDetail({ results: [makeResult({ domain: 'x.com' }), makeResult({ domain: 'y.com' })] }),
    ];
    const result = computeTopDomains(details, 5);
    assert.equal(result[0].domain, 'x.com');
    assert.equal(result[0].count, 2);
  });
});

// ── computeUniqueUrls ──

describe('computeUniqueUrls', () => {
  it('returns 0 for empty details', () => {
    assert.equal(computeUniqueUrls([]), 0);
  });

  it('counts unique URLs across detail groups', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ url: 'https://a.com/1' }),
          makeResult({ url: 'https://a.com/2' }),
        ],
      }),
      makeDetail({
        results: [
          makeResult({ url: 'https://a.com/1' }),
          makeResult({ url: 'https://b.com/3' }),
        ],
      }),
    ];
    assert.equal(computeUniqueUrls(details), 3);
  });
});

// ── computeFilteredCount ──

describe('computeFilteredCount', () => {
  it('returns 0 for empty details', () => {
    assert.equal(computeFilteredCount([]), 0);
  });

  it('counts results with drop or skip decisions', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'drop' }),
          makeResult({ decision: 'skip' }),
          makeResult({ decision: 'maybe' }),
        ],
      }),
    ];
    assert.equal(computeFilteredCount(details), 2);
  });
});

// ── buildFunnelBullets ──

describe('buildFunnelBullets', () => {
  it('returns empty array when no data', () => {
    assert.deepEqual(buildFunnelBullets([], [], { keep: 0, maybe: 0, drop: 0, other: 0 }), []);
  });

  it('includes provider breakdown bullet', () => {
    const basics = [
      makeBasicResult({ provider: 'google', result_count: 10 }),
      makeBasicResult({ provider: 'searxng', result_count: 5 }),
    ];
    const details = [
      makeDetail({ results: [makeResult(), makeResult(), makeResult()] }),
    ];
    const decisions = { keep: 2, maybe: 0, drop: 1, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.length > 0);
    assert.ok(bullets.some((b) => b.includes('queries')));
  });

  it('includes dedupe impact when deduplication occurred', () => {
    const basics = [makeBasicResult({ result_count: 10 })];
    const details = [makeDetail({ dedupe_count: 3, results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('dedupe') || b.toLowerCase().includes('duplicate')));
  });

  it('includes decision distribution bullet when decisions exist', () => {
    const basics = [makeBasicResult()];
    const details = [makeDetail({ results: [makeResult(), makeResult({ decision: 'drop' })] })];
    const decisions = { keep: 1, maybe: 0, drop: 1, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.some((b) => b.includes('kept') || b.includes('keep')));
  });
});

// ── buildDecisionSegments ──

describe('buildDecisionSegments', () => {
  it('returns segments with correct colors', () => {
    const decisions = { keep: 5, maybe: 2, drop: 3, other: 0 };
    const segments = buildDecisionSegments(decisions);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].label, 'Keep');
    assert.equal(segments[0].value, 5);
    assert.ok(segments[0].color.includes('green'));
    assert.equal(segments[1].label, 'Maybe');
    assert.equal(segments[1].value, 2);
    assert.ok(segments[1].color.includes('yellow'));
    assert.equal(segments[2].label, 'Drop');
    assert.equal(segments[2].value, 3);
    assert.ok(segments[2].color.includes('red'));
  });

  it('returns segments with zero values when all counts are zero', () => {
    const decisions = { keep: 0, maybe: 0, drop: 0, other: 0 };
    const segments = buildDecisionSegments(decisions);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].value, 0);
    assert.equal(segments[1].value, 0);
    assert.equal(segments[2].value, 0);
  });
});

// ── buildQueryTargetMap ──

describe('buildQueryTargetMap', () => {
  it('returns empty map when no plans provided', () => {
    const result = buildQueryTargetMap([]);
    assert.equal(result.size, 0);
  });

  it('returns empty map for undefined input', () => {
    const result = buildQueryTargetMap(undefined);
    assert.equal(result.size, 0);
  });

  it('inverts query_target_map from single plan', () => {
    const plans = [
      makeSearchPlan({
        query_target_map: {
          'razer viper v3 pro specs': ['sensor', 'dpi'],
          'razer viper v3 pro weight': ['weight'],
        },
      }),
    ];
    const result = buildQueryTargetMap(plans);
    assert.deepEqual(result.get('razer viper v3 pro specs'), ['sensor', 'dpi']);
    assert.deepEqual(result.get('razer viper v3 pro weight'), ['weight']);
  });

  it('merges target fields across multiple plans for same query', () => {
    const plans = [
      makeSearchPlan({
        query_target_map: { 'specs query': ['sensor'] },
      }),
      makeSearchPlan({
        pass_index: 1,
        pass_name: 'repair',
        query_target_map: { 'specs query': ['weight', 'buttons'] },
      }),
    ];
    const result = buildQueryTargetMap(plans);
    const targets = result.get('specs query');
    assert.ok(targets.includes('sensor'));
    assert.ok(targets.includes('weight'));
    assert.ok(targets.includes('buttons'));
    assert.equal(targets.length, 3);
  });

  it('deduplicates target fields', () => {
    const plans = [
      makeSearchPlan({ query_target_map: { 'q': ['sensor', 'dpi'] } }),
      makeSearchPlan({ pass_index: 1, query_target_map: { 'q': ['sensor', 'weight'] } }),
    ];
    const result = buildQueryTargetMap(plans);
    const targets = result.get('q');
    assert.equal(targets.filter((f) => f === 'sensor').length, 1);
  });
});

// ── queryPassName ──

describe('queryPassName', () => {
  it('returns undefined when no plans provided', () => {
    assert.equal(queryPassName('some query', []), undefined);
  });

  it('returns undefined for undefined plans', () => {
    assert.equal(queryPassName('some query', undefined), undefined);
  });

  it('returns pass name for query found in queries_generated', () => {
    const plans = [
      makeSearchPlan({
        pass_name: 'primary',
        queries_generated: ['razer viper specs', 'razer viper weight'],
      }),
      makeSearchPlan({
        pass_index: 1,
        pass_name: 'repair',
        queries_generated: ['razer viper v3 pro dpi range'],
      }),
    ];
    assert.equal(queryPassName('razer viper specs', plans), 'primary');
    assert.equal(queryPassName('razer viper v3 pro dpi range', plans), 'repair');
  });

  it('returns first matching pass when query appears in multiple passes', () => {
    const plans = [
      makeSearchPlan({ pass_name: 'primary', queries_generated: ['shared query'] }),
      makeSearchPlan({ pass_index: 1, pass_name: 'repair', queries_generated: ['shared query'] }),
    ];
    assert.equal(queryPassName('shared query', plans), 'primary');
  });

  it('returns undefined for unknown query', () => {
    const plans = [
      makeSearchPlan({ pass_name: 'primary', queries_generated: ['known query'] }),
    ];
    assert.equal(queryPassName('unknown query', plans), undefined);
  });
});

// ── computePerQueryStats ──

describe('computePerQueryStats', () => {
  it('returns empty map for empty details', () => {
    const result = computePerQueryStats([]);
    assert.equal(result.size, 0);
  });

  it('computes keep/maybe/drop counts per query', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ decision: 'keep', domain: 'a.com', relevance_score: 0.9 }),
          makeResult({ decision: 'drop', domain: 'b.com', relevance_score: 0.3 }),
          makeResult({ decision: 'maybe', domain: 'a.com', relevance_score: 0.5 }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    const stats = result.get('q1');
    assert.equal(stats.keepCount, 1);
    assert.equal(stats.maybeCount, 1);
    assert.equal(stats.dropCount, 1);
  });

  it('computes topDomain as most frequent domain', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'a.com' }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    assert.equal(result.get('q1').topDomain, 'a.com');
  });

  it('computes average relevance score', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ relevance_score: 0.8 }),
          makeResult({ relevance_score: 0.6 }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    assert.ok(Math.abs(result.get('q1').avgRelevance - 0.7) < 0.001);
  });

  it('handles multiple queries independently', () => {
    const details = [
      makeDetail({ query: 'q1', results: [makeResult({ decision: 'keep' })] }),
      makeDetail({ query: 'q2', results: [makeResult({ decision: 'drop' }), makeResult({ decision: 'drop' })] }),
    ];
    const result = computePerQueryStats(details);
    assert.equal(result.get('q1').keepCount, 1);
    assert.equal(result.get('q2').dropCount, 2);
  });
});

// ── computeDomainDecisionBreakdown ──

describe('computeDomainDecisionBreakdown', () => {
  it('returns empty map for empty details', () => {
    const result = computeDomainDecisionBreakdown([]);
    assert.equal(result.size, 0);
  });

  it('counts keep/maybe/drop per domain across all queries', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ domain: 'a.com', decision: 'keep' }),
          makeResult({ domain: 'a.com', decision: 'drop' }),
          makeResult({ domain: 'b.com', decision: 'keep' }),
        ],
      }),
      makeDetail({
        query: 'q2',
        results: [
          makeResult({ domain: 'a.com', decision: 'maybe' }),
          makeResult({ domain: 'b.com', decision: 'drop' }),
        ],
      }),
    ];
    const result = computeDomainDecisionBreakdown(details);
    const a = result.get('a.com');
    assert.equal(a.keep, 1);
    assert.equal(a.maybe, 1);
    assert.equal(a.drop, 1);
    const b = result.get('b.com');
    assert.equal(b.keep, 1);
    assert.equal(b.drop, 1);
    assert.equal(b.maybe, 0);
  });

  it('classifies skip decisions as drop', () => {
    const details = [
      makeDetail({
        results: [makeResult({ domain: 'x.com', decision: 'skip' })],
      }),
    ];
    const result = computeDomainDecisionBreakdown(details);
    assert.equal(result.get('x.com').drop, 1);
  });
});

// ── buildEnrichedFunnelBullets ──

describe('buildEnrichedFunnelBullets', () => {
  it('returns empty array when no data', () => {
    const result = buildEnrichedFunnelBullets([], [], { keep: 0, maybe: 0, drop: 0, other: 0 }, undefined);
    assert.deepEqual(result, []);
  });

  it('includes target fields bullet when search plans have target maps', () => {
    const basics = [makeBasicResult({ query: 'q1', result_count: 5 })];
    const details = [makeDetail({ query: 'q1', results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const plans = [
      makeSearchPlan({
        query_target_map: { 'q1': ['sensor', 'dpi', 'weight'] },
        queries_generated: ['q1'],
      }),
    ];
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, plans);
    assert.ok(bullets.some((b) => b.includes('field') || b.includes('target')));
  });

  it('includes top-yield query bullet when details exist', () => {
    const basics = [
      makeBasicResult({ query: 'q1', result_count: 5 }),
      makeBasicResult({ query: 'q2', result_count: 3 }),
    ];
    const details = [
      makeDetail({ query: 'q1', results: [makeResult(), makeResult(), makeResult({ decision: 'keep' })] }),
      makeDetail({ query: 'q2', results: [makeResult()] }),
    ];
    const decisions = { keep: 4, maybe: 0, drop: 0, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('q1') || b.includes('yield') || b.includes('most')));
  });

  it('includes strongest domain bullet', () => {
    const basics = [makeBasicResult({ result_count: 10 })];
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'rtings.com', decision: 'keep' }),
          makeResult({ domain: 'rtings.com', decision: 'keep' }),
          makeResult({ domain: 'amazon.com', decision: 'drop' }),
        ],
      }),
    ];
    const decisions = { keep: 2, maybe: 0, drop: 1, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('rtings.com')));
  });

  it('still includes basic funnel info (queries, dedupe, decisions)', () => {
    const basics = [makeBasicResult({ provider: 'google', result_count: 10 })];
    const details = [makeDetail({ dedupe_count: 2, results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('quer')));
  });
});

// ── extractSiteScope ──

describe('extractSiteScope', () => {
  it('returns null for query without site: prefix', () => {
    assert.equal(extractSiteScope('Endgame Gear OP1w specs'), null);
  });

  it('extracts domain from site: prefix at start of query', () => {
    assert.equal(extractSiteScope('site:razer.com Endgame Gear OP1w specs'), 'razer.com');
  });

  it('extracts domain from site: prefix in middle of query', () => {
    assert.equal(extractSiteScope('Endgame Gear site:razer.com specs'), 'razer.com');
  });

  it('returns null for empty string', () => {
    assert.equal(extractSiteScope(''), null);
  });

  it('returns null for undefined', () => {
    assert.equal(extractSiteScope(undefined), null);
  });

  it('extracts domain with subdomain', () => {
    assert.equal(extractSiteScope('site:support.logitech.com G Pro specs'), 'support.logitech.com');
  });
});

// ── providerDisplayLabel ──

describe('providerDisplayLabel', () => {
  it('returns canonical label for dual provider', () => {
    assert.equal(providerDisplayLabel('dual'), 'Dual');
  });

  it('formats compound provider with + separator', () => {
    assert.equal(providerDisplayLabel('duckduckgo+searxng'), 'DuckDuckGo + SearXNG');
    assert.equal(providerDisplayLabel('google+bing'), 'Google + Bing');
  });

  it('returns "SearXNG" for searxng', () => {
    assert.equal(providerDisplayLabel('searxng'), 'SearXNG');
  });

  it('returns capitalized name for google', () => {
    assert.equal(providerDisplayLabel('google'), 'Google');
  });

  it('returns capitalized name for bing', () => {
    assert.equal(providerDisplayLabel('bing'), 'Bing');
  });

  it('returns "DuckDuckGo" for duckduckgo', () => {
    assert.equal(providerDisplayLabel('duckduckgo'), 'DuckDuckGo');
  });

  it('returns raw value for unknown providers', () => {
    assert.equal(providerDisplayLabel('custom_provider'), 'custom_provider');
  });

  it('returns empty string for empty/undefined', () => {
    assert.equal(providerDisplayLabel(''), '');
    assert.equal(providerDisplayLabel(undefined), '');
  });
});

// ── parseDomainFromUrl ──

describe('parseDomainFromUrl', () => {
  it('extracts hostname from valid URL', () => {
    assert.equal(parseDomainFromUrl('https://www.razer.com/mice/viper-v3-pro'), 'www.razer.com');
  });

  it('extracts hostname from URL without www', () => {
    assert.equal(parseDomainFromUrl('https://rtings.com/mouse/reviews/razer'), 'rtings.com');
  });

  it('returns empty string for empty input', () => {
    assert.equal(parseDomainFromUrl(''), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(parseDomainFromUrl(undefined), '');
  });

  it('returns empty string for invalid URL', () => {
    assert.equal(parseDomainFromUrl('not-a-url'), '');
  });

  it('extracts hostname from URL with port', () => {
    assert.equal(parseDomainFromUrl('https://localhost:3000/api/test'), 'localhost');
  });

  it('extracts hostname from DuckDuckGo tracking URL', () => {
    assert.equal(parseDomainFromUrl('https://duckduckgo.com/y.js?ad_domain=amazon.com'), 'duckduckgo.com');
  });
});

// ── enrichResultDomains ──

describe('enrichResultDomains', () => {
  it('fills empty domain from URL', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: '', url: 'https://razer.com/mice/viper' }),
          makeResult({ domain: '', url: 'https://rtings.com/mouse/reviews' }),
        ],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'razer.com');
    assert.equal(enriched[0].results[1].domain, 'rtings.com');
  });

  it('preserves existing non-empty domain', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'already-set.com', url: 'https://different.com/page' }),
        ],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'already-set.com');
  });

  it('does not mutate original details', () => {
    const original = [
      makeDetail({
        results: [makeResult({ domain: '', url: 'https://example.com/page' })],
      }),
    ];
    const enriched = enrichResultDomains(original);
    assert.equal(original[0].results[0].domain, '');
    assert.equal(enriched[0].results[0].domain, 'example.com');
  });

  it('handles empty details array', () => {
    const enriched = enrichResultDomains([]);
    assert.deepEqual(enriched, []);
  });

  it('strips www. prefix from parsed domains', () => {
    const details = [
      makeDetail({
        results: [makeResult({ domain: '', url: 'https://www.amazon.com/dp/12345' })],
      }),
    ];
    const enriched = enrichResultDomains(details);
    assert.equal(enriched[0].results[0].domain, 'amazon.com');
  });
});

// â”€â”€ resolveDomainCapSummary â”€â”€

describe('resolveDomainCapSummary', () => {
  it('uses fast profile clamps when explicit knobs are not present', () => {
    const summary = resolveDomainCapSummary({ profile: 'fast' });
    assert.equal(summary.value, '2');
    assert.equal(summary.queryCap, 6);
    assert.equal(summary.discoveredCap, 60);
    assert.match(summary.tooltip, /Fast profile: clamps discovery results\/query to 6 and max pages\/domain to 2\./);
  });

  it('uses thorough profile floors when explicit knobs are not present', () => {
    const summary = resolveDomainCapSummary({ profile: 'thorough' });
    assert.equal(summary.value, '>=8');
    assert.equal(summary.queryCap, 20);
    assert.equal(summary.discoveredCap, 300);
    assert.match(summary.tooltip, /Thorough profile: raises floors to at least 20 results\/query and at least 8 pages\/domain\./);
  });

  it('prefers explicit knob values when provided', () => {
    const summary = resolveDomainCapSummary({
      profile: 'standard',
      maxPagesPerDomain: 5,
      discoveryResultsPerQuery: 14,
      discoveryMaxDiscovered: 140,
      serpTriageMaxUrls: 18,
      uberMaxUrlsPerDomain: 9,
    });
    assert.equal(summary.value, '5');
    assert.equal(summary.queryCap, 14);
    assert.equal(summary.discoveredCap, 140);
    assert.equal(summary.triageCap, 18);
    assert.equal(summary.uberDomainFloor, 9);
    assert.match(summary.tooltip, /Current domain cap display: 5/);
    assert.match(summary.tooltip, /SERP triage cap keeps up to 18 URLs after triage/);
  });
});
