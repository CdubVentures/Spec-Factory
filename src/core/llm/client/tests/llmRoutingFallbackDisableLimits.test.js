// WHY: callLlmWithRouting fallback path did not respect phaseDisableLimits.
// When disableLimits=true, BOTH primary and fallback must get maxTokens=0
// and timeoutMs=600000. This test file uses mock.module to intercept
// callLlmProvider so we can inspect the args passed on each attempt.

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../../routeResolver.js';

// ---------------------------------------------------------------------------
// Mock callLlmProvider before importing routing.js
// ---------------------------------------------------------------------------
const calls = [];
mock.module('../llmClient.js', {
  namedExports: {
    callLlmProvider: async (args) => {
      calls.push(args);
      // First call = primary → throw so routing triggers fallback
      if (calls.length === 1) throw new Error('primary-fail-stub');
      return { content: '{}' };
    },
  },
});

const { callLlmWithRouting } = await import('../routing.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRegistry() {
  return [
    {
      id: 'prov-a',
      name: 'Primary Provider',
      type: 'openai-compatible',
      baseUrl: 'https://primary.test',
      apiKey: 'key-a',
      models: [{ id: 'ma', modelId: 'model-a', role: 'primary' }],
    },
    {
      id: 'prov-b',
      name: 'Fallback Provider',
      type: 'openai-compatible',
      baseUrl: 'https://fallback.test',
      apiKey: 'key-b',
      models: [{ id: 'mb', modelId: 'model-b', role: 'fallback' }],
    },
  ];
}

function baseConfig(phaseOverrides = {}) {
  const registry = makeRegistry();
  return {
    _registryLookup: buildRegistryLookup(registry),
    llmModelPlan: 'model-a',
    llmPlanFallbackModel: 'model-b',
    llmMaxOutputTokensPlan: 1400,
    llmMaxOutputTokensPlanFallback: 2048,
    llmMaxOutputTokensTriage: 900,
    llmTimeoutMs: 30000,
    // Phase overrides (resolved keys — normally written by configPostMerge)
    _resolvedNeedsetBaseModel: 'model-a',
    _resolvedNeedsetUseReasoning: false,
    _resolvedNeedsetFallbackModel: 'model-b',
    _resolvedNeedsetFallbackUseReasoning: false,
    _resolvedNeedsetMaxOutputTokens: 1400,
    _resolvedNeedsetTimeoutMs: 30000,
    _resolvedNeedsetDisableLimits: false,
    _resolvedNeedsetWebSearch: false,
    _resolvedNeedsetThinking: false,
    _resolvedNeedsetFallbackWebSearch: false,
    _resolvedNeedsetFallbackThinking: false,

    _resolvedBrandResolverBaseModel: 'model-a',
    _resolvedBrandResolverUseReasoning: false,
    _resolvedBrandResolverFallbackModel: 'model-b',
    _resolvedBrandResolverFallbackUseReasoning: false,
    _resolvedBrandResolverMaxOutputTokens: 1400,
    _resolvedBrandResolverTimeoutMs: 30000,
    _resolvedBrandResolverDisableLimits: false,
    _resolvedBrandResolverWebSearch: false,
    _resolvedBrandResolverThinking: false,
    _resolvedBrandResolverFallbackWebSearch: false,
    _resolvedBrandResolverFallbackThinking: false,

    _resolvedSerpSelectorBaseModel: 'model-a',
    _resolvedSerpSelectorUseReasoning: false,
    _resolvedSerpSelectorFallbackModel: 'model-b',
    _resolvedSerpSelectorFallbackUseReasoning: false,
    _resolvedSerpSelectorMaxOutputTokens: 900,
    _resolvedSerpSelectorTimeoutMs: 30000,
    _resolvedSerpSelectorDisableLimits: false,
    _resolvedSerpSelectorWebSearch: false,
    _resolvedSerpSelectorThinking: false,
    _resolvedSerpSelectorFallbackWebSearch: false,
    _resolvedSerpSelectorFallbackThinking: false,

    ...phaseOverrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('callLlmWithRouting — disableLimits applies to both primary and fallback', () => {
  beforeEach(() => { calls.length = 0; });

  it('needset: disableLimits=true → fallback gets maxTokens=0 and timeout=600000', async () => {
    const config = baseConfig({ _resolvedNeedsetDisableLimits: true });
    await callLlmWithRouting({
      config,
      reason: 'needset_search_planner',
      role: 'plan',
      phase: 'needset',
      system: 'test',
      user: 'test',
    });
    assert.equal(calls.length, 2, 'should have primary (fail) + fallback (success)');
    const fallbackCall = calls[1];
    assert.equal(fallbackCall.maxTokens, 0, 'fallback maxTokens must be 0 when disableLimits=true');
    assert.equal(fallbackCall.timeoutMs, 600000, 'fallback timeoutMs must be 600000 when disableLimits=true');
  });

  it('brandResolver: disableLimits=true → fallback gets maxTokens=0', async () => {
    const config = baseConfig({ _resolvedBrandResolverDisableLimits: true });
    await callLlmWithRouting({
      config,
      reason: 'brand_resolution',
      role: 'triage',
      phase: 'brandResolver',
      system: 'test',
      user: 'test',
    });
    assert.equal(calls.length, 2);
    const fallbackCall = calls[1];
    assert.equal(fallbackCall.maxTokens, 0, 'fallback maxTokens must be 0 when disableLimits=true');
    assert.equal(fallbackCall.timeoutMs, 600000);
  });

  it('serpSelector: disableLimits=true → fallback gets maxTokens=0', async () => {
    const config = baseConfig({ _resolvedSerpSelectorDisableLimits: true });
    await callLlmWithRouting({
      config,
      reason: 'serp_url_selector',
      role: 'triage',
      phase: 'serpSelector',
      system: 'test',
      user: 'test',
    });
    assert.equal(calls.length, 2);
    const fallbackCall = calls[1];
    assert.equal(fallbackCall.maxTokens, 0, 'fallback maxTokens must be 0 when disableLimits=true');
    assert.equal(fallbackCall.timeoutMs, 600000);
  });

  it('needset: disableLimits=false → fallback gets normal token cap', async () => {
    const config = baseConfig({ _resolvedNeedsetDisableLimits: false });
    await callLlmWithRouting({
      config,
      reason: 'needset_search_planner',
      role: 'plan',
      phase: 'needset',
      system: 'test',
      user: 'test',
    });
    assert.equal(calls.length, 2);
    const fallbackCall = calls[1];
    assert.ok(fallbackCall.maxTokens > 0, 'fallback maxTokens must be > 0 when disableLimits=false');
    assert.notEqual(fallbackCall.timeoutMs, 600000, 'timeout must not be 600000 when disableLimits=false');
  });
});
