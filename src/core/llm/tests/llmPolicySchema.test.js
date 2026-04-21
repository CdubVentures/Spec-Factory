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
    keyFinderModelEasy: 'gpt-5.4-mini',
    keyFinderModelMedium: 'gpt-5.4-mini',
    keyFinderModelHard: 'gpt-5.4',
    keyFinderModelVeryHard: 'gpt-5.4',
    keyFinderModelFallback: 'gpt-5.4',
    keyFinderBudgetFloor: 3,
    keyFinderBudgetVariantPointsPerExtra: 1,
    keyFinderBundlingEnabled: false,
    keyFinderPassengerDifficultyPolicy: 'less_or_equal',
    keyFinderBudgetRequiredPointsJson: '{"mandatory":2,"non_mandatory":1}',
    keyFinderBudgetAvailabilityPointsJson: '{"always":1,"sometimes":2,"rare":3}',
    keyFinderBudgetDifficultyPointsJson: '{"easy":1,"medium":2,"hard":3,"very_hard":4}',
    keyFinderBundlingPassengerCostJson: '{"easy":1,"medium":2,"hard":4,"very_hard":8}',
    keyFinderBundlingPoolPerPrimaryJson: '{"easy":6,"medium":4,"hard":2,"very_hard":1}',
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

test('DEFAULT_LLM_POLICY has correct structure', () => {
  assert.ok(DEFAULT_LLM_POLICY);
  assert.equal(typeof DEFAULT_LLM_POLICY.models, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.provider, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.apiKeys, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.tokens, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.reasoning, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.budget, 'object');
  assert.equal(typeof DEFAULT_LLM_POLICY.timeoutMs, 'number');
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

// WHY: keyFinder phase (Phase 2 per-key-finder roadmap) ships 14 new settings
// that compose into a `keyFinder` group on the assembled policy. Zod validates
// the 5 JSON blobs at the trust boundary so post-Phase-1 vocab is enforced.

test('keyFinder tier model scalars + budget/bundling scalars assemble into keyFinder group', () => {
  const policy = assembleLlmPolicy({
    keyFinderModelEasy: 'gpt-5.4-mini',
    keyFinderModelMedium: 'gpt-5.4-mini',
    keyFinderModelHard: 'gpt-5.4',
    keyFinderModelVeryHard: 'gpt-5.4',
    keyFinderModelFallback: 'gpt-5.4',
    keyFinderBudgetFloor: 5,
    keyFinderBudgetVariantPointsPerExtra: 2,
    keyFinderBundlingEnabled: true,
    keyFinderPassengerDifficultyPolicy: 'same_only',
  });
  assert.equal(policy.keyFinder.modelEasy, 'gpt-5.4-mini');
  assert.equal(policy.keyFinder.modelHard, 'gpt-5.4');
  assert.equal(policy.keyFinder.modelFallback, 'gpt-5.4');
  assert.equal(policy.keyFinder.budgetFloor, 5);
  assert.equal(policy.keyFinder.variantPointsPerExtra, 2);
  assert.equal(policy.keyFinder.bundlingEnabled, true);
  assert.equal(policy.keyFinder.passengerDifficultyPolicy, 'same_only');
});

test('keyFinder scalars round-trip through disassembleLlmPolicy', () => {
  const policy = assembleLlmPolicy({
    keyFinderModelEasy: 'x-mini',
    keyFinderModelMedium: 'x-mini',
    keyFinderModelHard: 'x',
    keyFinderModelVeryHard: 'x',
    keyFinderModelFallback: 'x',
    keyFinderBudgetFloor: 4,
    keyFinderBudgetVariantPointsPerExtra: 1,
    keyFinderBundlingEnabled: false,
    keyFinderPassengerDifficultyPolicy: 'less_or_equal',
  });
  const flat = disassembleLlmPolicy(policy);
  assert.equal(flat.keyFinderModelEasy, 'x-mini');
  assert.equal(flat.keyFinderBudgetFloor, 4);
  assert.equal(flat.keyFinderBundlingEnabled, false);
  assert.equal(flat.keyFinderPassengerDifficultyPolicy, 'less_or_equal');
});

test('keyFinder JSON blobs parse into structured tables (positive vocab)', () => {
  const policy = assembleLlmPolicy({
    keyFinderBudgetRequiredPointsJson: '{"mandatory":3,"non_mandatory":2}',
    keyFinderBudgetAvailabilityPointsJson: '{"always":1,"sometimes":2,"rare":3}',
    keyFinderBudgetDifficultyPointsJson: '{"easy":1,"medium":2,"hard":3,"very_hard":4}',
    keyFinderBundlingPassengerCostJson: '{"easy":1,"medium":2,"hard":4,"very_hard":8}',
    keyFinderBundlingPoolPerPrimaryJson: '{"easy":6,"medium":4,"hard":2,"very_hard":1}',
  });
  assert.equal(policy.keyFinder.budgetRequired.mandatory, 3);
  assert.equal(policy.keyFinder.budgetRequired.non_mandatory, 2);
  assert.equal(policy.keyFinder.budgetAvailability.rare, 3);
  assert.equal(policy.keyFinder.budgetDifficulty.very_hard, 4);
  assert.equal(policy.keyFinder.bundlingPassengerCost.very_hard, 8);
  assert.equal(policy.keyFinder.bundlingPoolPerPrimary.easy, 6);
});

test('keyFinder JSON blobs round-trip through disassembleLlmPolicy', () => {
  const policy = assembleLlmPolicy({
    keyFinderBudgetRequiredPointsJson: '{"mandatory":3,"non_mandatory":1}',
    keyFinderBudgetAvailabilityPointsJson: '{"always":2,"sometimes":4,"rare":6}',
    keyFinderBudgetDifficultyPointsJson: '{"easy":1,"medium":3,"hard":5,"very_hard":7}',
    keyFinderBundlingPassengerCostJson: '{"easy":1,"medium":2,"hard":4,"very_hard":8}',
    keyFinderBundlingPoolPerPrimaryJson: '{"easy":6,"medium":4,"hard":2,"very_hard":1}',
  });
  const flat = disassembleLlmPolicy(policy);
  assert.deepStrictEqual(JSON.parse(flat.keyFinderBudgetRequiredPointsJson), { mandatory: 3, non_mandatory: 1 });
  assert.deepStrictEqual(JSON.parse(flat.keyFinderBudgetAvailabilityPointsJson), { always: 2, sometimes: 4, rare: 6 });
  assert.deepStrictEqual(JSON.parse(flat.keyFinderBudgetDifficultyPointsJson), { easy: 1, medium: 3, hard: 5, very_hard: 7 });
  assert.deepStrictEqual(JSON.parse(flat.keyFinderBundlingPassengerCostJson), { easy: 1, medium: 2, hard: 4, very_hard: 8 });
  assert.deepStrictEqual(JSON.parse(flat.keyFinderBundlingPoolPerPrimaryJson), { easy: 6, medium: 4, hard: 2, very_hard: 1 });
});

test('keyFinder Zod rejects pre-Phase-1 required_level vocab (identity, critical, required, expected, optional)', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBudgetRequiredPointsJson: '{"identity":5,"critical":4,"required":3,"expected":2,"optional":1}',
  }));
});

