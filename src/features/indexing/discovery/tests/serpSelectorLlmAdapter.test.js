/**
 * Unit tests for the SERP URL Selector LLM adapter factory.
 * RED phase — tests written before implementation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSerpSelectorCallLlm } from '../serpSelectorLlmAdapter.js';

describe('createSerpSelectorCallLlm', () => {
  it('returns a function', () => {
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async () => ({}),
      config: {},
      logger: null,
    });
    assert.equal(typeof fn, 'function');
  });

  it('calls callRoutedLlmFn with correct params', async () => {
    let capturedArgs = null;
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: { llmTimeoutMs: 25000 },
      logger: null,
    });

    await fn({
      selectorInput: { schema_version: 'serp_selector_input.v1', candidates: [] },
      llmContext: { category: 'mouse', productId: 'mouse-razer', runId: 'run-1' },
    });

    assert.equal(capturedArgs.reason, 'serp_url_selector');
    assert.equal(capturedArgs.role, 'triage');
    assert.equal(capturedArgs.phase, 'serpSelector');
  });

  it('passes selectorInput as user JSON', async () => {
    let capturedArgs = null;
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    const input = { schema_version: 'serp_selector_input.v1', candidates: [{ id: 'c_0' }] };
    await fn({ selectorInput: input, llmContext: {} });

    assert.equal(capturedArgs.user, JSON.stringify(input));
  });

  it('passes serpSelectorOutputSchema as jsonSchema', async () => {
    let capturedArgs = null;
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ selectorInput: { candidates: [] }, llmContext: {} });

    assert.ok(capturedArgs.jsonSchema);
    assert.equal(capturedArgs.jsonSchema.type, 'object');
    assert.ok(capturedArgs.jsonSchema.properties.keep_ids);
    assert.deepEqual(capturedArgs.jsonSchema.required, ['keep_ids']);
  });

  it('passes timeoutMs from config', async () => {
    let capturedArgs = null;
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: { llmTimeoutMs: 42000 },
      logger: null,
    });

    await fn({ selectorInput: { candidates: [] }, llmContext: {} });

    assert.equal(capturedArgs.timeoutMs, 42000);
  });

  it('propagates usageContext', async () => {
    let capturedArgs = null;
    const fn = createSerpSelectorCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({
      selectorInput: { candidates: [{ id: 'c_0' }, { id: 'c_1' }] },
      llmContext: { category: 'keyboard', productId: 'kb-1', runId: 'run-5', round: 2 },
    });

    assert.equal(capturedArgs.usageContext.category, 'keyboard');
    assert.equal(capturedArgs.usageContext.productId, 'kb-1');
    assert.equal(capturedArgs.usageContext.runId, 'run-5');
    assert.equal(capturedArgs.usageContext.url_count, 2);
  });
});
