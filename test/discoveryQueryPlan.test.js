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

test('buildPlanOnlyResults: generates planned URLs for source hosts', () => {
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
  assert.ok(razerUrls.length > 0);
  assert.ok(rtingsUrls.length > 0);
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

// ---------------------------------------------------------------------------
// prioritizeQueryRows
// ---------------------------------------------------------------------------

test('prioritizeQueryRows: site: queries score higher', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper v3' },
    { query: 'site:razer.com viper v3' }
  ], { brand: 'Razer', model: 'Viper V3' });
  assert.equal(ranked[0].query, 'site:razer.com viper v3');
  assert.ok(ranked[0].score > ranked[1].score);
});

test('prioritizeQueryRows: manual/datasheet queries score higher', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper' },
    { query: 'razer viper v3 manual pdf' }
  ], { brand: 'Razer', model: 'Viper V3' });
  assert.ok(ranked[0].query.includes('manual'));
});

test('prioritizeQueryRows: LLM planner queries outrank deterministic site: queries', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper v3 pro site:razer.com', sources: ['base_template'] },
    { query: 'razer viper v3 pro sensor weight manual', sources: ['llm'] },
  ], { brand: 'Razer', model: 'Viper V3' });
  const llmRow = ranked.find((r) => toArray(r.sources).includes('llm'));
  const siteRow = ranked.find((r) => r.query.includes('site:'));
  assert.ok(llmRow.score > siteRow.score, `LLM score ${llmRow.score} should beat site: score ${siteRow.score}`);
  assert.equal(ranked[0].query, llmRow.query, 'LLM query should rank first');
});

test('prioritizeQueryRows: uber source queries receive source bonus', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper v3 review', sources: ['base_template'] },
    { query: 'razer viper v3 review', sources: ['uber'] },
  ], { brand: 'Razer', model: 'Viper V3' });
  const uberRow = ranked.find((r) => toArray(r.sources).includes('uber'));
  const baseRow = ranked.find((r) => toArray(r.sources).includes('base_template'));
  assert.ok(uberRow.score > baseRow.score, `uber score ${uberRow.score} should beat base score ${baseRow.score}`);
});

test('prioritizeQueryRows: targeted missing fields boost score', () => {
  const ranked = prioritizeQueryRows([
    { query: 'razer viper v3', target_fields: ['sensor'] },
    { query: 'razer viper v3', target_fields: [] }
  ], { brand: 'Razer', model: 'Viper V3' }, ['sensor']);
  assert.ok(ranked[0].score >= ranked[1].score);
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
