import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../routeResolver.js';
import {
  llmProviderFromModel,
  resolvePricingForModel,
  resolveTokenProfileForModel,
} from '../../../api/helpers/llmHelpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flashProvider() {
  return {
    id: 'default-gemini',
    name: 'Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: 'gem-key',
    enabled: true,
    models: [
      {
        id: 'flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.15,
        costOutputPer1M: 0.60,
        costCachedPer1M: 0.04,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
    ],
  };
}

function cfgWithRegistry(providers, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(providers),
    llmCostInputPer1M: 1.25,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 0.125,
    llmMaxOutputTokens: 1200,
    llmMaxTokens: 16384,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — resolvePricingForModel: registry-first
// ---------------------------------------------------------------------------

test('resolvePricingForModel: registry model returns registry costs', () => {
  const cfg = cfgWithRegistry([flashProvider()], {
    llmModelPricingMap: {
      'gemini-2.5-flash': {
        inputPer1M: 99, outputPer1M: 99, cachedInputPer1M: 99,
      },
    },
  });
  const result = resolvePricingForModel(cfg, 'gemini-2.5-flash');
  // Registry should win over pricingMap
  assert.equal(result.input_per_1m, 0.15);
  assert.equal(result.output_per_1m, 0.60);
  assert.equal(result.cached_input_per_1m, 0.04);
});

test('resolvePricingForModel: non-registry model falls back to pricingMap', () => {
  const cfg = cfgWithRegistry([flashProvider()], {
    llmModelPricingMap: {
      'custom-model': {
        inputPer1M: 2.0, outputPer1M: 8.0, cachedInputPer1M: 0.5,
      },
    },
  });
  const result = resolvePricingForModel(cfg, 'custom-model');
  assert.equal(result.input_per_1m, 2.0);
  assert.equal(result.output_per_1m, 8.0);
  assert.equal(result.cached_input_per_1m, 0.5);
});

test('resolvePricingForModel: unknown model with no registry returns flat defaults', () => {
  const cfg = cfgWithRegistry([flashProvider()]);
  const result = resolvePricingForModel(cfg, 'unknown-model-xyz');
  assert.equal(result.input_per_1m, 1.25);
  assert.equal(result.output_per_1m, 10);
  assert.equal(result.cached_input_per_1m, 0.125);
});

// ---------------------------------------------------------------------------
// Phase 3 — resolveTokenProfileForModel: registry-first
// ---------------------------------------------------------------------------

test('resolveTokenProfileForModel: registry model returns registry token profile', () => {
  const cfg = cfgWithRegistry([flashProvider()], {
    llmModelOutputTokenMap: {
      'gemini-2.5-flash': {
        defaultOutputTokens: 999, maxOutputTokens: 999,
      },
    },
  });
  const result = resolveTokenProfileForModel(cfg, 'gemini-2.5-flash');
  // Registry should win — maxOutputTokens: 65536 from registry
  assert.equal(result.max_output_tokens, 65536);
});

test('resolveTokenProfileForModel: non-registry model falls back to outputTokenMap', () => {
  const cfg = cfgWithRegistry([flashProvider()], {
    llmModelOutputTokenMap: {
      'custom-model': {
        defaultOutputTokens: 2048, maxOutputTokens: 32768,
      },
    },
  });
  const result = resolveTokenProfileForModel(cfg, 'custom-model');
  assert.equal(result.default_output_tokens, 2048);
  assert.equal(result.max_output_tokens, 32768);
});

test('resolveTokenProfileForModel: unknown model returns config defaults', () => {
  const cfg = cfgWithRegistry([flashProvider()]);
  const result = resolveTokenProfileForModel(cfg, 'unknown-model-xyz');
  assert.equal(result.default_output_tokens, 1200);
  assert.equal(result.max_output_tokens, 16384);
});

// ---------------------------------------------------------------------------
// Phase 4 — llmProviderFromModel: registry-aware
// ---------------------------------------------------------------------------

test('llmProviderFromModel: registry lookup returns registry providerType', () => {
  const lookup = buildRegistryLookup([flashProvider()]);
  const result = llmProviderFromModel('gemini-2.5-flash', lookup);
  assert.equal(result, 'openai-compatible');
});

test('llmProviderFromModel: no registry lookup falls back to prefix matching', () => {
  assert.equal(llmProviderFromModel('gemini-2.5-flash', null), 'gemini');
  assert.equal(llmProviderFromModel('gemini-2.5-flash'), 'gemini');
});

test('llmProviderFromModel: unknown model in registry falls back to prefix', () => {
  const lookup = buildRegistryLookup([flashProvider()]);
  const result = llmProviderFromModel('unknown-model', lookup);
  assert.equal(result, 'openai');
});
