import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleLlmPolicy,
  disassembleLlmPolicy,
  DEFAULT_LLM_POLICY,
  LLM_POLICY_FLAT_KEYS,
} from '../llmPolicySchema.js';

// WHY: Round-trip invariant is the foundation — assemble then disassemble must
// produce the same flat keys for every LLM setting in the registry.

test('assembleLlmPolicy + disassembleLlmPolicy round-trip identity', () => {
  const flatInput = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmReasoningFallbackModel: 'gemini-2.5-pro',
    llmProvider: 'gemini',
    llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    geminiApiKey: 'gk-test',
    deepseekApiKey: 'dk-test',
    anthropicApiKey: 'ak-test',
    openaiApiKey: 'ok-test',
    llmMaxOutputTokens: 1400,
    llmMaxTokens: 16384,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensTriage: 20000,
    llmMaxOutputTokensReasoning: 4096,
    llmPlanUseReasoning: false,
    llmReasoningBudget: 32768,
    llmReasoningMode: true,
    llmPhaseOverridesJson: '{"needset":{"baseModel":"override-model"}}',
    llmProviderRegistryJson: '[{"id":"test"}]',
    llmCostInputPer1M: 1.25,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 0.125,
    llmTimeoutMs: 30000,
    llmLabQueueDelayMs: 1000,
    llmOperationStreamingMode: 'adaptive',
    llmOperationStreamingMaxActiveOps: 10,
    llmOperationStreamingFlushMs: 250,
    keyFinderTierSettingsJson: JSON.stringify({
      easy:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
      medium:    { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
      hard:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
      very_hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
      fallback:  { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    }),
  };

  const policy = assembleLlmPolicy(flatInput);
  const roundTripped = disassembleLlmPolicy(policy);

  for (const key of LLM_POLICY_FLAT_KEYS) {
    assert.deepStrictEqual(
      roundTripped[key],
      flatInput[key],
      `Round-trip mismatch for key: ${key}`
    );
  }
});

test('assembleLlmPolicy structures flat keys into groups', () => {
  const policy = assembleLlmPolicy({
    llmModelPlan: 'test-model',
    llmMaxOutputTokensPlan: 8192,
    llmPlanUseReasoning: true,
    llmReasoningBudget: 16384,
    llmCostInputPer1M: 1.5,
    llmCostOutputPer1M: 12,
    llmCostCachedInputPer1M: 0.2,
    llmPhaseOverridesJson: '{"needset":{"baseModel":"custom"}}',
    llmProviderRegistryJson: '[{"id":"p1","name":"Test"}]',
  });

  assert.equal(policy.models.plan, 'test-model');
  assert.equal(policy.tokens.plan, 8192);
  assert.equal(policy.reasoning.enabled, true);
  assert.equal(policy.reasoning.budget, 16384);
  assert.equal(policy.budget.costInputPer1M, 1.5);
  assert.equal(policy.budget.costOutputPer1M, 12);
  assert.equal(policy.budget.costCachedInputPer1M, 0.2);
  assert.deepStrictEqual(policy.phaseOverrides, { needset: { baseModel: 'custom' } });
  assert.deepStrictEqual(policy.providerRegistry, [{ id: 'p1', name: 'Test' }]);
});

test('assembleLlmPolicy uses defaults for missing keys', () => {
  const policy = assembleLlmPolicy({});

  assert.equal(typeof policy.models.plan, 'string');
  assert.equal(typeof policy.tokens.plan, 'number');
  assert.equal(typeof policy.reasoning.enabled, 'boolean');
  assert.deepStrictEqual(policy.phaseOverrides, {});
  assert.ok(Array.isArray(policy.providerRegistry));
});

test('disassembleLlmPolicy flattens composite to flat keys', () => {
  const flat = disassembleLlmPolicy({
    models: { plan: 'my-model', reasoning: 'reason-model', planFallback: 'fb', reasoningFallback: 'rfb' },
    provider: { id: 'openai', baseUrl: 'https://api.openai.com', planProvider: 'openai', planBaseUrl: 'https://api.openai.com' },
    apiKeys: { gemini: '', deepseek: '', anthropic: '', openai: 'sk-test', plan: '' },
    tokens: { maxOutput: 1400, maxTokens: 16384, plan: 4096, reasoning: 4096 },
    reasoning: { enabled: true, budget: 32768, mode: true },
    phaseOverrides: { needset: { baseModel: 'custom' } },
    providerRegistry: [{ id: 'test' }],
    budget: { monthlyUsd: 300, costInputPer1M: 1.25, costOutputPer1M: 10, costCachedInputPer1M: 0.125 },
    timeoutMs: 30000,
  });

  assert.equal(flat.llmModelPlan, 'my-model');
  assert.equal(flat.llmModelReasoning, 'reason-model');
  assert.equal(flat.openaiApiKey, 'sk-test');
  assert.equal(flat.llmPlanUseReasoning, true);
  assert.equal(flat.llmPhaseOverridesJson, '{"needset":{"baseModel":"custom"}}');
  assert.equal(flat.llmProviderRegistryJson, '[{"id":"test"}]');
  assert.equal(flat.llmCostInputPer1M, 1.25);
  assert.equal(flat.llmTimeoutMs, 30000);
});

test('top-level resource policy fields round-trip through registry keys', () => {
  const policy = assembleLlmPolicy({
    llmTimeoutMs: 45000,
    llmLabQueueDelayMs: 750,
    llmOperationStreamingMode: 'adaptive',
    llmOperationStreamingMaxActiveOps: 10,
    llmOperationStreamingFlushMs: 250,
  });

  assert.equal(policy.timeoutMs, 45000);
  assert.equal(policy.labQueueDelayMs, 750);
  assert.equal(policy.operationStreamingMode, 'adaptive');
  assert.equal(policy.operationStreamingMaxActiveOps, 10);
  assert.equal(policy.operationStreamingFlushMs, 250);

  const flat = disassembleLlmPolicy(policy);
  assert.equal(flat.llmTimeoutMs, 45000);
  assert.equal(flat.llmLabQueueDelayMs, 750);
  assert.equal(flat.llmOperationStreamingMode, 'adaptive');
  assert.equal(flat.llmOperationStreamingMaxActiveOps, 10);
  assert.equal(flat.llmOperationStreamingFlushMs, 250);

  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmLabQueueDelayMs'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmOperationStreamingMode'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmOperationStreamingMaxActiveOps'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmOperationStreamingFlushMs'));
});

