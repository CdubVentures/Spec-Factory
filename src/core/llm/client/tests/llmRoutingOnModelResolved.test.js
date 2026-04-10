// WHY: callLlmWithRouting must fire onModelResolved before each LLM dispatch
// so the operations tracker can show which model is handling a request,
// and update in real-time if the fallback fires.

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../../routeResolver.js';

// ---------------------------------------------------------------------------
// Mock callLlmProvider before importing routing.js
// ---------------------------------------------------------------------------
const calls = [];
let shouldFailPrimary = false;

mock.module('../llmClient.js', {
  namedExports: {
    callLlmProvider: async (args) => {
      calls.push(args);
      if (shouldFailPrimary && calls.length === 1) throw new Error('primary-fail-stub');
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

function baseConfig() {
  const registry = makeRegistry();
  return {
    _registryLookup: buildRegistryLookup(registry),
    llmModelPlan: 'model-a',
    llmPlanFallbackModel: 'model-b',
    llmMaxOutputTokensPlan: 1400,
    llmMaxOutputTokensPlanFallback: 2048,
    llmTimeoutMs: 30000,
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
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('callLlmWithRouting — onModelResolved callback', () => {
  beforeEach(() => {
    calls.length = 0;
    shouldFailPrimary = false;
  });

  it('fires once with isFallback=false when primary succeeds', async () => {
    const resolved = [];
    await callLlmWithRouting({
      config: baseConfig(),
      reason: 'needset_search_planner',
      role: 'plan',
      phase: 'needset',
      system: 'test',
      user: 'test',
      onModelResolved: (info) => resolved.push(info),
    });
    assert.equal(resolved.length, 1, 'should fire exactly once');
    assert.equal(resolved[0].model, 'model-a');
    assert.equal(resolved[0].isFallback, false);
  });

  it('fires twice when primary fails and fallback succeeds', async () => {
    shouldFailPrimary = true;
    const resolved = [];
    await callLlmWithRouting({
      config: baseConfig(),
      reason: 'needset_search_planner',
      role: 'plan',
      phase: 'needset',
      system: 'test',
      user: 'test',
      onModelResolved: (info) => resolved.push(info),
    });
    assert.equal(resolved.length, 2, 'should fire for primary then fallback');
    assert.equal(resolved[0].model, 'model-a');
    assert.equal(resolved[0].isFallback, false);
    assert.equal(resolved[1].model, 'model-b');
    assert.equal(resolved[1].isFallback, true);
  });

  it('does not crash when onModelResolved is not provided', async () => {
    await assert.doesNotReject(
      callLlmWithRouting({
        config: baseConfig(),
        reason: 'needset_search_planner',
        role: 'plan',
        phase: 'needset',
        system: 'test',
        user: 'test',
      }),
    );
  });
});
