import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../src/core/config/settingsKeyMap.js';

// Lazy-import PUT map (it re-exports from its own file)
const { RUNTIME_SETTINGS_ROUTE_PUT } = await import(
  '../src/features/settings-authority/runtimeSettingsRoutePut.js'
);

const PROVIDER_OVERRIDE_KEYS = [
  'llmExtractProvider',
  'llmExtractBaseUrl',
  'llmExtractApiKey',
  'llmValidateProvider',
  'llmValidateBaseUrl',
  'llmValidateApiKey',
  'llmWriteProvider',
  'llmWriteBaseUrl',
  'llmWriteApiKey',
];

test('all 9 per-role provider override keys exist in SETTINGS_DEFAULTS.runtime', () => {
  for (const key of PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      Object.hasOwn(SETTINGS_DEFAULTS.runtime, key),
      `Missing default: ${key}`,
    );
    assert.equal(
      SETTINGS_DEFAULTS.runtime[key],
      '',
      `Default for ${key} should be empty string (fall-through to global)`,
    );
  }
});

test('all 9 per-role provider override keys are in GET stringMap', () => {
  for (const key of PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.stringMap, key),
      `Missing from GET stringMap: ${key}`,
    );
    assert.equal(
      RUNTIME_SETTINGS_ROUTE_GET.stringMap[key],
      key,
      `GET stringMap value mismatch for ${key}`,
    );
  }
});

test('all 9 per-role provider override keys are in PUT stringFreeMap', () => {
  for (const key of PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap, key),
      `Missing from PUT stringFreeMap: ${key}`,
    );
    assert.equal(
      RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap[key],
      key,
      `PUT stringFreeMap value mismatch for ${key}`,
    );
  }
});

test('normalizeProvider accepts cortex as a valid provider', async () => {
  // Import routing internals via the public resolveLlmRoute
  const { resolveLlmRoute } = await import(
    '../src/core/llm/client/routing.js'
  );

  const config = {
    llmProvider: 'cortex',
    llmBaseUrl: 'http://localhost:5001/v1',
    openaiApiKey: 'cortex-key',
    llmModelExtract: 'gpt-5-low',
    cortexBaseUrl: 'http://localhost:5001/v1',
    cortexApiKey: 'cortex-key',
  };

  const route = resolveLlmRoute(config, { reason: 'extract' });
  assert.equal(route.provider, 'cortex', 'cortex should be a recognized provider');
});

test('cortex provider resolves baseUrl and apiKey from cortex config keys', async () => {
  const { resolveLlmRoute } = await import(
    '../src/core/llm/client/routing.js'
  );

  const config = {
    llmProvider: 'cortex',
    llmModelExtract: 'gpt-5-low',
    cortexBaseUrl: 'http://localhost:5001/v1',
    cortexApiKey: 'my-cortex-key',
  };

  const route = resolveLlmRoute(config, { reason: 'extract' });
  assert.equal(route.provider, 'cortex');
  assert.equal(route.baseUrl, 'http://localhost:5001/v1');
  assert.equal(route.apiKey, 'my-cortex-key');
});
