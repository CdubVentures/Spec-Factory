import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const EXPECTED_KEYS = [
  'needset',
  'brand_resolver',
  'search_profile',
  'search_planner',
  'query_journey',
  'search_results',
  'serp_selector',
  'domain_classifier',
];

const EMPTY_NEEDSET = { total_fields: 0 };
const EMPTY_SEARCH_PROFILE = {
  query_count: 0,
  provider: '',
  llm_query_planning: false,
  identity_aliases: [],
  variant_guard_terms: [],
  query_rows: [],
  query_guard: {},
};

function createPrefetchData(overrides = {}) {
  return {
    needset: { total_fields: 12 },
    search_profile: {
      query_count: 5,
      provider: 'google',
      llm_query_planning: true,
      identity_aliases: ['a1'],
      variant_guard_terms: ['v1'],
      query_rows: [{ q: 'test' }],
      query_guard: { max: 10 },
    },
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
    ...overrides,
  };
}

async function createPrefetchHarness() {
  const keysModule = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/prefetch/prefetchStageKeys.ts',
    { prefix: 'prefetch-keys-' },
  );
  const propsModule = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/prefetch/prefetchStageSelectProps.ts',
    { prefix: 'prefetch-select-props-' },
  );

  return {
    keys: keysModule.PREFETCH_STAGE_KEYS,
    selectProps: propsModule.PREFETCH_SELECT_PROPS,
    persistScope: 'test-category',
    liveSettings: { searchRoute: 'searxng' },
    runId: 'run-123',
  };
}

test('prefetch stage registry exports the published key order', async () => {
  const harness = await createPrefetchHarness();
  assert.deepStrictEqual([...harness.keys], EXPECTED_KEYS);
});

test('prefetch select props cover each published stage exactly once', async () => {
  const harness = await createPrefetchHarness();
  assert.strictEqual(Object.keys(harness.selectProps).length, EXPECTED_KEYS.length);
  assert.deepStrictEqual(Object.keys(harness.selectProps).sort(), [...EXPECTED_KEYS].sort());
});

test('needset select props surface the current needset contract', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.needset({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
    runId: harness.runId,
  });

  assert.deepStrictEqual(props.data, data.needset);
  assert.strictEqual(props.persistScope, harness.persistScope);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.needset);
  assert.deepStrictEqual(props.needsetPlannerCalls, data.llm_calls.needset_planner);
});

test('needset select props fall back to the empty contract', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.needset({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.data, EMPTY_NEEDSET);
});

test('search_profile select props surface the current search profile contract', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.search_profile({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.data, data.search_profile);
  assert.strictEqual(props.persistScope, harness.persistScope);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.search_profile);
});

test('search_profile select props fall back to the empty profile contract', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.search_profile({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.data, EMPTY_SEARCH_PROFILE);
});

test('brand_resolver select props surface brand resolution inputs', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.brand_resolver({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.calls, data.llm_calls.brand_resolver);
  assert.deepStrictEqual(props.brandResolution, data.brand_resolution);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.brand_resolver);
});

test('brand_resolver select props fall back to empty calls', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.brand_resolver({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.calls, []);
});

test('search_planner select props surface planner results', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.search_planner({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.calls, data.llm_calls.search_planner);
  assert.deepStrictEqual(props.searchPlans, data.search_plans);
  assert.deepStrictEqual(props.searchResults, data.search_results);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.search_planner);
  assert.strictEqual(props.persistScope, harness.persistScope);
});

test('query_journey select props surface the full query journey contract', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.query_journey({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.searchProfile, data.search_profile);
  assert.deepStrictEqual(props.searchPlans, data.search_plans);
  assert.deepStrictEqual(props.searchResults, data.search_results);
  assert.deepStrictEqual(props.searchResultDetails, data.search_result_details);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.query_journey);
});

test('query_journey select props fall back to the empty profile contract', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.query_journey({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.searchProfile, EMPTY_SEARCH_PROFILE);
});

test('search_results select props surface result payloads including run id', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.search_results({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
    runId: harness.runId,
  });

  assert.deepStrictEqual(props.results, data.search_results);
  assert.deepStrictEqual(props.searchResultDetails, data.search_result_details);
  assert.deepStrictEqual(props.searchPlans, data.search_plans);
  assert.deepStrictEqual(props.crossQueryUrlCounts, data.cross_query_url_counts);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.search_results);
  assert.strictEqual(props.runId, harness.runId);
});

test('search_results select props fall back to empty results', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.search_results({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.results, []);
});

test('serp_selector select props surface SERP triage payloads', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.serp_selector({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.calls, data.llm_calls.serp_selector);
  assert.deepStrictEqual(props.serpTriage, data.serp_selector);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.serp_selector);
});

test('domain_classifier select props surface domain health payloads', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const props = harness.selectProps.domain_classifier({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });

  assert.deepStrictEqual(props.calls, data.llm_calls.domain_classifier);
  assert.deepStrictEqual(props.domainHealth, data.domain_health);
  assert.deepStrictEqual(props.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(props.idxRuntime, data.idx_runtime.domain_classifier);
});

test('domain_classifier select props fall back to empty calls', async () => {
  const harness = await createPrefetchHarness();
  const props = harness.selectProps.domain_classifier({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });

  assert.deepStrictEqual(props.calls, []);
});
