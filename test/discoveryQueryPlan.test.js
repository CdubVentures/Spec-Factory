/**
 * Tests for discoveryQueryPlan.js — Phase 2 extraction from searchDiscovery.js.
 * Covers query construction, deduplication, ranking, identity-guard filtering.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildManufacturerPlanUrls,
  buildPlanOnlyResults,
  extractSiteHostFromQuery,
  buildQueryPlanFallbackResults,
  dedupeQueryRows,
  prioritizeQueryRows,
  buildIdentityQueryGuardContext,
  validateQueryAgainstIdentity,
  enforceIdentityQueryGuard,
} from '../src/features/indexing/discovery/discoveryQueryPlan.js';
import { toArray } from '../src/features/indexing/discovery/discoveryIdentity.js';

// ---------------------------------------------------------------------------
// buildManufacturerPlanUrls
// ---------------------------------------------------------------------------

test('buildManufacturerPlanUrls: produces URLs for a manufacturer host', () => {
  const urls = buildManufacturerPlanUrls({
    host: 'razer.com',
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
    queries: ['razer viper v3 pro'],
    maxQueries: 1,
    deterministicAliasCap: 4
  });
  assert.ok(urls.length > 0);
  assert.ok(urls.length <= 40);
  for (const row of urls) {
    assert.ok(row.url.startsWith('https://razer.com'));
    assert.equal(row.provider, 'plan');
    assert.ok(typeof row.title === 'string');
    assert.ok(typeof row.snippet === 'string');
  }
});

test('buildManufacturerPlanUrls: no duplicates', () => {
  const urls = buildManufacturerPlanUrls({
    host: 'razer.com',
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
    queries: ['razer viper v3 pro'],
    maxQueries: 1
  });
  const urlSet = new Set(urls.map((r) => r.url));
  assert.equal(urls.length, urlSet.size);
});

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
// prioritizeQueryRows
// ---------------------------------------------------------------------------

test('prioritizeQueryRows: site: operator never increases score', () => {
  const rows = [
    { query: 'razer viper v3 specs', target_fields: ['sensor'] },
    { query: 'site:example.com razer viper v3 specs', target_fields: ['sensor'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor'], {
    hostFieldFit: new Map(),
  });
  const plain = ranked.find((r) => !r.query.includes('site:'));
  const siteRow = ranked.find((r) => r.query.includes('site:'));
  assert.ok(plain.score >= siteRow.score,
    `plain score ${plain.score} should be >= site: score ${siteRow.score}`);
});

test('prioritizeQueryRows: critical fields outrank required fields', () => {
  const fieldPriority = new Map([
    ['sensor', 'critical'],
    ['weight', 'required'],
  ]);
  const rows = [
    { query: 'razer viper v3 weight info', target_fields: ['weight'] },
    { query: 'razer viper v3 sensor info', target_fields: ['sensor'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor', 'weight'], {
    fieldPriority,
  });
  assert.equal(ranked[0].query, 'razer viper v3 sensor info');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('prioritizeQueryRows: field value respects priority tiers', () => {
  const fieldPriority = new Map([
    ['sensor', 'critical'],
    ['weight', 'required'],
    ['color', 'optional'],
  ]);
  const rows = [
    { query: 'razer viper v3 critical', target_fields: ['sensor'] },
    { query: 'razer viper v3 required', target_fields: ['weight'] },
    { query: 'razer viper v3 optional', target_fields: ['color'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['sensor', 'weight', 'color'], { fieldPriority });
  const critical = ranked.find((r) => r.query.includes('critical'));
  const required = ranked.find((r) => r.query.includes('required'));
  const optional = ranked.find((r) => r.query.includes('optional'));
  assert.equal(critical.score_breakdown.field_value, 3);
  assert.equal(required.score_breakdown.field_value, 2);
  assert.equal(optional.score_breakdown.field_value, 1);
});

test('prioritizeQueryRows: field value flat fallback when no fieldPriority', () => {
  const rows = [
    { query: 'razer viper v3', target_fields: ['sensor', 'weight'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor', 'weight']);
  assert.equal(ranked[0].score_breakdown.field_value, 4);
});

test('prioritizeQueryRows: field value caps at 10', () => {
  const fieldPriority = new Map([
    ['f1', 'critical'], ['f2', 'critical'], ['f3', 'critical'],
    ['f4', 'critical'], ['f5', 'critical'], ['f6', 'critical'],
  ]);
  const rows = [
    { query: 'razer viper v3 specs', target_fields: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], { fieldPriority });
  assert.equal(ranked[0].score_breakdown.field_value, 10);
});

test('prioritizeQueryRows: high query-relative source fit outranks low', () => {
  const hostFieldFit = new Map([
    ['goodhost.com', { high: new Set(['sensor', 'weight']), medium: new Set() }],
    ['poorhost.com', { high: new Set(), medium: new Set(['something_else']) }],
  ]);
  const rows = [
    { query: 'razer viper v3 poorhost', domain_hint: 'poorhost.com', target_fields: ['sensor'] },
    { query: 'razer viper v3 goodhost', domain_hint: 'goodhost.com', target_fields: ['sensor'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['sensor', 'weight'], { hostFieldFit });
  const good = ranked.find((r) => r.query.includes('goodhost'));
  const poor = ranked.find((r) => r.query.includes('poorhost'));
  assert.ok(good.score_breakdown.source_fit > poor.score_breakdown.source_fit);
});

test('prioritizeQueryRows: no domain_hint yields 0 source fit', () => {
  const hostFieldFit = new Map([
    ['somehost.com', { high: new Set(['sensor']), medium: new Set() }],
  ]);
  const rows = [
    { query: 'razer viper v3 specs', target_fields: ['sensor'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor'], {
    hostFieldFit,
  });
  assert.equal(ranked[0].score_breakdown.source_fit, 0);
});

test('prioritizeQueryRows: identity match: brand +1 model +1 (tiebreaker)', () => {
  const rows = [
    { query: 'razer viper v3 specs', target_fields: [] },
    { query: 'razer specs', target_fields: [] },
    { query: 'specs review', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, []);
  const both = ranked.find((r) => r.query === 'razer viper v3 specs');
  const brandOnly = ranked.find((r) => r.query === 'razer specs');
  const neither = ranked.find((r) => r.query === 'specs review');
  assert.equal(both.score_breakdown.identity_match, 2);
  assert.equal(brandOnly.score_breakdown.identity_match, 1);
  assert.equal(neither.score_breakdown.identity_match, 0);
});

test('prioritizeQueryRows: same-host redundancy penalized', () => {
  const rows = [
    { query: 'razer viper v3 specs', domain_hint: 'rtings.com', target_fields: ['sensor', 'weight'] },
    { query: 'razer viper v3 review', domain_hint: 'rtings.com', target_fields: ['sensor'] },
    { query: 'razer viper v3 latency', domain_hint: 'rtings.com', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor', 'weight']);
  const breakdowns = ranked.map((r) => r.score_breakdown.redundancy);
  assert.equal(breakdowns[0], 0);
  assert.equal(breakdowns[1], -1);
  assert.equal(breakdowns[2], -2);
});

test('prioritizeQueryRows: site: with no fit entry penalized -2', () => {
  const rows = [
    { query: 'site:unknown.com razer viper v3', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor'], {
    hostFieldFit: new Map(),
  });
  assert.equal(ranked[0].score_breakdown.overconstraint, -2);
});

test('prioritizeQueryRows: site: with low fit penalized -1', () => {
  const hostFieldFit = new Map([
    ['lowfit.com', { heuristic: 0.1 }],
  ]);
  const rows = [
    { query: 'site:lowfit.com razer viper v3', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor'], {
    hostFieldFit,
  });
  assert.equal(ranked[0].score_breakdown.overconstraint, -1);
});

test('prioritizeQueryRows: site: with adequate fit no penalty', () => {
  const hostFieldFit = new Map([
    ['goodfit.com', { heuristic: 0.5 }],
  ]);
  const rows = [
    { query: 'site:goodfit.com razer viper v3', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor'], {
    hostFieldFit,
  });
  assert.equal(ranked[0].score_breakdown.overconstraint, 0);
});

test('prioritizeQueryRows: output includes score_breakdown', () => {
  const rows = [{ query: 'razer viper v3', target_fields: ['sensor'] }];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor']);
  const bd = ranked[0].score_breakdown;
  assert.ok(bd !== null && typeof bd === 'object');
  assert.ok('field_value' in bd);
  assert.ok('source_fit' in bd);
  assert.ok('identity_match' in bd);
  assert.ok('redundancy' in bd);
  assert.ok('overconstraint' in bd);
});

test('prioritizeQueryRows: backward compat: no options arg', () => {
  const rows = [
    { query: 'razer viper v3 specs', target_fields: ['sensor'] },
    { query: 'razer viper v3 review', target_fields: [] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' }, ['sensor']);
  assert.ok(ranked[0].score >= ranked[1].score);
  assert.ok(ranked[0].score_breakdown);
  assert.equal(ranked[0].score_breakdown.source_fit, 0);
  assert.equal(ranked[0].score_breakdown.overconstraint, 0);
});

test('prioritizeQueryRows: degraded mode: no hostFieldFit ranks by field value', () => {
  const fieldPriority = new Map([
    ['sensor', 'critical'],
    ['weight', 'required'],
  ]);
  const rows = [
    { query: 'razer viper v3 review', target_fields: [] },
    { query: 'razer viper v3 sensor weight', target_fields: ['sensor', 'weight'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['sensor', 'weight'], { fieldPriority });
  assert.equal(ranked[0].query, 'razer viper v3 sensor weight');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('prioritizeQueryRows: queries with critical target_fields outrank generic queries', () => {
  const fieldPriority = new Map([
    ['sensor', 'critical'],
    ['weight', 'critical'],
  ]);
  const rows = [
    { query: 'razer viper v3', target_fields: [] },
    { query: 'razer viper v3 sensor weight manual', target_fields: ['sensor', 'weight'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['sensor', 'weight'], { fieldPriority });
  assert.equal(ranked[0].query, 'razer viper v3 sensor weight manual');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('prioritizeQueryRows: targeted missing fields boost score', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper v3', target_fields: ['sensor'] },
    { query: 'razer viper v3', target_fields: [] }
  ], { brand: 'Razer', model: 'Viper V3' }, ['sensor']);
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('prioritizeQueryRows: critical-field planner beats weak-fit site:', () => {
  const fieldPriority = new Map([
    ['sensor', 'critical'],
    ['weight', 'critical'],
  ]);
  const hostFieldFit = new Map([
    ['weak.com', { heuristic: 0.1 }],
  ]);
  const rows = [
    { query: 'razer viper v3 sensor weight specs', target_fields: ['sensor', 'weight'], sources: ['llm'] },
    { query: 'site:weak.com razer viper v3', target_fields: [], sources: ['base_template'] },
  ];
  const ranked = prioritizeQueryRows(rows, { brand: 'Razer', model: 'Viper V3' },
    ['sensor', 'weight'], { fieldPriority, hostFieldFit });
  assert.equal(ranked[0].query, 'razer viper v3 sensor weight specs');
  assert.ok(ranked[0].score > ranked[1].score);
});

// ---------------------------------------------------------------------------
// buildIdentityQueryGuardContext
// ---------------------------------------------------------------------------

test('buildIdentityQueryGuardContext: produces expected shape', () => {
  const ctx = buildIdentityQueryGuardContext(
    { brand: 'Razer', model: 'Viper V3', variant: 'Pro' },
    ['V2', 'V3']
  );
  assert.ok(Array.isArray(ctx.brandTokens));
  assert.ok(Array.isArray(ctx.modelTokens));
  assert.ok(Array.isArray(ctx.requiredDigitGroups));
  assert.ok(Array.isArray(ctx.allowedModelTokens));
  assert.ok(ctx.brandTokens.includes('razer'));
});

// ---------------------------------------------------------------------------
// validateQueryAgainstIdentity
// ---------------------------------------------------------------------------

test('validateQueryAgainstIdentity: accepts matching query', () => {
  const ctx = buildIdentityQueryGuardContext(
    { brand: 'Razer', model: 'Viper V3', variant: 'Pro' }
  );
  const result = validateQueryAgainstIdentity('razer viper v3 pro specs', ctx);
  assert.equal(result.accepted, true);
  assert.deepStrictEqual(result.reasons, []);
});

test('validateQueryAgainstIdentity: rejects missing brand', () => {
  const ctx = buildIdentityQueryGuardContext(
    { brand: 'Razer', model: 'Viper V3' }
  );
  const result = validateQueryAgainstIdentity('logitech g pro specs', ctx);
  assert.equal(result.accepted, false);
  assert.ok(result.reasons.includes('missing_brand_token'));
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

// ---------------------------------------------------------------------------
// Phase 5 — Import guard: buildManufacturerPlanUrls stays in discoveryQueryPlan
// ---------------------------------------------------------------------------

test('Phase 5 — buildManufacturerPlanUrls never imported in queryBuilder.js (import guard)', async () => {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const testDir = dirname(fileURLToPath(import.meta.url));
  const queryBuilderPath = resolve(testDir, '../src/features/indexing/search/queryBuilder.js');
  const source = readFileSync(queryBuilderPath, 'utf-8');

  assert.ok(
    !source.includes('buildManufacturerPlanUrls'),
    'queryBuilder.js must NOT import or reference buildManufacturerPlanUrls — URL guessing is gated to discoveryQueryPlan only'
  );
});