test('DEFAULT_LLM_POLICY has correct structure', () => {
  assert.ok(DEFAULT_LLM_POLICY);
  assert.equal(typeof DEFAULT_LLM_POLICY.models, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.provider, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.apiKeys, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.tokens, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.reasoning, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.budget, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.timeoutMs, 'number');
  assert.equal(typeof DEFAULT_LLM_POLICY.labQueueDelayMs, 'number');
  assert.equal(typeof DEFAULT_LLM_POLICY.operationStreamingMode, 'string');
  assert.equal(typeof DEFAULT_LLM_POLICY.operationStreamingMaxActiveOps, 'number');
  assert.equal(typeof DEFAULT_LLM_POLICY.operationStreamingFlushMs, 'number');
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.phaseOverrides, {});
  assert.ok(Array.isArray(DEFAULT_LLM_POLICY.providerRegistry));
});

test('LLM_POLICY_FLAT_KEYS contains expected keys', () => {
  assert.ok(LLM_POLICY_FLAT_KEYS.length >= 22);
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmModelPlan'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmProviderRegistryJson'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('geminiApiKey'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('llmMaxOutputTokensTriage'));
  assert.ok(LLM_POLICY_FLAT_KEYS.includes('openaiApiKey'));
});

test('phaseOverrides JSON round-trip preserves nested objects', () => {
  const overrides = {
    needset: { baseModel: 'a', reasoningModel: 'b', useReasoning: true, maxOutputTokens: 999 },
    serpSelector: { baseModel: 'c' },
  };
  const policy = assembleLlmPolicy({ llmPhaseOverridesJson: JSON.stringify(overrides) });
  assert.deepStrictEqual(policy.phaseOverrides, overrides);

  const flat = disassembleLlmPolicy(policy);
  assert.deepStrictEqual(JSON.parse(flat.llmPhaseOverridesJson), overrides);
});

