/**
 * Pipeline cap enforcement tests.
 * Each pipeline setting must be a hard guarantee on its stage's output count.
 *
 * Bug 1: queryJourney uses searchPlannerQueryCap instead of searchProfileQueryCap
 *         as the final merged cap → Search Profile shows 30 when set to 10.
 * Bug 2: runDiscoverySeedPlan passes searchPlannerQueryCap (query count) as
 *         discoveryCap to the SERP selector (URL count) → serpSelectorUrlCap
 *         is silently overridden by the wrong setting.
 * Bug 3: serpSelector maxKeep uses min(discoveryCap, serpSelectorUrlCap) but
 *         discoveryCap is a query count → wrong unit contaminates URL cap.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runQueryJourney } from '../src/features/indexing/discovery/stages/queryJourney.js';
import { buildSerpSelectorInput } from '../src/features/indexing/discovery/serpSelector.js';

// ---------------------------------------------------------------------------
// Shared factories
// ---------------------------------------------------------------------------

function makeSearchProfileBase(queryCount) {
  const queries = [];
  const queryRows = [];
  for (let i = 0; i < queryCount; i++) {
    const q = `TestBrand TestModel deterministic spec ${i}`;
    queries.push(q);
    queryRows.push({ query: q, source: 'targeted', target_fields: [], hint_source: 'deterministic' });
  }
  return {
    base_templates: [],
    queries,
    query_rows: queryRows,
    query_reject_log: [],
    variant_guard_terms: [],
    identity_aliases: [],
  };
}

function makeUberSearchPlan(queryCount) {
  const queries = [];
  for (let i = 0; i < queryCount; i++) {
    queries.push(`TestBrand TestModel planner spec ${i}`);
  }
  return { queries };
}

function makeConfig(overrides = {}) {
  return {
    searchEngines: 'bing',
    searchProfileQueryCap: 10,
    searchPlannerQueryCap: 30,
    serpSelectorUrlCap: 50,
    domainClassifierUrlCap: 40,
    ...overrides,
  };
}

function makeMinimalJourneyCtx(overrides = {}) {
  return {
    searchProfileBase: makeSearchProfileBase(20),
    schema4Plan: null,
    uberSearchPlan: makeUberSearchPlan(25),
    hostPlanQueryRows: [],
    variables: { brand: 'TestBrand', model: 'TestModel', variant: '', category: 'mouse' },
    config: makeConfig(),
    searchProfileCaps: { dedupeQueriesCap: 200, llmAliasValidationCap: 12, llmFieldTargetQueriesCap: 3, llmDocHintQueriesCap: 3 },
    missingFields: ['weight', 'sensor'],
    planningHints: { missingCriticalFields: ['weight'], missingRequiredFields: ['sensor'] },
    effectiveHostPlan: null,
    categoryConfig: { category: 'mouse', sourceHostMap: new Map(), fieldOrder: [] },
    job: { productId: 'test-product' },
    runId: 'run-cap-test',
    logger: { info: () => {}, warn: () => {} },
    storage: {
      resolveOutputKey: () => 'test-key',
      readJsonOrNull: async () => null,
      writeJson: async () => ({ key: 'test-key' }),
      writeObject: async () => ({}),
    },
    brandResolution: null,
    searchPlanHandoff: null,
    ...overrides,
  };
}

function makeCandidateRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      url: `https://example-${i}.com/page`,
      host: `example-${i}.com`,
      title: `Page ${i}`,
      snippet: `Snippet for page ${i}`,
      rank: i + 1,
      provider: 'bing',
      seen_in_queries: [`query ${i}`],
      seen_by_providers: ['bing'],
      approvedDomain: false,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Bug 1: searchProfileQueryCap must cap the final query journey output
// ---------------------------------------------------------------------------

describe('queryJourney respects searchProfileQueryCap as final output cap', () => {
  it('caps merged query output to searchProfileQueryCap, not searchPlannerQueryCap', async () => {
    const ctx = makeMinimalJourneyCtx({
      config: makeConfig({ searchProfileQueryCap: 10, searchPlannerQueryCap: 30 }),
      searchProfileBase: makeSearchProfileBase(20),
      uberSearchPlan: makeUberSearchPlan(25),
    });

    const result = await runQueryJourney(ctx);

    // The final output must respect searchProfileQueryCap (10), not searchPlannerQueryCap (30)
    assert.ok(result.queries.length <= 10,
      `Expected ≤10 queries (searchProfileQueryCap), got ${result.queries.length}`);
    assert.ok(result.searchProfilePlanned.selected_query_count <= 10,
      `Expected selected_query_count ≤10, got ${result.searchProfilePlanned.selected_query_count}`);
    assert.ok(result.searchProfilePlanned.query_rows.length <= 10,
      `Expected query_rows.length ≤10, got ${result.searchProfilePlanned.query_rows.length}`);
  });

  it('uses searchPlannerQueryCap only for planner contribution, not final output', async () => {
    // 5 deterministic queries, 30 planner queries, profileCap=8, plannerCap=30
    const ctx = makeMinimalJourneyCtx({
      config: makeConfig({ searchProfileQueryCap: 8, searchPlannerQueryCap: 30 }),
      searchProfileBase: makeSearchProfileBase(5),
      uberSearchPlan: makeUberSearchPlan(30),
    });

    const result = await runQueryJourney(ctx);

    assert.ok(result.queries.length <= 8,
      `Expected ≤8 queries (searchProfileQueryCap), got ${result.queries.length}`);
  });
});

// ---------------------------------------------------------------------------
// Bug 2 + 3: serpSelectorUrlCap must control maxKeep, not searchPlannerQueryCap
// ---------------------------------------------------------------------------

describe('buildSerpSelectorInput respects serpSelectorUrlCap independently', () => {
  it('maxKeep equals serpSelectorUrlCap regardless of discoveryCap', () => {
    const candidateRows = makeCandidateRows(80);
    const result = buildSerpSelectorInput({
      runId: 'run-1',
      category: 'mouse',
      productId: 'p1',
      variables: { brand: 'Test', model: 'M1', variant: '' },
      brandResolution: null,
      effectiveHostPlan: null,
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: 30,         // historically derived from searchPlannerQueryCap
      serpSelectorUrlCap: 50,
      domainClassifierUrlCap: 40,
    });

    // maxKeep must be serpSelectorUrlCap (50), NOT min(30, 50)=30
    assert.equal(result.selectorInput.max_keep, 50,
      `Expected max_keep=50 (serpSelectorUrlCap), got ${result.selectorInput.max_keep}`);
  });

  it('maxKeep equals serpSelectorUrlCap when discoveryCap is absent', () => {
    const candidateRows = makeCandidateRows(60);
    const result = buildSerpSelectorInput({
      runId: 'run-2',
      category: 'mouse',
      productId: 'p1',
      variables: { brand: 'Test', model: 'M1', variant: '' },
      brandResolution: null,
      effectiveHostPlan: null,
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: undefined,
      serpSelectorUrlCap: 25,
      domainClassifierUrlCap: 60,
    });

    assert.equal(result.selectorInput.max_keep, 25,
      `Expected max_keep=25 (serpSelectorUrlCap), got ${result.selectorInput.max_keep}`);
  });

  it('domainClassifierUrlCap controls input candidate count', () => {
    const candidateRows = makeCandidateRows(100);
    const result = buildSerpSelectorInput({
      runId: 'run-3',
      category: 'mouse',
      productId: 'p1',
      variables: { brand: 'Test', model: 'M1', variant: '' },
      brandResolution: null,
      effectiveHostPlan: null,
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: 999,
      serpSelectorUrlCap: 50,
      domainClassifierUrlCap: 40,
    });

    // Candidate count should be capped by domainClassifierUrlCap (40)
    assert.ok(result.selectorInput.candidates.length <= 40,
      `Expected ≤40 candidates (domainClassifierUrlCap), got ${result.selectorInput.candidates.length}`);
  });
});
