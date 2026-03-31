import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  processDiscoveryResults,
  makeProcessDiscoveryResultsArgs,
  makeStubStorage,
  makeStubLogger,
} from './helpers/triageCharacterizationHarness.js';
describe('Characterization - processDiscoveryResults result contract', () => {
it('returns all required top-level keys with correct types', async () => {
  const storage = makeStubStorage();
  const logger = makeStubLogger();
  const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs({
    searchAttempts: [{ query: 'razer viper v3 pro specs', attempts: 1, result_count: 2, providers: ['google'] }],
    externalSearchReason: 'missing_fields',
    storage,
    job: { productId: 'test-product' },
    runId: 'run-001',
    logger,
    missingFields: ['weight', 'sensor', 'dpi'],
    searchProfileBase: { variant_guard_terms: ['hyperspeed'] },
    queries: ['razer viper v3 pro specs', 'razer viper v3 pro review'],
  }));

  // Top-level keys
  assert.equal(result.enabled, true);
  // writeDiscoveryPayloads is a no-op stub — keys are undefined
  assert.equal(result.discoveryKey, undefined);
  assert.equal(result.candidatesKey, undefined);
  assert.ok(Array.isArray(result.candidates), 'candidates is array');
  assert.ok(Array.isArray(result.selectedUrls), 'selectedUrls is array');
  assert.ok(Array.isArray(result.queries), 'queries is array');
  assert.ok(Array.isArray(result.llm_queries), 'llm_queries is array');
  assert.ok(typeof result.search_profile === 'object' && result.search_profile !== null, 'search_profile is object');
  assert.equal(typeof result.search_profile_key, 'string');
  assert.equal(typeof result.search_profile_run_key, 'string');
  assert.equal(typeof result.search_profile_latest_key, 'string');
  assert.ok(typeof result.provider_state === 'object', 'provider_state is object');
  assert.equal(typeof result.internal_satisfied, 'boolean');
  assert.equal(typeof result.external_search_reason, 'string');
  assert.ok(Array.isArray(result.search_attempts), 'search_attempts is array');
  assert.ok(Array.isArray(result.search_journal), 'search_journal is array');
  assert.ok(typeof result.serp_explorer === 'object' && result.serp_explorer !== null, 'serp_explorer is object');
});

it('selectedUrls are string arrays matching candidates', async () => {
  const result = await processDiscoveryResults(makeProcessDiscoveryResultsArgs());

  for (const url of result.selectedUrls) {
    assert.equal(typeof url, 'string', 'each selectedUrl is a string');
    assert.ok(url.startsWith('https://'), 'selectedUrl starts with https://');
  }
  // selectedUrls = all candidate URLs
  const selectedSet = new Set(result.selectedUrls);
  const candidateUrlSet = new Set(result.candidates.map((c) => c.url));
  assert.deepEqual(selectedSet, candidateUrlSet, 'selectedUrls = all candidate URLs');
});
});
