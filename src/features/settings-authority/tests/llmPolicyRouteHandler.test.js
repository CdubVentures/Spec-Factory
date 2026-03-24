import test from 'node:test';
import assert from 'node:assert/strict';

import { createLlmPolicyHandler } from '../llmPolicyHandler.js';
import { LLM_POLICY_FLAT_KEYS } from '../../../core/llm/llmPolicySchema.js';

function buildHandler(configOverrides = {}, persistenceOverrides = {}) {
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmProvider: 'gemini',
    llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    llmPlanProvider: 'gemini',
    llmPlanBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    geminiApiKey: 'gk-secret-123',
    deepseekApiKey: '',
    anthropicApiKey: '',
    openaiApiKey: '',
    llmPlanApiKey: '',
    llmMaxOutputTokens: 1400,
    llmMaxTokens: 16384,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensReasoning: 4096,
    llmMaxOutputTokensPlanFallback: 2048,
    llmMaxOutputTokensReasoningFallback: 2048,
    llmPlanUseReasoning: false,
    llmReasoningBudget: 32768,
    llmReasoningMode: true,
    llmPhaseOverridesJson: '{}',
    llmProviderRegistryJson: '[]',
    llmMonthlyBudgetUsd: 300,
    llmPerProductBudgetUsd: 0.35,
    llmCostInputPer1M: 1.25,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 0.125,
    llmTimeoutMs: 30000,
    ...configOverrides,
  };

  let lastResponse = null;
  let persistedRuntime = null;
  const broadcastCalls = [];

  const handler = createLlmPolicyHandler({
    jsonRes: (_res, status, body) => { lastResponse = { status, body }; },
    readJsonBody: async () => lastResponse?._putBody || {},
    config,
    broadcastWs: (event, payload) => broadcastCalls.push({ event, payload }),
    persistenceCtx: {
      getUserSettingsState: () => ({ runtime: {} }),
      persistCanonicalSections: async (sections) => {
        persistedRuntime = sections.runtime;
        return { legacy: { runtime: sections.runtime } };
      },
      persistLegacySettingsFile: async () => {},
      recordRouteWriteAttempt: () => {},
      recordRouteWriteOutcome: () => {},
      ...persistenceOverrides,
    },
  });

  return {
    config,
    handler,
    getResponse: () => lastResponse,
    getPersistedRuntime: () => persistedRuntime,
    getBroadcasts: () => broadcastCalls,
    async get() {
      lastResponse = null;
      await handler(['llm-policy'], {}, 'GET', {}, {});
      return lastResponse;
    },
    async put(policy) {
      lastResponse = { _putBody: policy };
      await handler(['llm-policy'], {}, 'PUT', {}, {});
      return lastResponse;
    },
  };
}

test('GET /llm-policy returns assembled composite with correct structure', async () => {
  const ctx = buildHandler();
  const res = await ctx.get();

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  const policy = res.body.policy;
  assert.equal(policy.models.plan, 'gemini-2.5-flash');
  assert.equal(policy.models.reasoning, 'deepseek-reasoner');
  assert.equal(policy.tokens.plan, 4096);
  assert.equal(policy.reasoning.enabled, false);
  assert.deepStrictEqual(policy.phaseOverrides, {});
  assert.ok(Array.isArray(policy.providerRegistry));
});

test('GET /llm-policy returns API keys unmasked (matches /runtime-settings pattern)', async () => {
  const ctx = buildHandler({ geminiApiKey: 'gk-secret-value' });
  const res = await ctx.get();

  assert.equal(res.body.policy.apiKeys.gemini, 'gk-secret-value');
});

test('PUT then GET round-trip preserves API keys (no secret corruption)', async () => {
  const ctx = buildHandler({ geminiApiKey: 'original-key' });
  const getRes = await ctx.get();
  const policy = getRes.body.policy;
  // Simulate editing an unrelated field and saving back
  policy.tokens.plan = 9999;
  await ctx.put(policy);
  const afterRes = await ctx.get();
  assert.equal(afterRes.body.policy.apiKeys.gemini, 'original-key');
  assert.equal(afterRes.body.policy.tokens.plan, 9999);
});

test('PUT /llm-policy applies composite and returns updated policy', async () => {
  const ctx = buildHandler();
  const res = await ctx.put({
    models: { plan: 'new-model', reasoning: 'new-reason', planFallback: 'fb', reasoningFallback: 'rfb' },
    provider: { id: 'openai', baseUrl: 'https://api.openai.com', planProvider: '', planBaseUrl: '' },
    apiKeys: { gemini: '', deepseek: '', anthropic: '', openai: 'sk-test', plan: '' },
    tokens: { maxOutput: 1400, maxTokens: 16384, plan: 8192, reasoning: 4096, planFallback: 2048, reasoningFallback: 2048 },
    reasoning: { enabled: true, budget: 32768, mode: true },
    phaseOverrides: {},
    providerRegistry: [],
    budget: { monthlyUsd: 300, perProductUsd: 0.35, costInputPer1M: 1.25, costOutputPer1M: 10, costCachedInputPer1M: 0.125 },
    timeoutMs: 30000,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(ctx.config.llmModelPlan, 'new-model');
  assert.equal(ctx.config.llmPlanUseReasoning, true);
  assert.equal(ctx.config.llmMaxOutputTokensPlan, 8192);
});

test('PUT /llm-policy persists flat keys to canonical sections', async () => {
  const ctx = buildHandler();
  await ctx.put({
    models: { plan: 'persisted-model', reasoning: 'r', planFallback: '', reasoningFallback: '' },
    provider: { id: '', baseUrl: '', planProvider: '', planBaseUrl: '' },
    apiKeys: { gemini: '', deepseek: '', anthropic: '', openai: '', plan: '' },
    tokens: { maxOutput: 1400, maxTokens: 16384, plan: 4096, reasoning: 4096, planFallback: 2048, reasoningFallback: 2048 },
    reasoning: { enabled: false, budget: 32768, mode: true },
    phaseOverrides: {},
    providerRegistry: [],
    budget: { monthlyUsd: 300, perProductUsd: 0.35, costInputPer1M: 1.25, costOutputPer1M: 10, costCachedInputPer1M: 0.125 },
    timeoutMs: 30000,
  });

  const persisted = ctx.getPersistedRuntime();
  assert.ok(persisted);
  assert.equal(persisted.llmModelPlan, 'persisted-model');
});

test('PUT /llm-policy emits data change broadcast', async () => {
  const ctx = buildHandler();
  await ctx.put({
    models: { plan: 'x', reasoning: '', planFallback: '', reasoningFallback: '' },
    provider: { id: '', baseUrl: '', planProvider: '', planBaseUrl: '' },
    apiKeys: { gemini: '', deepseek: '', anthropic: '', openai: '', plan: '' },
    tokens: { maxOutput: 0, maxTokens: 0, plan: 0, reasoning: 0, planFallback: 0, reasoningFallback: 0 },
    reasoning: { enabled: false, budget: 0, mode: false },
    phaseOverrides: {},
    providerRegistry: [],
    budget: { monthlyUsd: 0, perProductUsd: 0, costInputPer1M: 0, costOutputPer1M: 0, costCachedInputPer1M: 0 },
    timeoutMs: 0,
  });

  const broadcasts = ctx.getBroadcasts();
  assert.ok(broadcasts.length > 0);
});

test('handler returns false for non-matching route', async () => {
  const ctx = buildHandler();
  let responded = false;
  const result = await ctx.handler(['other-route'], {}, 'GET', {}, {});
  assert.equal(result, false);
});
