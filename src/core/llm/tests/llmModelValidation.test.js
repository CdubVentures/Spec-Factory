import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { validateModelKeysAgainstRegistry } from '../llmModelValidation.js';
import { buildRegistryLookup } from '../routeResolver.js';

function makeRegistry(modelIds = ['gemini-2.5-flash-lite', 'gpt-5-medium']) {
  return [
    {
      id: 'test-provider',
      name: 'Test Provider',
      type: 'openai-compatible',
      baseUrl: 'https://api.test.com',
      apiKey: 'sk-test',
      enabled: true,
      models: modelIds.map((modelId) => ({
        id: `model-${modelId}`,
        modelId,
        role: 'primary',
        costInputPer1M: 0.5,
        costOutputPer1M: 1.0,
        costCachedPer1M: 0.25,
        maxContextTokens: 128000,
        maxOutputTokens: 8192,
      })),
    },
  ];
}

describe('validateModelKeysAgainstRegistry', () => {
  it('returns empty array when all models exist in registry', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'gemini-2.5-flash-lite',
      llmModelReasoning: 'gpt-5-medium',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    deepStrictEqual(rejected, []);
  });

  it('rejects model IDs not in registry', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'test-persist-model-xyz',
      llmModelReasoning: 'gpt-5-medium',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    strictEqual(rejected.length, 1);
    strictEqual(rejected[0].key, 'llmModelPlan');
    strictEqual(rejected[0].value, 'test-persist-model-xyz');
  });

  it('rejects multiple invalid models', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'bogus-plan',
      llmModelReasoning: 'bogus-reasoning',
      llmPlanFallbackModel: 'gemini-2.5-flash-lite',
      llmReasoningFallbackModel: 'bogus-fallback',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    strictEqual(rejected.length, 3);
    const rejectedKeys = rejected.map((r) => r.key);
    deepStrictEqual(rejectedKeys.includes('llmModelPlan'), true);
    deepStrictEqual(rejectedKeys.includes('llmModelReasoning'), true);
    deepStrictEqual(rejectedKeys.includes('llmReasoningFallbackModel'), true);
  });

  it('allows empty string model keys (fallbacks can be unset)', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'gemini-2.5-flash-lite',
      llmModelReasoning: 'gpt-5-medium',
      llmPlanFallbackModel: '',
      llmReasoningFallbackModel: '',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    deepStrictEqual(rejected, []);
  });

  it('allows undefined/null model keys', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'gemini-2.5-flash-lite',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    deepStrictEqual(rejected, []);
  });

  it('returns empty array when registryLookup is null', () => {
    const flatKeys = { llmModelPlan: 'anything' };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, null);
    deepStrictEqual(rejected, []);
  });

  it('returns empty array when registryLookup has no modelIndex', () => {
    const flatKeys = { llmModelPlan: 'anything' };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, {});
    deepStrictEqual(rejected, []);
  });

  it('validates composite keys (providerId:modelId)', () => {
    const lookup = buildRegistryLookup(makeRegistry(['gemini-2.5-flash-lite']));
    const flatKeys = {
      llmModelPlan: 'test-provider:gemini-2.5-flash-lite',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    deepStrictEqual(rejected, []);
  });

  it('rejects invalid composite keys', () => {
    const lookup = buildRegistryLookup(makeRegistry(['gemini-2.5-flash-lite']));
    const flatKeys = {
      llmModelPlan: 'bogus-provider:gemini-2.5-flash-lite',
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    strictEqual(rejected.length, 1);
    strictEqual(rejected[0].key, 'llmModelPlan');
  });

  it('only checks the 4 model keys, ignores other flat keys', () => {
    const lookup = buildRegistryLookup(makeRegistry());
    const flatKeys = {
      llmModelPlan: 'gemini-2.5-flash-lite',
      llmProvider: 'does-not-exist',
      llmBaseUrl: 'https://bogus.invalid',
      llmMaxTokens: 99999,
    };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    deepStrictEqual(rejected, []);
  });

  it('all registry providers are valid — no enabled gate', () => {
    const registry = [{
      id: 'any-provider',
      name: 'Any',
      type: 'openai-compatible',
      baseUrl: 'https://any.com',
      apiKey: 'sk-any',
      models: [{ id: 'm1', modelId: 'any-model', role: 'primary', costInputPer1M: 0, costOutputPer1M: 0, costCachedPer1M: 0, maxContextTokens: null, maxOutputTokens: null }],
    }];
    const lookup = buildRegistryLookup(registry);
    const flatKeys = { llmModelPlan: 'any-model' };
    const rejected = validateModelKeysAgainstRegistry(flatKeys, lookup);
    strictEqual(rejected.length, 0);
  });
});
