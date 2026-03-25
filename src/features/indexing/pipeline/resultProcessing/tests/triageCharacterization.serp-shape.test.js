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
describe('Characterization - processDiscoveryResults SERP and profile shape', () => {
it('serp_explorer has expected top-level shape', async () => {
  const result = await processDiscoveryResults({
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
    logger: makeStubLogger(),
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

  const se = result.serp_explorer;
  assert.ok(se !== null && typeof se === 'object', 'serp_explorer exists');

  // Capture actual keys for shape contract
  const requiredKeys = [
    'generated_at', 'llm_selector_enabled', 'llm_selector_applied',
    'query_count', 'candidates_checked', 'urls_triaged',
    'urls_selected', 'urls_rejected',
    'raw_input', 'hard_drop_count', 'canon_merge_count', 'soft_exclude_count',
    'queries',
  ];
  for (const key of requiredKeys) {
    assert.ok(key in se, `serp_explorer has key '${key}', got keys: ${Object.keys(se).join(', ')}`);
  }
  assert.ok(Array.isArray(se.queries), 'serp_explorer.queries is array');
  assert.equal(typeof se.generated_at, 'string');
  assert.equal(typeof se.llm_selector_enabled, 'boolean');
  assert.equal(typeof se.llm_selector_applied, 'boolean');
  assert.equal(typeof se.query_count, 'number');
  assert.equal(typeof se.candidates_checked, 'number');
  assert.equal(typeof se.urls_triaged, 'number');
  assert.equal(typeof se.urls_selected, 'number');
  assert.equal(typeof se.urls_rejected, 'number');
  assert.equal(typeof se.raw_input, 'number');
  assert.equal(typeof se.hard_drop_count, 'number');
  assert.equal(typeof se.canon_merge_count, 'number');
  assert.equal(typeof se.soft_exclude_count, 'number');
});

it('serp_explorer query rows have expected candidate shape', async () => {
  const result = await processDiscoveryResults({
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
    logger: makeStubLogger(),
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
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
    searchProfilePlanned: makeSearchProfilePlanned(),
    searchProfileKeys: { inputKey: 'k1', runKey: 'k2', latestKey: 'k3' },
    providerState: {},


    _serpSelectorCallFn: makeStubSerpSelectorCallFn(),
  });

  const queryRow = result.serp_explorer.queries.find((q) => q.candidates.length > 0);
  assert.ok(queryRow, 'at least one query row has candidates');

  // Query row shape
  assert.equal(typeof queryRow.query, 'string');
  assert.equal(typeof queryRow.hint_source, 'string');
  assert.ok(Array.isArray(queryRow.target_fields), 'target_fields is array');
  assert.equal(typeof queryRow.doc_hint, 'string');
  assert.equal(typeof queryRow.domain_hint, 'string');
  assert.equal(typeof queryRow.result_count, 'number');
  assert.equal(typeof queryRow.attempts, 'number');
  assert.ok(Array.isArray(queryRow.providers), 'providers is array');
  assert.equal(typeof queryRow.candidate_count, 'number');
  assert.equal(typeof queryRow.selected_count, 'number');

  // Candidate shape
  const candidate = queryRow.candidates[0];
  assert.equal(typeof candidate.url, 'string');
  assert.equal(typeof candidate.title, 'string');
  assert.equal(typeof candidate.snippet, 'string');
  assert.equal(typeof candidate.host, 'string');
  assert.equal(typeof candidate.doc_kind, 'string');
  assert.equal(typeof candidate.triage_score, 'number');
  assert.equal(typeof candidate.decision, 'string');
  assert.ok(Array.isArray(candidate.reason_codes), 'reason_codes is array');
  assert.ok(Array.isArray(candidate.providers), 'providers is array');
});

it('search_profile (searchProfileFinal) has expected shape', async () => {
  const result = await processDiscoveryResults({
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
    logger: makeStubLogger(),
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

  const sp = result.search_profile;
  assert.equal(typeof sp.generated_at, 'string');
  assert.equal(sp.status, 'executed');
  assert.ok(Array.isArray(sp.query_rows), 'query_rows is array');
  assert.ok(Array.isArray(sp.query_stats), 'query_stats is array');
  assert.equal(typeof sp.discovered_count, 'number');
  assert.equal(typeof sp.selected_count, 'number');
  assert.equal(typeof sp.llm_query_planning, 'boolean');
  assert.equal(typeof sp.llm_query_model, 'string');
  assert.equal(typeof sp.llm_serp_selector, 'boolean');
  assert.equal(typeof sp.llm_serp_selector_model, 'string');
  assert.ok(typeof sp.serp_explorer === 'object', 'serp_explorer embedded in search_profile');
});
});
