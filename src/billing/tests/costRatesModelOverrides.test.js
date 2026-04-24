import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLlmCostUsd, normalizeCostRates, normalizeUsage } from '../costRates.js';

function makeRegistry() {
  return JSON.stringify([
    {
      id: 'default-openai',
      name: 'OpenAI',
      type: 'openai-compatible',
      models: [
        {
          id: 'api-gpt55',
          modelId: 'gpt-5.5',
          costInputPer1M: 5,
          costOutputPer1M: 30,
          costCachedPer1M: 0.5,
        },
      ],
    },
    {
      id: 'lab-openai',
      name: 'LLM Lab OpenAI',
      type: 'openai-compatible',
      accessMode: 'lab',
      models: [
        {
          id: 'lab-gpt55',
          modelId: 'gpt-5.5',
          costInputPer1M: 6,
          costOutputPer1M: 36,
          costCachedPer1M: 0.6,
        },
      ],
    },
  ]);
}

test('computeLlmCostUsd resolves provider-specific pricing from the model registry only', () => {
  const usage = normalizeUsage({
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000,
    cached_prompt_tokens: 500_000
  });
  const rates = normalizeCostRates({
    llmProviderRegistryJson: makeRegistry(),
    llmModelPricingMap: {
      'gpt-5.5': { inputPer1M: 99, outputPer1M: 99, cachedInputPer1M: 99 },
    },
    llmCostInputPer1M: 99,
    llmCostOutputPer1M: 99,
    llmCostCachedInputPer1M: 99,
  });
  const result = computeLlmCostUsd({
    usage,
    model: 'gpt-5.5',
    provider: 'lab-openai',
    rates,
  });
  // input: 0.5M*6=3, output:1M*36=36, cached:0.5M*0.6=0.3 -> 39.3
  assert.equal(result.costUsd, 39.3);
});

test('computeLlmCostUsd returns zero when a model is not present in the registry', () => {
  const usage = normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 1000,
  });
  const rates = normalizeCostRates({
    llmProviderRegistryJson: makeRegistry(),
    llmCostInputPer1M: 99,
    llmCostOutputPer1M: 99,
  });
  const result = computeLlmCostUsd({
    usage,
    model: 'not-in-registry',
    provider: 'default-openai',
    rates,
  });
  assert.equal(result.costUsd, 0);
});
