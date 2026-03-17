import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig } from '../src/config.js';

// ---------------------------------------------------------------------------
// C.1 — Foundation Hardening: Config Validation Tests
//
// Tests for validateConfig() exported from src/config.js. It detects invalid
// config combinations at startup and returns clear error/warning messages.
// ---------------------------------------------------------------------------

// =========================================================================
// SECTION 1: loadConfig defaults are sensible
// =========================================================================

test('C.1 config defaults: loadConfig returns valid defaults', () => {
  const config = loadConfig();
  assert.equal(typeof config.maxUrlsPerProduct, 'number');
  assert.equal(config.maxUrlsPerProduct > 0, true);
  assert.equal(config.runProfile, 'standard');
});

test('C.1 config defaults: discovery enabled by default', () => {
  const config = loadConfig();
  assert.equal(config.discoveryEnabled, true);
});

test('C.1 config defaults: userAgent is normalized without surrounding quotes', () => {
  const config = loadConfig({ runProfile: 'standard' });
  assert.equal(typeof config.userAgent, 'string');
  assert.equal(config.userAgent.startsWith('"'), false);
  assert.equal(config.userAgent.endsWith('"'), false);
  assert.equal(
    config.userAgent,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  );
});

test('C.1 config overrides: quoted userAgent input is normalized without surrounding quotes', () => {
  const config = loadConfig({
    runProfile: 'standard',
    userAgent: '"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"'
  });
  assert.equal(typeof config.userAgent, 'string');
  assert.equal(config.userAgent.startsWith('"'), false);
  assert.equal(config.userAgent.endsWith('"'), false);
  assert.equal(
    config.userAgent,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  );
});

test('C.1 config defaults: runtime fetch/search defaults use canonical tuned values', () => {
  const config = loadConfig({ runProfile: 'standard' });
  assert.equal(config.concurrency, 4);
  assert.equal(config.pageGotoTimeoutMs, 12_000);
  assert.equal(config.postLoadWaitMs, 200);
  assert.equal(config.discoveryQueryConcurrency, 2);
  assert.equal(config.discoveryMaxDiscovered, 60);
  assert.equal(config.fetchPerHostConcurrencyCap, 1);
  assert.equal(config.fetchSchedulerEnabled, true);
  assert.equal(config.dynamicFetchRetryBudget, 1);
  assert.equal(config.dynamicFetchRetryBackoffMs, 2_500);
  assert.equal(config.frontierBlockedDomainThreshold, 1);
});

test('C.1 config defaults: retired bingSearchEndpoint knob is absent', () => {
  const config = loadConfig({ runProfile: 'standard' });
  assert.equal(Object.hasOwn(config, 'bingSearchEndpoint'), false);
});


test('C.1 config invariants: SERP triage reranking flags stay enabled even when env disables them', () => {
  const previousSerpTriageEnabled = process.env.SERP_TRIAGE_ENABLED;
  const previousLlmSerpRerankEnabled = process.env.LLM_SERP_RERANK_ENABLED;
  process.env.SERP_TRIAGE_ENABLED = 'false';
  process.env.LLM_SERP_RERANK_ENABLED = 'false';
  try {
    const config = loadConfig({ runProfile: 'standard' });
    assert.equal(config.serpTriageEnabled, true);
    assert.equal(config.llmSerpRerankEnabled, true);
  } finally {
    if (previousSerpTriageEnabled === undefined) delete process.env.SERP_TRIAGE_ENABLED;
    else process.env.SERP_TRIAGE_ENABLED = previousSerpTriageEnabled;
    if (previousLlmSerpRerankEnabled === undefined) delete process.env.LLM_SERP_RERANK_ENABLED;
    else process.env.LLM_SERP_RERANK_ENABLED = previousLlmSerpRerankEnabled;
  }
});

test('C.1 config defaults: indexing helper files disabled by default', () => {
  const config = loadConfig();
  assert.equal(config.indexingCategoryAuthorityEnabled, false);
});

test('C.1 config defaults: cortex disabled by default', () => {
  const config = loadConfig();
  assert.equal(config.cortexEnabled, false);
});

// =========================================================================
// SECTION 2: Config validation detects misconfigurations
// =========================================================================

test('C.1 validate: LLM always-on without API key is warning (not error)', () => {
  const config = loadConfig({ llmApiKey: '' });
  const result = validateConfig(config);
  assert.equal(result.valid, true, 'missing API key should not block startup');
  assert.ok(result.warnings.some((w) => w.code === 'LLM_NO_API_KEY'));
  assert.ok(!result.errors.some((e) => e.code === 'LLM_NO_API_KEY'));
});

test('C.1 validate: no search provider emits warning', () => {
  const config = loadConfig({ searchProvider: 'none' });
  const result = validateConfig(config);
  assert.ok(result.warnings.some((w) => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));
});

test('C.1 validate: cortex enabled without base URL is error', () => {
  const config = loadConfig({ cortexEnabled: true, cortexBaseUrl: '' });
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'CORTEX_NO_BASE_URL'));
});

test('C.1 validate: budget guards disabled is warning', () => {
  const config = loadConfig({ llmDisableBudgetGuards: true });
  const result = validateConfig(config);
  assert.ok(result.warnings.some((w) => w.code === 'BUDGET_GUARDS_DISABLED'));
});

// =========================================================================
// SECTION 3: Valid configuration passes
// =========================================================================

test('C.1 validate: default config with everything disabled is valid', () => {
  const config = loadConfig();
  const result = validateConfig(config);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('C.1 validate: LLM enabled with API key is valid', () => {
  const config = loadConfig({
    llmApiKey: 'sk-test-key-123'
  });
  const result = validateConfig(config);
  assert.ok(!result.errors.some((e) => e.code === 'LLM_NO_API_KEY'));
});

test('C.1 validate: search provider configured does not emit discovery warning', () => {
  const config = loadConfig({
    searchProvider: 'searxng'
  });
  const result = validateConfig(config);
  assert.ok(!result.warnings.some((w) => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));
});

// =========================================================================
// SECTION 4: Run profile is always standard (profiles retired)
// =========================================================================

test('C.1 profile: runProfile is always standard regardless of input', () => {
  assert.equal(loadConfig({ runProfile: 'thorough' }).runProfile, 'standard');
  assert.equal(loadConfig({ runProfile: 'fast' }).runProfile, 'standard');
  assert.equal(loadConfig({ runProfile: 'xyzinvalid' }).runProfile, 'standard');
  assert.equal(loadConfig().runProfile, 'standard');
});

// =========================================================================
// SECTION 5: Override precedence
// =========================================================================

test('C.1 overrides: localMode forces outputMode to local', () => {
  const config = loadConfig({ localMode: true });
  assert.equal(config.outputMode, 'local');
  assert.equal(config.mirrorToS3, false);
});

// =========================================================================
// SECTION 6: Edge cases
// =========================================================================

test('C.1 edge: negative values handled gracefully', () => {
  const config = loadConfig({
    maxUrlsPerProduct: -5,
    maxRunSeconds: -100
  });
  assert.equal(typeof config.maxUrlsPerProduct, 'number');
  assert.equal(typeof config.maxRunSeconds, 'number');
});
