import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrandResolverCallLlm,
} from '../brandResolverLlmAdapter.js';

function makeBrandResolution(overrides = {}) {
  return {
    official_domain: 'cougargaming.com',
    aliases: ['cougargaming.com'],
    support_domain: 'support.cougargaming.com',
    confidence: 0.98,
    reasoning: ['official product site'],
    ...overrides,
  };
}

function makeCallRoutedLlm(returnValue = {}) {
  return async () => returnValue;
}

describe('discoveryLlmAdapters', () => {
  describe('createBrandResolverCallLlm', () => {
    it('returns the brand resolution payload from the routed LLM call', async () => {
      const expected = makeBrandResolution();
      const callLlm = createBrandResolverCallLlm({
        callRoutedLlmFn: makeCallRoutedLlm(expected),
        config: { llmModelTriage: 'test-model' }
      });
      const { result } = await callLlm({ brand: 'Cougar', category: 'mouse' });
      assert.deepEqual(result, expected);
    });

    it('preserves minimal payloads when optional brand fields are absent', async () => {
      const expected = {
        official_domain: 'test.com',
        aliases: [],
        confidence: 0.98,
      };
      const callLlm = createBrandResolverCallLlm({
        callRoutedLlmFn: makeCallRoutedLlm(expected),
        config: { llmModelTriage: 'test-model' }
      });
      const { result } = await callLlm({ brand: 'Test', category: 'mouse' });
      assert.deepEqual(result, expected);
    });

    it('surfaces routed LLM failures', async () => {
      const callLlm = createBrandResolverCallLlm({
        callRoutedLlmFn: async () => {
          throw new Error('llm unavailable');
        },
        config: { llmModelTriage: 'test-model' }
      });

      await assert.rejects(
        callLlm({ brand: 'Test', category: 'mouse' }),
        /llm unavailable/,
      );
    });
  });
});
