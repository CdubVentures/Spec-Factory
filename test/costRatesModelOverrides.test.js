import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLlmCostUsd, normalizeUsage } from '../src/billing/costRates.js';

// WHY: Model-specific cost overrides via shadow config keys (llmCostInputPer1MDeepseekChat)
// were retired in favor of modelPricingCatalog + LLM_MODEL_PRICING_JSON. This test validates
// that the llmModelPricingMap path (which replaced the hardcoded if-blocks) resolves costs.
test('computeLlmCostUsd resolves deepseek-chat pricing via llmModelPricingMap', () => {
  const usage = normalizeUsage({
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000,
    cached_prompt_tokens: 500_000
  });
  const result = computeLlmCostUsd({
    usage,
    model: 'deepseek-chat',
    rates: {
      llmCostInputPer1M: 99,
      llmCostOutputPer1M: 99,
      llmCostCachedInputPer1M: 99,
      llmModelPricingMap: {
        'deepseek-chat': { inputPer1M: 0.28, outputPer1M: 0.42, cachedInputPer1M: 0.028 }
      }
    }
  });
  // input: 0.5M*0.28=0.14, output:1M*0.42=0.42, cached:0.5M*0.028=0.014 -> 0.574
  assert.equal(result.costUsd, 0.574);
});

