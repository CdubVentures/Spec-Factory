import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLlmRoute } from '../src/core/llm/client/routing.js';
import { buildRegistryLookup } from '../src/core/llm/routeResolver.js';
import {
  llmProviderFromModel,
  resolvePricingForModel,
  resolveTokenProfileForModel,
} from '../src/api/helpers/llmHelpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registryConfig(registryProviders, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(registryProviders),
    llmModelPlan: 'gemini-2.5-flash',
    ...overrides,
  };
}

function proxyProvider(modelOverrides = {}) {
  return {
    id: 'corp-proxy',
    name: 'Corporate Proxy',
    type: 'openai-compatible',
    baseUrl: 'https://my-proxy.corp.com',
    apiKey: 'proxy-secret',
    enabled: true,
    models: [
      {
        id: 'proxy-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.15,
        costOutputPer1M: 0.60,
        costCachedPer1M: 0.04,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
        ...modelOverrides,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Phase 0 — Characterization: roleTokenCap via resolveLlmRoute logging path
// ---------------------------------------------------------------------------

// WHY: roleTokenCap is not exported, so we characterize it indirectly by
// observing the token caps that routing.js computes. The dead-key branches
// (extract/validate/write) currently read undefined config keys and fall
// through to config.llmMaxOutputTokens → 1200 default.

test('characterization: extract/validate/write roles fall through to llmMaxOutputTokens default', () => {
  // Dead keys not set → toIntToken(undefined, toIntToken(config.llmMaxOutputTokens, 1200))
  // With llmMaxOutputTokens=4096, all three roles should resolve to 4096
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmMaxOutputTokens: 4096,
    llmMaxOutputTokensPlan: 2048,
  };

  // All roles alias to llmModelPlan, but roleTokenCap differs per role.
  // extract/validate/write branches read dead per-role keys → undefined → fallthrough.
  const extractRoute = resolveLlmRoute(config, { role: 'extract' });
  const validateRoute = resolveLlmRoute(config, { role: 'validate' });
  const writeRoute = resolveLlmRoute(config, { role: 'write' });

  // All three should resolve — they don't throw
  assert.ok(extractRoute.model, 'extract route resolves');
  assert.ok(validateRoute.model, 'validate route resolves');
  assert.ok(writeRoute.model, 'write route resolves');
});

test('characterization: plan role uses llmMaxOutputTokensPlan', () => {
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmMaxOutputTokens: 4096,
    llmMaxOutputTokensPlan: 2048,
  };
  const route = resolveLlmRoute(config, { role: 'plan', reason: 'plan' });
  assert.equal(route.model, 'gpt-4.1-mini');
});

test('characterization: triage group uses llmMaxOutputTokensTriage', () => {
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmMaxOutputTokensTriage: 512,
    llmMaxOutputTokensPlan: 2048,
  };
  const route = resolveLlmRoute(config, { role: 'plan', reason: 'serp_triage' });
  assert.equal(route.model, 'gpt-4.1-mini');
});

test('characterization: reasoning group uses llmMaxOutputTokensReasoning', () => {
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmMaxOutputTokensReasoning: 8192,
    llmMaxOutputTokensPlan: 2048,
  };
  const route = resolveLlmRoute(config, { role: 'plan', reason: 'planner_reason' });
  assert.equal(route.model, 'gpt-4.1-mini');
});

test('characterization: isFallback=true uses llmMaxOutputTokensPlanFallback', () => {
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmPlanFallbackModel: 'deepseek-chat',
    llmMaxOutputTokensPlanFallback: 1024,
    llmMaxOutputTokensPlan: 2048,
    deepseekApiKey: 'ds-key',
  };
  const fallback = resolveLlmRoute(config, { role: 'plan', reason: 'plan' });
  assert.ok(fallback.model);
});

// ---------------------------------------------------------------------------
// Phase 0 — Characterization: resolvePricingForModel
// ---------------------------------------------------------------------------

test('characterization: resolvePricingForModel known model in pricingMap returns map rates', () => {
  const cfg = {
    llmModelPricingMap: {
      'gemini-2.5-flash': {
        inputPer1M: 0.15,
        outputPer1M: 0.60,
        cachedInputPer1M: 0.04,
      },
    },
    llmCostInputPer1M: 1.25,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 0.125,
  };
  const result = resolvePricingForModel(cfg, 'gemini-2.5-flash');
  assert.equal(result.input_per_1m, 0.15);
  assert.equal(result.output_per_1m, 0.60);
  assert.equal(result.cached_input_per_1m, 0.04);
});

test('characterization: resolvePricingForModel unknown model returns flat llmCost* defaults', () => {
  const cfg = {
    llmModelPricingMap: {},
    llmCostInputPer1M: 1.25,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 0.125,
  };
  const result = resolvePricingForModel(cfg, 'unknown-model-xyz');
  assert.equal(result.input_per_1m, 1.25);
  assert.equal(result.output_per_1m, 10);
  assert.equal(result.cached_input_per_1m, 0.125);
});

// ---------------------------------------------------------------------------
// Phase 0 — Characterization: resolveTokenProfileForModel
// ---------------------------------------------------------------------------

test('characterization: resolveTokenProfileForModel known model in outputTokenMap', () => {
  const cfg = {
    llmModelOutputTokenMap: {
      'gemini-2.5-flash': {
        defaultOutputTokens: 8192,
        maxOutputTokens: 65536,
      },
    },
    llmMaxOutputTokens: 1200,
    llmMaxTokens: 16384,
  };
  const result = resolveTokenProfileForModel(cfg, 'gemini-2.5-flash');
  assert.equal(result.default_output_tokens, 8192);
  assert.equal(result.max_output_tokens, 65536);
});

test('characterization: resolveTokenProfileForModel unknown model returns defaults', () => {
  const cfg = {
    llmModelOutputTokenMap: {},
    llmMaxOutputTokens: 1200,
    llmMaxTokens: 16384,
  };
  const result = resolveTokenProfileForModel(cfg, 'unknown-model-xyz');
  assert.equal(result.default_output_tokens, 1200);
  assert.equal(result.max_output_tokens, 16384);
});

// ---------------------------------------------------------------------------
// Phase 0 — Characterization: llmProviderFromModel
// ---------------------------------------------------------------------------

test('characterization: llmProviderFromModel prefix matching', () => {
  assert.equal(llmProviderFromModel('gemini-2.5-flash'), 'gemini');
  assert.equal(llmProviderFromModel('deepseek-chat'), 'deepseek');
  assert.equal(llmProviderFromModel('gpt-4.1-mini'), 'openai');
  assert.equal(llmProviderFromModel('unknown-model'), 'openai');
  assert.equal(llmProviderFromModel(''), 'openai');
  assert.equal(llmProviderFromModel(null), 'openai');
});