test('keyFinder Zod rejects pre-Phase-1 availability vocab (expected, editorial_only)', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBudgetAvailabilityPointsJson: '{"always":1,"expected":2,"sometimes":3,"rare":4,"editorial_only":5}',
  }));
});

test('keyFinder Zod rejects pre-Phase-1 difficulty vocab (instrumented)', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBudgetDifficultyPointsJson: '{"easy":1,"medium":2,"hard":3,"instrumented":4}',
  }));
});

test('keyFinder Zod rejects bundling table missing a tier', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBundlingPassengerCostJson: '{"easy":1,"medium":2,"hard":4}',
  }));
  assert.throws(() => assembleLlmPolicy({
    keyFinderBundlingPoolPerPrimaryJson: '{"easy":6,"medium":4,"very_hard":1}',
  }));
});

test('keyFinder Zod rejects non-integer points', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBudgetRequiredPointsJson: '{"mandatory":2.5,"non_mandatory":1}',
  }));
  assert.throws(() => assembleLlmPolicy({
    keyFinderBudgetDifficultyPointsJson: '{"easy":1,"medium":"oops","hard":3,"very_hard":4}',
  }));
});

test('keyFinder Zod rejects negative points', () => {
  assert.throws(() => assembleLlmPolicy({
    keyFinderBundlingPassengerCostJson: '{"easy":-1,"medium":2,"hard":4,"very_hard":8}',
  }));
});

test('DEFAULT_LLM_POLICY includes keyFinder group with post-Phase-1 vocab defaults', () => {
  assert.equal(typeof DEFAULT_LLM_POLICY.keyFinder, 'object');
  assert.equal(DEFAULT_LLM_POLICY.keyFinder.budgetFloor, 3);
  assert.equal(DEFAULT_LLM_POLICY.keyFinder.variantPointsPerExtra, 1);
  assert.equal(DEFAULT_LLM_POLICY.keyFinder.bundlingEnabled, false);
  assert.equal(DEFAULT_LLM_POLICY.keyFinder.passengerDifficultyPolicy, 'less_or_equal');
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.keyFinder.budgetRequired, { mandatory: 2, non_mandatory: 1 });
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.keyFinder.budgetAvailability, { always: 1, sometimes: 2, rare: 3 });
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.keyFinder.budgetDifficulty, { easy: 1, medium: 2, hard: 3, very_hard: 4 });
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.keyFinder.bundlingPassengerCost, { easy: 1, medium: 2, hard: 4, very_hard: 8 });
  assert.deepStrictEqual(DEFAULT_LLM_POLICY.keyFinder.bundlingPoolPerPrimary, { easy: 6, medium: 4, hard: 2, very_hard: 1 });
});
