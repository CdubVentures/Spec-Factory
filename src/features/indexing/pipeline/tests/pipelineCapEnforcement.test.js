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

import { runQueryJourney } from '../queryJourney/runQueryJourney.js';
import { buildSerpSelectorInput } from '../resultProcessing/serpSelector.js';

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

function makeEnhancedRows(queryCount) {
  const rows = [];
  for (let i = 0; i < queryCount; i++) {
    rows.push({ query: `TestBrand TestModel planner spec ${i}`, source: 'planner', target_fields: [], hint_source: 'planner' });
  }
  return rows;
}

function makeConfig(overrides = {}) {
  return {
    searchEngines: 'bing',
    searchProfileQueryCap: 10,
    serpSelectorUrlCap: 50,
    domainClassifierUrlCap: 40,
    ...overrides,
  };
}

function makeMinimalJourneyCtx(overrides = {}) {
  return {
    searchProfileBase: makeSearchProfileBase(20),
    enhancedRows: makeEnhancedRows(25),
    variables: { brand: 'TestBrand', model: 'TestModel', variant: '', category: 'mouse' },
    config: makeConfig(),
    searchProfileCaps: { dedupeQueriesCap: 200, llmAliasValidationCap: 12, llmFieldTargetQueriesCap: 3, llmDocHintQueriesCap: 3 },
    missingFields: ['weight', 'sensor'],
    planningHints: { missingCriticalFields: ['weight'], missingRequiredFields: ['sensor'] },
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
      config: makeConfig({ searchProfileQueryCap: 10 }),
      searchProfileBase: makeSearchProfileBase(20),
      enhancedRows: makeEnhancedRows(25),
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
      config: makeConfig({ searchProfileQueryCap: 8 }),
      searchProfileBase: makeSearchProfileBase(5),
      enhancedRows: makeEnhancedRows(30),
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
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: 30,
      serpSelectorUrlCap: 50,
    });

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
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: undefined,
      serpSelectorUrlCap: 25,
    });

    assert.equal(result.selectorInput.max_keep, 25,
      `Expected max_keep=25 (serpSelectorUrlCap), got ${result.selectorInput.max_keep}`);
  });

  it('SERP selector input capped at SERP_SELECTOR_MAX_CANDIDATES (80)', () => {
    // WHY: domainClassifierUrlCap no longer controls SERP selector input.
    // It now controls Stage 08 enqueue cap. SERP input is always ≤ 80.
    const candidateRows = makeCandidateRows(100);
    const result = buildSerpSelectorInput({
      runId: 'run-3',
      category: 'mouse',
      productId: 'p1',
      variables: { brand: 'Test', model: 'M1', variant: '' },
      brandResolution: null,
      candidateRows,
      categoryConfig: { category: 'mouse', sourceHostMap: new Map(), approvedRootDomains: new Set() },
      discoveryCap: 999,
      serpSelectorUrlCap: 50,
    });

    assert.ok(result.selectorInput.candidates.length <= 80,
      `Expected ≤80 candidates (SERP_SELECTOR_MAX_CANDIDATES), got ${result.selectorInput.candidates.length}`);
  });
});

// ---------------------------------------------------------------------------
// domainClassifierUrlCap: Stage 08 enqueue cap
// ---------------------------------------------------------------------------

import { runDomainClassifier } from '../domainClassifier/runDomainClassifier.js';

describe('runDomainClassifier respects domainClassifierUrlCap', () => {
  function makePlanner() {
    const enqueued = [];
    return {
      enqueue(url, source, opts) { enqueued.push({ url, source, ...opts }); },
      enqueueCounters: { total: 0 },
      _enqueued: enqueued,
    };
  }

  function makeDiscoveryResult(urlCount) {
    const selectedUrls = [];
    const candidates = [];
    for (let i = 0; i < urlCount; i++) {
      const url = `https://example-${i}.com/page`;
      selectedUrls.push(url);
      candidates.push({
        url,
        original_url: url,
        host: `example-${i}.com`,
        score: urlCount - i,
        triage_disposition: 'fetch_high',
        selection_priority: 'high',
      });
    }
    return { selectedUrls, allCandidateUrls: selectedUrls, candidates };
  }

  it('caps enqueued URLs to domainClassifierUrlCap', () => {
    const planner = makePlanner();
    const result = runDomainClassifier({
      discoveryResult: makeDiscoveryResult(20),
      planner,
      config: { domainClassifierUrlCap: 10 },
      logger: { info: () => {}, warn: () => {} },
    });

    assert.equal(result.enqueuedCount, 10);
    assert.equal(result.overflowCount, 10);
    assert.equal(planner._enqueued.length, 10);
  });

  it('enqueues all URLs when under cap', () => {
    const planner = makePlanner();
    const result = runDomainClassifier({
      discoveryResult: makeDiscoveryResult(5),
      planner,
      config: { domainClassifierUrlCap: 50 },
      logger: { info: () => {}, warn: () => {} },
    });

    assert.equal(result.enqueuedCount, 5);
    assert.equal(result.overflowCount, 0);
    assert.equal(planner._enqueued.length, 5);
  });

  it('selects highest-scored URLs when capping', () => {
    const planner = makePlanner();
    runDomainClassifier({
      discoveryResult: makeDiscoveryResult(10),
      planner,
      config: { domainClassifierUrlCap: 3 },
      logger: { info: () => {}, warn: () => {} },
    });

    // URLs with scores 10, 9, 8 should be enqueued (highest first)
    assert.equal(planner._enqueued.length, 3);
    assert.equal(planner._enqueued[0].url, 'https://example-0.com/page');
    assert.equal(planner._enqueued[1].url, 'https://example-1.com/page');
    assert.equal(planner._enqueued[2].url, 'https://example-2.com/page');
  });
});
