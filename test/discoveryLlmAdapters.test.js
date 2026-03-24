import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrandResolverCallLlm,
} from '../src/features/indexing/pipeline/brandResolver/brandResolverLlmAdapter.js';

function makeCallRoutedLlm(returnValue = {}) {
  const calls = [];
  return {
    get calls() { return calls; },
    fn: async (opts) => {
      calls.push(opts);
      return returnValue;
    }
  };
}

describe('discoveryLlmAdapters', () => {
  describe('createBrandResolverCallLlm', () => {
    it('formats prompt with brand and category and returns parsed result', async () => {
      const routed = makeCallRoutedLlm({
        official_domain: 'cougargaming.com',
        aliases: ['cougargaming.com'],
        support_domain: 'support.cougargaming.com'
      });
      const callLlm = createBrandResolverCallLlm({
        callRoutedLlmFn: routed.fn,
        config: { llmModelTriage: 'test-model' }
      });
      const result = await callLlm({ brand: 'Cougar', category: 'mouse', config: {} });
      assert.equal(result.official_domain, 'cougargaming.com');
      assert.ok(routed.calls.length === 1);
      assert.ok(routed.calls[0].reason === 'brand_resolution');
      assert.ok(routed.calls[0].user.includes('Cougar'));
      assert.ok(routed.calls[0].user.includes('mouse'));
    });

    it('includes JSON schema for structured output', async () => {
      const routed = makeCallRoutedLlm({ official_domain: 'test.com', aliases: [] });
      const callLlm = createBrandResolverCallLlm({
        callRoutedLlmFn: routed.fn,
        config: { llmModelTriage: 'test-model' }
      });
      await callLlm({ brand: 'Test', category: 'mouse', config: {} });
      const schema = routed.calls[0].jsonSchema;
      assert.ok(schema);
      assert.ok(schema.properties.official_domain);
      assert.ok(schema.properties.aliases);
    });
  });
});
