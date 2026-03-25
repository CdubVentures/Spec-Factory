import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig } from '../../../config.js';

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
  assert.equal(typeof config.llmProvider, 'string');
});

test('C.1 config defaults: userAgent is normalized without surrounding quotes', () => {
  const config = loadConfig();
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

// WHY: pageGotoTimeoutMs, postLoadWaitMs, frontierBlockedDomainThreshold removed from registry —
// they are now hardcoded in crawl/frontier modules.

test('C.1 config defaults: retired bingSearchEndpoint knob is absent', () => {
  const config = loadConfig();
  assert.equal(Object.hasOwn(config, 'bingSearchEndpoint'), false);
});



// =========================================================================
// SECTION 2: Config validation detects misconfigurations
// =========================================================================

test('C.1 validate: LLM always-on without API key is warning (not error)', () => {
  const config = loadConfig();
  const result = validateConfig(config);
  assert.equal(result.valid, true, 'missing API key should not block startup');
  assert.ok(result.warnings.some((w) => w.code === 'LLM_NO_API_KEY'));
  assert.ok(!result.errors.some((e) => e.code === 'LLM_NO_API_KEY'));
});

test('C.1 validate: no search provider emits warning', () => {
  const config = loadConfig({ searchEngines: '' });
  const result = validateConfig(config);
  assert.ok(result.warnings.some((w) => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));
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

test('C.1 validate: LLM enabled with provider API key is valid', () => {
  const config = loadConfig({
    geminiApiKey: 'gem-test-key-123'
  });
  const result = validateConfig(config);
  assert.ok(!result.errors.some((e) => e.code === 'LLM_NO_API_KEY'));
});

test('C.1 validate: search provider configured does not emit discovery warning', () => {
  const config = loadConfig({
    searchEngines: 'bing,brave,duckduckgo'
  });
  const result = validateConfig(config);
  assert.ok(!result.warnings.some((w) => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));
});

// WHY: Section 4 (runProfile) removed — runProfile retired.

// WHY: Section 5 (localMode forces outputMode) removed — outputMode/mirrorToS3 settings retired.

// =========================================================================
// SECTION 6: Edge cases
// =========================================================================

test('C.1 edge: negative values handled gracefully', () => {
  const config = loadConfig({
    maxRunSeconds: -100
  });
  assert.equal(typeof config.maxRunSeconds, 'number');
});
