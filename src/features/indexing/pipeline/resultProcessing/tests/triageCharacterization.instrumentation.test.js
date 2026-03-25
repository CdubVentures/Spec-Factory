import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeCategoryConfig,
  makeIdentityLock,
  makeConfig,
  makeRawResults,
  makeSearchProfilePlanned,
  makeStubSerpSelectorCallFn,
  makeStubStorage,
  makeStubFrontierDb,
  makeStubLogger,
} from './helpers/triageCharacterizationHarness.js';
describe('Characterization - processDiscoveryResults instrumentation', () => {
it('logger emits expected event names', async () => {
  const logger = makeStubLogger();
  await processDiscoveryResults({
    rawResults: makeRawResults(),
    searchAttempts: [],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: '',
    config: makeConfig(),
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'p1' },
    runId: 'r1',
    logger,
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com' },
    missingFields: ['weight'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    queries: ['razer viper v3 pro specs'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  const eventNames = logger.events.map((e) => e.event);
  assert.ok(eventNames.includes('domains_classified'), 'emits domains_classified');
  assert.ok(eventNames.includes('discovery_results_reranked'), 'emits discovery_results_reranked');
});

it('trace enrichment populates reason_codes on serp_explorer candidates', async () => {
  const result = await processDiscoveryResults({
    rawResults: makeRawResults(),
    searchAttempts: [{ query: 'razer viper v3 pro specs', attempts: 1, result_count: 2, providers: ['google'] }],
    searchJournal: [],
    internalSatisfied: false,
    externalSearchReason: 'missing_fields',
    config: makeConfig(),
    storage: makeStubStorage(),
    categoryConfig: makeCategoryConfig(),
    job: { productId: 'p1' },
    runId: 'r1',
    logger: makeStubLogger(),
    runtimeTraceWriter: null,
    frontierDb: makeStubFrontierDb(),
    variables: { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro' },
    identityLock: makeIdentityLock(),
    brandResolution: { officialDomain: 'razer.com' },
    missingFields: ['weight', 'sensor'],
    learning: { fieldYield: {} },
    llmContext: {},
    searchProfileBase: { variant_guard_terms: [] },
    llmQueries: [],
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  // Trace enrichment produces reason_codes on every candidate in serp_explorer
  const allCandidates = result.serp_explorer.queries.flatMap((q) => q.candidates);
  assert.ok(allCandidates.length > 0, 'at least one trace candidate');
  for (const c of allCandidates) {
    assert.ok(Array.isArray(c.reason_codes), 'reason_codes is array');
    // Every selected candidate must have selected_top_k; others below_top_k_cutoff
    const hasSelectionCode = c.reason_codes.some(
      (code) => code === 'selected_top_k' || code === 'below_top_k_cutoff'
    );
    assert.ok(hasSelectionCode, `candidate ${c.url} has selection reason code`);
  }
  // razer.com candidate should have brand_match + approved_domain
  const razerCandidate = allCandidates.find((c) => c.host === 'razer.com');
  if (razerCandidate) {
    assert.ok(razerCandidate.reason_codes.includes('brand_match'), 'razer.com has brand_match');
    assert.ok(razerCandidate.reason_codes.includes('approved_domain'), 'razer.com has approved_domain');
  }
});
});
