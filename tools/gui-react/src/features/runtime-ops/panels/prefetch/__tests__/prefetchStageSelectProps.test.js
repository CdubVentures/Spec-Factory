import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../test/helpers/loadBundledModule.js';

// WHY: Characterization + boundary tests for the prefetch stage registry.
// These lock down the data-extraction logic from the current renderPrefetchPanel switch
// statement (WorkersTab.tsx lines 266-308). Each selectProps function must produce
// identical output to the old switch case for the same tab key.

const EXPECTED_KEYS = [
  'needset', 'brand_resolver', 'search_profile', 'search_planner',
  'query_journey', 'search_results', 'serp_selector', 'domain_classifier',
];

const EMPTY_NEEDSET = { total_fields: 0 };
const EMPTY_SEARCH_PROFILE = {
  query_count: 0, provider: '', llm_query_planning: false,
  identity_aliases: [], variant_guard_terms: [], query_rows: [], query_guard: {},
};

function makeMockData() {
  return {
    needset: { total_fields: 12 },
    search_profile: { query_count: 5, provider: 'google', llm_query_planning: true, identity_aliases: ['a1'], variant_guard_terms: ['v1'], query_rows: [{ q: 'test' }], query_guard: { max: 10 } },
    brand_resolution: { brand: 'Logitech', confidence: 0.95 },
    search_plans: [{ pass: 'A', queries: [] }],
    search_results: [{ url: 'https://example.com', status: 'ok' }],
    search_result_details: [{ url: 'https://example.com', title: 'Test' }],
    cross_query_url_counts: { 'example.com': 3 },
    serp_selector: [{ url: 'https://example.com', score: 0.8 }],
    domain_health: [{ host: 'example.com', health: 'good' }],
    llm_calls: {
      needset_planner: [{ type: 'needset_planner' }],
      brand_resolver: [{ type: 'brand_resolver' }],
      search_planner: [{ type: 'search_planner' }],
      serp_selector: [{ type: 'serp_selector' }],
      domain_classifier: [{ type: 'domain_classifier' }],
    },
    idx_runtime: {
      needset: [{ state: 'active' }],
      search_profile: [{ state: 'active' }],
      brand_resolver: [{ state: 'active' }],
      search_planner: [{ state: 'active' }],
      query_journey: [{ state: 'active' }],
      search_results: [{ state: 'active' }],
      serp_selector: [{ state: 'active' }],
      domain_classifier: [{ state: 'active' }],
    },
  };
}

const PS = 'test-category';
const LS = { searchRoute: 'searxng' };
const RID = 'run-123';

let PREFETCH_STAGE_KEYS;
let selectProps;

test('prefetch stage modules load', async () => {
  const keysModule = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/prefetch/prefetchStageKeys.ts',
    { prefix: 'prefetch-keys-' },
  );
  PREFETCH_STAGE_KEYS = keysModule.PREFETCH_STAGE_KEYS;

  const propsModule = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/prefetch/prefetchStageSelectProps.ts',
    { prefix: 'prefetch-select-props-' },
  );
  selectProps = propsModule.PREFETCH_SELECT_PROPS;
});

// -- Boundary: Key completeness --

test('PREFETCH_STAGE_KEYS has exactly 8 keys in pipeline order', () => {
  assert.deepStrictEqual([...PREFETCH_STAGE_KEYS], EXPECTED_KEYS);
});

test('PREFETCH_SELECT_PROPS has exactly 8 entries', () => {
  assert.strictEqual(Object.keys(selectProps).length, 8);
});

test('selectProps keys match PREFETCH_STAGE_KEYS', () => {
  assert.deepStrictEqual(Object.keys(selectProps).sort(), [...EXPECTED_KEYS].sort());
});

// -- Characterization: selectProps equivalence with current switch logic --

test('needset selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.needset({ data: d, persistScope: PS, liveSettings: LS, runId: RID });
  assert.deepStrictEqual(p.data, d.needset);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.needset);
  assert.deepStrictEqual(p.needsetPlannerCalls, d.llm_calls.needset_planner);
});

test('needset selectProps uses empty default when data is undefined', () => {
  const p = selectProps.needset({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.data, EMPTY_NEEDSET);
});

test('search_profile selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.search_profile({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.data, d.search_profile);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.search_profile);
});

test('search_profile selectProps uses empty default when data is undefined', () => {
  const p = selectProps.search_profile({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.data, EMPTY_SEARCH_PROFILE);
});

test('brand_resolver selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.brand_resolver({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.calls, d.llm_calls.brand_resolver);
  assert.deepStrictEqual(p.brandResolution, d.brand_resolution);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.brand_resolver);
});

test('brand_resolver selectProps uses empty calls array when data is undefined', () => {
  const p = selectProps.brand_resolver({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.calls, []);
});

test('search_planner selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.search_planner({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.calls, d.llm_calls.search_planner);
  assert.deepStrictEqual(p.searchPlans, d.search_plans);
  assert.deepStrictEqual(p.searchResults, d.search_results);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.search_planner);
  assert.strictEqual(p.persistScope, PS);
});

test('query_journey selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.query_journey({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.searchProfile, d.search_profile);
  assert.deepStrictEqual(p.searchPlans, d.search_plans);
  assert.deepStrictEqual(p.searchResults, d.search_results);
  assert.deepStrictEqual(p.searchResultDetails, d.search_result_details);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.query_journey);
});

test('query_journey selectProps uses empty profile default when data is undefined', () => {
  const p = selectProps.query_journey({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.searchProfile, EMPTY_SEARCH_PROFILE);
});

test('search_results selectProps extracts correct data including runId', () => {
  const d = makeMockData();
  const p = selectProps.search_results({ data: d, persistScope: PS, liveSettings: LS, runId: RID });
  assert.deepStrictEqual(p.results, d.search_results);
  assert.deepStrictEqual(p.searchResultDetails, d.search_result_details);
  assert.deepStrictEqual(p.searchPlans, d.search_plans);
  assert.deepStrictEqual(p.crossQueryUrlCounts, d.cross_query_url_counts);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.search_results);
  assert.strictEqual(p.runId, RID);
});

test('search_results selectProps uses empty results array when data is undefined', () => {
  const p = selectProps.search_results({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.results, []);
});

test('serp_selector selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.serp_selector({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.calls, d.llm_calls.serp_selector);
  assert.deepStrictEqual(p.serpTriage, d.serp_selector);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.serp_selector);
});

test('domain_classifier selectProps extracts correct data', () => {
  const d = makeMockData();
  const p = selectProps.domain_classifier({ data: d, persistScope: PS, liveSettings: LS });
  assert.deepStrictEqual(p.calls, d.llm_calls.domain_classifier);
  assert.deepStrictEqual(p.domainHealth, d.domain_health);
  assert.strictEqual(p.persistScope, PS);
  assert.deepStrictEqual(p.liveSettings, LS);
  assert.deepStrictEqual(p.idxRuntime, d.idx_runtime.domain_classifier);
});

test('domain_classifier selectProps uses empty calls array when data is undefined', () => {
  const p = selectProps.domain_classifier({ data: undefined, persistScope: PS, liveSettings: undefined });
  assert.deepStrictEqual(p.calls, []);
});
