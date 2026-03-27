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

function buildPanelStub(exportName) {
  return `export function ${exportName}() { return null; }`;
}

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
  if (!createPrefetchHarness.promise) {
    createPrefetchHarness.promise = loadBundledModule(
      'tools/gui-react/src/features/runtime-ops/panels/prefetch/prefetchStageRegistry.ts',
      {
        prefix: 'prefetch-registry-',
        stubs: {
          '../shared/stageGroupContracts.ts': `
            export function buildStageEntry(
              key,
              label,
              tip,
              markerClass,
              idleClass,
              outlineClass,
              Component,
              selectProps,
            ) {
              return {
                key,
                label,
                tip,
                markerClass,
                idleClass,
                outlineClass,
                render: (ctx) => ({ type: Component, props: selectProps(ctx) }),
                selectProps,
              };
            }
          `,
          './PrefetchNeedSetPanel.tsx': buildPanelStub('PrefetchNeedSetPanel'),
          './PrefetchSearchProfilePanel.tsx': buildPanelStub('PrefetchSearchProfilePanel'),
          './PrefetchBrandResolverPanel.tsx': buildPanelStub('PrefetchBrandResolverPanel'),
          './PrefetchSearchPlannerPanel.tsx': buildPanelStub('PrefetchSearchPlannerPanel'),
          './PrefetchQueryJourneyPanel.tsx': buildPanelStub('PrefetchQueryJourneyPanel'),
          './PrefetchSearchResultsPanel.tsx': buildPanelStub('PrefetchSearchResultsPanel'),
          './PrefetchSerpSelectorPanel.tsx': buildPanelStub('PrefetchSerpSelectorPanel'),
          './PrefetchDomainClassifierPanel.tsx': buildPanelStub('PrefetchDomainClassifierPanel'),
        },
      },
    ).then((registryModule) => ({
      keys: registryModule.PREFETCH_STAGE_KEYS,
      selectProps: registryModule.PREFETCH_SELECT_PROPS,
      persistScope: 'test-category',
      liveSettings: { searchRoute: 'searxng' },
      runId: 'run-123',
    }));
  }

  return createPrefetchHarness.promise;
}

createPrefetchHarness.promise = null;

test('prefetch stage registry exports the published key order', async () => {
  const harness = await createPrefetchHarness();
  assert.deepStrictEqual([...harness.keys], EXPECTED_KEYS);
  assert.strictEqual(Object.keys(harness.selectProps).length, EXPECTED_KEYS.length);
  assert.deepStrictEqual(Object.keys(harness.selectProps).sort(), [...EXPECTED_KEYS].sort());
});

test('prefetch select props surface the current stage contracts', async () => {
  const harness = await createPrefetchHarness();
  const data = createPrefetchData();
  const needsetProps = harness.selectProps.needset({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
    runId: harness.runId,
  });
  assert.deepStrictEqual(needsetProps.data, data.needset);
  assert.strictEqual(needsetProps.persistScope, harness.persistScope);
  assert.deepStrictEqual(needsetProps.idxRuntime, data.idx_runtime.needset);
  assert.deepStrictEqual(needsetProps.needsetPlannerCalls, data.llm_calls.needset_planner);

  const searchProfileProps = harness.selectProps.search_profile({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(searchProfileProps.data, data.search_profile);
  assert.strictEqual(searchProfileProps.persistScope, harness.persistScope);
  assert.deepStrictEqual(searchProfileProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(searchProfileProps.idxRuntime, data.idx_runtime.search_profile);

  const brandResolverProps = harness.selectProps.brand_resolver({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(brandResolverProps.calls, data.llm_calls.brand_resolver);
  assert.deepStrictEqual(brandResolverProps.brandResolution, data.brand_resolution);
  assert.deepStrictEqual(brandResolverProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(brandResolverProps.idxRuntime, data.idx_runtime.brand_resolver);

  const searchPlannerProps = harness.selectProps.search_planner({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(searchPlannerProps.calls, data.llm_calls.search_planner);
  assert.deepStrictEqual(searchPlannerProps.searchPlans, data.search_plans);
  assert.deepStrictEqual(searchPlannerProps.searchResults, data.search_results);
  assert.deepStrictEqual(searchPlannerProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(searchPlannerProps.idxRuntime, data.idx_runtime.search_planner);
  assert.strictEqual(searchPlannerProps.persistScope, harness.persistScope);

  const queryJourneyProps = harness.selectProps.query_journey({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(queryJourneyProps.searchProfile, data.search_profile);
  assert.deepStrictEqual(queryJourneyProps.searchPlans, data.search_plans);
  assert.deepStrictEqual(queryJourneyProps.searchResults, data.search_results);
  assert.deepStrictEqual(queryJourneyProps.searchResultDetails, data.search_result_details);
  assert.deepStrictEqual(queryJourneyProps.idxRuntime, data.idx_runtime.query_journey);

  const searchResultsProps = harness.selectProps.search_results({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
    runId: harness.runId,
  });
  assert.deepStrictEqual(searchResultsProps.results, data.search_results);
  assert.deepStrictEqual(searchResultsProps.searchResultDetails, data.search_result_details);
  assert.deepStrictEqual(searchResultsProps.searchPlans, data.search_plans);
  assert.deepStrictEqual(searchResultsProps.crossQueryUrlCounts, data.cross_query_url_counts);
  assert.deepStrictEqual(searchResultsProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(searchResultsProps.idxRuntime, data.idx_runtime.search_results);
  assert.strictEqual(searchResultsProps.runId, harness.runId);

  const serpSelectorProps = harness.selectProps.serp_selector({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(serpSelectorProps.calls, data.llm_calls.serp_selector);
  assert.deepStrictEqual(serpSelectorProps.serpSelector, data.serp_selector);
  assert.deepStrictEqual(serpSelectorProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(serpSelectorProps.idxRuntime, data.idx_runtime.serp_selector);

  const domainClassifierProps = harness.selectProps.domain_classifier({
    data,
    persistScope: harness.persistScope,
    liveSettings: harness.liveSettings,
  });
  assert.deepStrictEqual(domainClassifierProps.calls, data.llm_calls.domain_classifier);
  assert.deepStrictEqual(domainClassifierProps.domainHealth, data.domain_health);
  assert.deepStrictEqual(domainClassifierProps.liveSettings, harness.liveSettings);
  assert.deepStrictEqual(domainClassifierProps.idxRuntime, data.idx_runtime.domain_classifier);
});

test('prefetch select props preserve the public empty fallbacks', async () => {
  const harness = await createPrefetchHarness();

  const needsetProps = harness.selectProps.needset({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(needsetProps.data, EMPTY_NEEDSET);

  const searchProfileProps = harness.selectProps.search_profile({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(searchProfileProps.data, EMPTY_SEARCH_PROFILE);

  const brandResolverProps = harness.selectProps.brand_resolver({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(brandResolverProps.calls, []);

  const queryJourneyProps = harness.selectProps.query_journey({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(queryJourneyProps.searchProfile, EMPTY_SEARCH_PROFILE);

  const searchResultsProps = harness.selectProps.search_results({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(searchResultsProps.results, []);

  const domainClassifierProps = harness.selectProps.domain_classifier({
    data: undefined,
    persistScope: harness.persistScope,
    liveSettings: undefined,
  });
  assert.deepStrictEqual(domainClassifierProps.calls, []);
});
