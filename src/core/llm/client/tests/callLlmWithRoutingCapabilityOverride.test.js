// WHY: Per-call capability override lets tier-aware callers (keyFinder tier
// bundle) supersede the phase-level `_resolved${Phase}*` reads for thinking,
// thinkingEffort, webSearch, useReasoning. Phase-level LIMITS (tokens, timeout,
// reasoning budget, disableLimits, jsonStrict) are intentionally NOT part of
// capabilityOverride — those stay shared across tiers by design.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistryLookup } from '../../routeResolver.js';
import { callLlmWithRouting } from '../routing.js';

function makeRegistry() {
  return [
    {
      id: 'prov-a',
      name: 'Primary',
      type: 'openai-compatible',
      baseUrl: 'https://primary.test',
      apiKey: 'key-a',
      models: [{ id: 'ma', modelId: 'model-a', role: 'primary' }],
    },
  ];
}

function baseConfig(phaseOverrides = {}) {
  const registry = makeRegistry();
  return {
    _registryLookup: buildRegistryLookup(registry),
    llmModelPlan: 'model-a',
    llmMaxOutputTokensPlan: 1400,
    llmMaxOutputTokensTriage: 900,
    llmTimeoutMs: 30000,

    // KeyFinder phase defaults — these are what capabilityOverride should
    // supersede. Tests that want phase-level behavior leave them as-is;
    // tests that want override behavior pass capabilityOverride explicitly.
    _resolvedKeyFinderBaseModel: 'model-a',
    _resolvedKeyFinderUseReasoning: false,
    _resolvedKeyFinderMaxOutputTokens: 1400,
    _resolvedKeyFinderTimeoutMs: 30000,
    _resolvedKeyFinderDisableLimits: false,
    _resolvedKeyFinderWebSearch: false,
    _resolvedKeyFinderThinking: false,
    _resolvedKeyFinderThinkingEffort: '',
    _resolvedKeyFinderJsonStrict: true,

    ...phaseOverrides,
  };
}

function installSuccessStub() {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
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

describe('callLlmWithRouting — capabilityOverride supersedes phase-level reads', () => {
  let stub;
  beforeEach(() => { stub?.restore?.(); stub = null; });

  it('capabilityOverride.webSearch=true beats _resolvedKeyFinderWebSearch=false', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({ _resolvedKeyFinderWebSearch: false });
      await callLlmWithRouting({
        config,
        reason: 'key_finding_medium',
        role: 'triage',
        phase: 'keyFinder',
        system: 'test',
        user: 'test',
        capabilityOverride: { webSearch: true, thinking: false, thinkingEffort: '', useReasoning: false },
      });
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].body.request_options?.web_search, true,
        'tier override must enable web_search even when phase-level is off');
    } finally { stub.restore(); }
  });

  it('capabilityOverride.thinking=true with thinkingEffort=xhigh overrides phase-level thinking=false', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        _resolvedKeyFinderThinking: false,
        _resolvedKeyFinderThinkingEffort: '',
      });
      await callLlmWithRouting({
        config,
        reason: 'key_finding_hard',
        role: 'triage',
        phase: 'keyFinder',
        system: 'test',
        user: 'test',
        capabilityOverride: { webSearch: false, thinking: true, thinkingEffort: 'xhigh', useReasoning: false },
      });
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].body.request_options?.reasoning_effort, 'xhigh',
        'tier override must send reasoning_effort=xhigh even when phase-level thinking is off');
    } finally { stub.restore(); }
  });

  it('capabilityOverride.webSearch=false + thinking=false beats phase-level truthy reads', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        _resolvedKeyFinderWebSearch: true,
        _resolvedKeyFinderThinking: true,
        _resolvedKeyFinderThinkingEffort: 'xhigh',
      });
      await callLlmWithRouting({
        config,
        reason: 'key_finding_easy',
        role: 'triage',
        phase: 'keyFinder',
        system: 'test',
        user: 'test',
        capabilityOverride: { webSearch: false, thinking: false, thinkingEffort: '', useReasoning: false },
      });
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].body.request_options?.web_search, undefined,
        'override off must suppress phase-level webSearch');
      assert.equal(stub.calls[0].body.request_options?.reasoning_effort, undefined,
        'override off must suppress phase-level thinking/effort');
    } finally { stub.restore(); }
  });

  it('no capabilityOverride → phase-level reads apply (regression guard — tier wiring does not break other phases)', async () => {
    stub = installSuccessStub();
    try {
      const config = baseConfig({
        _resolvedKeyFinderWebSearch: true,
        _resolvedKeyFinderThinking: true,
        _resolvedKeyFinderThinkingEffort: 'high',
      });
      await callLlmWithRouting({
        config,
        reason: 'key_finding_medium',
        role: 'triage',
        phase: 'keyFinder',
        system: 'test',
        user: 'test',
      });
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0].body.request_options?.web_search, true);
      assert.equal(stub.calls[0].body.request_options?.reasoning_effort, 'high');
    } finally { stub.restore(); }
  });

  it('phase-level LIMITS (maxTokens) stay invariant regardless of capabilityOverride', async () => {
    // WHY: capabilityOverride must not widen, narrow, or otherwise perturb the
    // resolved max_tokens. The limit is whatever the phase config resolves to
    // — the same value with OR without capabilityOverride.
    stub = installSuccessStub();
    try {
      const config = baseConfig({ _resolvedKeyFinderMaxOutputTokens: 1200 });
      await callLlmWithRouting({
        config, reason: 'key_finding_medium', role: 'triage', phase: 'keyFinder',
        system: 'test', user: 'test',
      });
      await callLlmWithRouting({
        config, reason: 'key_finding_medium', role: 'triage', phase: 'keyFinder',
        system: 'test', user: 'test',
        capabilityOverride: { webSearch: true, thinking: true, thinkingEffort: 'xhigh', useReasoning: false },
      });
      assert.equal(stub.calls.length, 2);
      assert.equal(stub.calls[0].body.max_tokens, stub.calls[1].body.max_tokens,
        'max_tokens must be identical across dispatches — capabilityOverride only touches the 5 capability fields');
    } finally { stub.restore(); }
  });
});