test('providerRegistry JSON round-trip preserves array', () => {
  const registry = [{ id: 'p1', name: 'Provider', models: [{ id: 'm1' }] }];
  const policy = assembleLlmPolicy({ llmProviderRegistryJson: JSON.stringify(registry) });
  assert.deepStrictEqual(policy.providerRegistry, registry);

  const flat = disassembleLlmPolicy(policy);
  assert.deepStrictEqual(JSON.parse(flat.llmProviderRegistryJson), registry);
});

// WHY: keyFinder LLM config stores 4 difficulty tiers + 1 fallback as one JSON blob.
// Each tier is a full 6-field BASE MODEL bundle. Budget/bundling knobs live in the
// finder module's Pipeline Settings (settingsSchema), not in LLM config.

test('keyFinder tier bundle JSON parses into policy.keyFinderTiers', () => {
  const tiers = {
    easy:      { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'high',  webSearch: true },
    medium:    { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    hard:      { model: 'gpt-5.4',      useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'high',  webSearch: true },
    very_hard: { model: 'gpt-5.4',      useReasoning: true,  reasoningModel: 'gpt-5.4', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    fallback:  { model: 'gpt-5.4',      useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  };
  const policy = assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(tiers) });
  assert.equal(policy.keyFinderTiers.easy.model, 'gpt-5.4-mini');
  assert.equal(policy.keyFinderTiers.very_hard.useReasoning, true);
  assert.equal(policy.keyFinderTiers.very_hard.reasoningModel, 'gpt-5.4');
  assert.equal(policy.keyFinderTiers.fallback.thinkingEffort, 'xhigh');
});

test('keyFinder tier bundle round-trips through disassembleLlmPolicy', () => {
  const tiers = {
    easy:      { model: 'a', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '',      webSearch: false },
    medium:    { model: 'b', useReasoning: true,  reasoningModel: 'r', thinking: false, thinkingEffort: '',     webSearch: true  },
    hard:      { model: 'c', useReasoning: false, reasoningModel: '', thinking: true,  thinkingEffort: 'low',    webSearch: false },
    very_hard: { model: 'd', useReasoning: false, reasoningModel: '', thinking: true,  thinkingEffort: 'medium', webSearch: true  },
    fallback:  { model: 'e', useReasoning: false, reasoningModel: '', thinking: true,  thinkingEffort: 'xhigh',  webSearch: true  },
  };
  const policy = assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(tiers) });
  const flat = disassembleLlmPolicy(policy);
  assert.deepStrictEqual(JSON.parse(flat.keyFinderTierSettingsJson), tiers);
});

test('keyFinder Zod rejects tier bundle missing a field', () => {
  const broken = {
    easy:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium:    { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    hard:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    very_hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '' /* webSearch missing */ },
    fallback:  { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
  };
  assert.throws(() => assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(broken) }));
});

test('keyFinder Zod rejects tier bundle with unknown tier key', () => {
  const extra = {
    easy:       { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium:     { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    hard:       { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    very_hard:  { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    fallback:   { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    ultra_hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
  };
  assert.throws(() => assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(extra) }));
});

test('keyFinder Zod rejects invalid thinkingEffort enum', () => {
  const bad = {
    easy:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: 'ultra', webSearch: false },
    medium:    { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    hard:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    very_hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    fallback:  { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
  };
  assert.throws(() => assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(bad) }));
});

test('keyFinder Zod rejects non-boolean useReasoning', () => {
  const bad = {
    easy:      { model: '', useReasoning: 'yes', reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium:    { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    hard:      { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    very_hard: { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    fallback:  { model: '', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
  };
  assert.throws(() => assembleLlmPolicy({ keyFinderTierSettingsJson: JSON.stringify(bad) }));
});

test('DEFAULT_LLM_POLICY includes keyFinderTiers with fallback populated and tiers empty', () => {
  assert.equal(typeof DEFAULT_LLM_POLICY.keyFinderTiers, 'object');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.easy.model, '');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.medium.model, '');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.hard.model, '');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.very_hard.model, '');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.fallback.model, 'gpt-5.4');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.fallback.thinking, true);
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.fallback.thinkingEffort, 'xhigh');
  assert.equal(DEFAULT_LLM_POLICY.keyFinderTiers.fallback.webSearch, true);
});
