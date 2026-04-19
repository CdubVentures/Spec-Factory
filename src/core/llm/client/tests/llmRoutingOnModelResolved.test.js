// WHY: callLlmWithRouting must fire onModelResolved before each LLM dispatch
// so the operations tracker can show which model is handling a request,
// and update in real-time if the fallback fires.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../../routeResolver.js';
import { callLlmWithRouting } from '../routing.js';

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

// WHY: Stub global.fetch to control primary success/failure and observe calls.
// Mirrors the pattern used by the passing tests in llmRouting.test.js.
function installFetchStub({ failPrimary = false } = {}) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    if (failPrimary && calls.length === 1) {
      throw new Error('primary-fail-stub');
    }
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: '{}' } }],
          model: body.model,
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });
      },
    };
  };
  return { calls, restore: () => { global.fetch = original; } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('callLlmWithRouting — onModelResolved callback', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('fires once with isFallback=false when primary succeeds', async () => {
    stub = installFetchStub();
    try {
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
    } finally {
      stub.restore();
    }
  });

  it('fires twice when primary fails and fallback succeeds', async () => {
    stub = installFetchStub({ failPrimary: true });
    try {
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
    } finally {
      stub.restore();
    }
  });

  it('does not crash when onModelResolved is not provided', async () => {
    stub = installFetchStub();
    try {
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
    } finally {
      stub.restore();
    }
  });
});
