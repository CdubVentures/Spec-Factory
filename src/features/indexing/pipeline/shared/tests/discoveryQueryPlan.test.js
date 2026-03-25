/**
 * Tests for discoveryQueryPlan.js — Phase 2 extraction from searchDiscovery.js.
 * Covers query construction, deduplication, ranking, identity-guard filtering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlanOnlyResults,
  extractSiteHostFromQuery,
  buildQueryPlanFallbackResults,
  dedupeQueryRows,
  enforceIdentityQueryGuard,
} from '../queryPlan.js';

// ---------------------------------------------------------------------------
// buildPlanOnlyResults
// ---------------------------------------------------------------------------

test('buildPlanOnlyResults: generates planned URLs for manufacturer hosts only', () => {
  const results = buildPlanOnlyResults({
    categoryConfig: {
      sourceHosts: [
        { host: 'razer.com', role: 'manufacturer' },
        { host: 'rtings.com', role: 'review' }
      ]
    },
    queries: ['razer viper v3 pro'],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
    maxQueries: 1
  });
  assert.ok(results.length > 0);
  const razerUrls = results.filter((r) => r.url.includes('razer.com'));
  const rtingsUrls = results.filter((r) => r.url.includes('rtings.com'));
  assert.ok(razerUrls.length > 0, 'manufacturer host produces planned URLs');
  // WHY: Non-manufacturer hosts now produce zero plan-only results — search-first mode
  assert.equal(rtingsUrls.length, 0, 'non-manufacturer host produces zero planned URLs');
});

// ---------------------------------------------------------------------------
// extractSiteHostFromQuery
// ---------------------------------------------------------------------------

test('extractSiteHostFromQuery: extracts host from site: operator', () => {
  assert.equal(extractSiteHostFromQuery('razer viper site:razer.com specs'), 'razer.com');
  assert.equal(extractSiteHostFromQuery('site:rtings.com mouse review'), 'rtings.com');
});

test('extractSiteHostFromQuery: returns empty for no site operator', () => {
  assert.equal(extractSiteHostFromQuery('razer viper v3 pro specs'), '');
  assert.equal(extractSiteHostFromQuery(''), '');
});

// ---------------------------------------------------------------------------
// buildQueryPlanFallbackResults
// ---------------------------------------------------------------------------

test('buildQueryPlanFallbackResults: produces fallback URLs', () => {
  const results = buildQueryPlanFallbackResults({
    categoryConfig: {
      sourceHosts: [{ host: 'razer.com', role: 'manufacturer' }]
    },
    query: 'razer viper v3 pro',
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
    maxResults: 5
  });
  assert.ok(results.length > 0);
  assert.ok(results.length <= 5);
  for (const row of results) {
    assert.equal(row.provider, 'plan_fallback');
  }
});

test('buildQueryPlanFallbackResults: returns empty for no hosts', () => {
  const results = buildQueryPlanFallbackResults({
    categoryConfig: { sourceHosts: [] },
    query: 'test query',
    variables: {}
  });
  assert.deepStrictEqual(results, []);
});

// ---------------------------------------------------------------------------
// dedupeQueryRows
// ---------------------------------------------------------------------------

test('dedupeQueryRows: removes duplicate queries', () => {
  const { rows, rejectLog } = dedupeQueryRows([
    { query: 'razer viper v3', source: 'needset' },
    { query: 'Razer Viper V3', source: 'profile' },
    { query: 'logitech g pro', source: 'needset' }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].query, 'razer viper v3');
  assert.ok(rows[0].sources.includes('needset'));
  assert.ok(rows[0].sources.includes('profile'));
  assert.ok(rejectLog.some((r) => r.reason === 'duplicate_query'));
});

test('dedupeQueryRows: respects cap', () => {
  const { rows, rejectLog } = dedupeQueryRows([
    { query: 'a', source: 's1' },
    { query: 'b', source: 's2' },
    { query: 'c', source: 's3' }
  ], 2);
  assert.equal(rows.length, 2);
  assert.ok(rejectLog.some((r) => r.reason === 'max_query_cap'));
});

test('dedupeQueryRows: skips truly empty string rows', () => {
  const { rows, rejectLog } = dedupeQueryRows([
    '',
    'valid'
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query, 'valid');
  assert.ok(rejectLog.some((r) => r.reason === 'empty_query'));
});

test('dedupeQueryRows: preserves tier metadata on duplicate merge', () => {
  // WHY: When a duplicate query merges into an existing row that has no tier,
  // the existing row should absorb the duplicate's tier metadata.
  const { rows } = dedupeQueryRows([
    { query: 'razer viper v3 specs', source: 'profile', tier: undefined, group_key: undefined, normalized_key: undefined },
    { query: 'Razer Viper V3 Specs', source: 'needset', tier: 'seed', group_key: 'core_specs', normalized_key: 'battery_hours' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 'seed', 'tier should be absorbed from duplicate');
  assert.equal(rows[0].group_key, 'core_specs', 'group_key should be absorbed from duplicate');
  assert.equal(rows[0].normalized_key, 'battery_hours', 'normalized_key should be absorbed from duplicate');
});

test('dedupeQueryRows: does not overwrite existing tier metadata on merge', () => {
  // WHY: If the first row already has tier metadata, it should not be overwritten
  // by a later duplicate's tier metadata (first-seen wins).
  const { rows } = dedupeQueryRows([
    { query: 'razer viper v3 specs', source: 'needset', tier: 'seed', group_key: 'identity', normalized_key: null },
    { query: 'Razer Viper V3 Specs', source: 'profile', tier: 'group_search', group_key: 'core_specs', normalized_key: 'weight' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, 'seed', 'first-seen tier should win');
  assert.equal(rows[0].group_key, 'identity', 'first-seen group_key should win');
});

// ---------------------------------------------------------------------------
// enforceIdentityQueryGuard
// ---------------------------------------------------------------------------

test('enforceIdentityQueryGuard: filters invalid queries', () => {
  const { rows, rejectLog, guardContext } = enforceIdentityQueryGuard({
    rows: [
      { query: 'razer viper v3 pro manual' },
      { query: 'logitech g pro x superlight specs' },
      { query: '' }
    ],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
  });
  assert.ok(rows.length >= 1);
  assert.ok(rows.some((r) => r.query.includes('razer')));
  assert.ok(rejectLog.length > 0);
  assert.ok(guardContext.brandTokens.includes('razer'));
});

test('enforceIdentityQueryGuard: empty rows returns empty', () => {
  const { rows, rejectLog } = enforceIdentityQueryGuard({
    rows: [],
    variables: { brand: 'Razer' }
  });
  assert.deepStrictEqual(rows, []);
  assert.deepStrictEqual(rejectLog, []);
});

