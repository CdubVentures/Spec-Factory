// WHY: callLlmWithRouting fallback path must respect phaseDisableLimits.
// When disableLimits=true, both primary and fallback must be dispatched with
// max_tokens effectively disabled (omitted from the provider body so the
// model's hardware ceiling applies). Verified via a global.fetch stub that
// inspects the body of each outgoing call.
//
// NOTE: timeoutMs (1200000) and reasoningBudget (0) live only in the arg flow
// between routing.js and callLlmProvider — they never reach the HTTP body.
// They are exercised here as side-effects of the same branch that zeroes
// max_tokens; per-field arg-level assertions were removed with mock.module.

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

// WHY: Stub global.fetch so the primary fails (triggering fallback) and we
// can inspect the body of each outgoing dispatch.
function installFetchStub() {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    // First call = primary → throw so routing triggers fallback
    if (calls.length === 1) throw new Error('primary-fail-stub');
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

describe('callLlmWithRouting — disableLimits applies to both primary and fallback', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('needset: disableLimits=true → fallback body has no max_tokens cap', async () => {
    stub = installFetchStub();
    try {
      const config = baseConfig({ _resolvedNeedsetDisableLimits: true });
      await callLlmWithRouting({
        config,
        reason: 'needset_search_planner',
        role: 'plan',
        phase: 'needset',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls.length, 2, 'should have primary (fail) + fallback (success)');
      assert.equal(stub.calls[1].body.max_tokens, undefined,
        'fallback body must omit max_tokens when disableLimits=true');
    } finally { stub.restore(); }
  });

  it('brandResolver: disableLimits=true → fallback body has no max_tokens cap', async () => {
    stub = installFetchStub();
    try {
      const config = baseConfig({ _resolvedBrandResolverDisableLimits: true });
      await callLlmWithRouting({
        config,
        reason: 'brand_resolution',
        role: 'triage',
        phase: 'brandResolver',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[1].body.max_tokens, undefined);
    } finally { stub.restore(); }
  });

  it('serpSelector: disableLimits=true → fallback body has no max_tokens cap', async () => {
    stub = installFetchStub();
    try {
      const config = baseConfig({ _resolvedSerpSelectorDisableLimits: true });
      await callLlmWithRouting({
        config,
        reason: 'serp_url_selector',
        role: 'triage',
        phase: 'serpSelector',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[1].body.max_tokens, undefined);
    } finally { stub.restore(); }
  });

  it('needset: disableLimits=false → fallback body carries a positive max_tokens', async () => {
    stub = installFetchStub();
    try {
      const config = baseConfig({ _resolvedNeedsetDisableLimits: false });
      await callLlmWithRouting({
        config,
        reason: 'needset_search_planner',
        role: 'plan',
        phase: 'needset',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls.length, 2);
      assert.ok(Number(stub.calls[1].body.max_tokens) > 0,
        'fallback body.max_tokens must be > 0 when disableLimits=false');
    } finally { stub.restore(); }
  });
});

describe('callLlmWithRouting — fallback inherits phase call-level settings', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('fallback inherits the phase maxOutputTokens (no hidden fallback floor)', async () => {
    stub = installFetchStub();
    try {
      // Phase cap 1400, no separate fallback cap — fallback must use 1400.
      const config = baseConfig({ _resolvedNeedsetMaxOutputTokens: 1400 });
      await callLlmWithRouting({
        config,
        reason: 'needset_search_planner',
        role: 'plan',
        phase: 'needset',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls[0].body.max_tokens, 1400, 'primary uses phase cap');
      assert.equal(stub.calls[1].body.max_tokens, 1400, 'fallback also uses phase cap');
    } finally { stub.restore(); }
  });
});
