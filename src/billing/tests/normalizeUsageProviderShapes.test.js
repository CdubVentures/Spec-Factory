import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsage } from '../costRates.js';

// WHY: Cached-token fields live at different paths across providers.
// normalizeUsage must read all real provider shapes so computeLlmCostUsd
// applies the cache discount instead of billing every token at full rate.

test('normalizeUsage: reads OpenAI prompt_tokens_details.cached_tokens (nested)', () => {
  const result = normalizeUsage({
    prompt_tokens: 2000,
    completion_tokens: 300,
    total_tokens: 2300,
    prompt_tokens_details: { cached_tokens: 1800 },
  });
  assert.equal(result.cachedPromptTokens, 1800);
  assert.equal(result.promptTokens, 2000);
});

test('normalizeUsage: reads Anthropic cache_read_input_tokens', () => {
  const result = normalizeUsage({
    input_tokens: 200,
    output_tokens: 500,
    cache_read_input_tokens: 1800,
    cache_creation_input_tokens: 0,
  });
  assert.equal(result.cachedPromptTokens, 1800);
  assert.equal(result.completionTokens, 500);
});

test('normalizeUsage: reads DeepSeek prompt_cache_hit_tokens', () => {
  const result = normalizeUsage({
    prompt_tokens: 2500,
    completion_tokens: 400,
    prompt_cache_hit_tokens: 2100,
    prompt_cache_miss_tokens: 400,
    total_tokens: 2900,
  });
  assert.equal(result.cachedPromptTokens, 2100);
});

test('normalizeUsage: prefers direct cached_prompt_tokens over nested details', () => {
  const result = normalizeUsage({
    prompt_tokens: 2000,
    cached_prompt_tokens: 500,
    prompt_tokens_details: { cached_tokens: 1800 },
  });
  assert.equal(result.cachedPromptTokens, 500);
});

test('normalizeUsage: tolerates malformed prompt_tokens_details', () => {
  const result = normalizeUsage({
    prompt_tokens: 2000,
    prompt_tokens_details: 'not-an-object',
  });
  assert.equal(result.cachedPromptTokens, 0);
});
