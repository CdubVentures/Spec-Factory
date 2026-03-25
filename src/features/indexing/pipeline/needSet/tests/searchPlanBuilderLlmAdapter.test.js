import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSearchPlannerCallLlm, plannerResponseZodSchema } from '../searchPlanBuilderLlmAdapter.js';

describe('createSearchPlannerCallLlm', () => {
  it('returns a function', () => {
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async () => ({}),
      config: {},
      logger: null,
    });
    assert.equal(typeof fn, 'function');
  });

  it('calls callRoutedLlmFn with correct reason, role, phase', async () => {
    let capturedArgs = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payloadJson: '{}', llmContext: {}, usageContext: {} });

    assert.equal(capturedArgs.reason, 'needset_search_planner');
    assert.equal(capturedArgs.role, 'plan');
    assert.equal(capturedArgs.phase, 'needset');
  });

  it('passes payloadJson as user string', async () => {
    let capturedArgs = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    const payload = '{"identity":{"brand":"Razer"}}';
    await fn({ payloadJson: payload, llmContext: {}, usageContext: {} });

    assert.equal(capturedArgs.user, payload);
  });

  it('passes correct jsonSchema shape', async () => {
    let capturedArgs = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payloadJson: '{}', llmContext: {}, usageContext: {} });

    assert.equal(capturedArgs.jsonSchema.type, 'object');
    assert.ok(capturedArgs.jsonSchema.properties.groups || capturedArgs.jsonSchema.properties.planner_confidence,
      'schema should have planner response properties');
    assert.ok(!capturedArgs.jsonSchema.$schema, '$schema must be stripped');
  });

  it('forwards usageContext', async () => {
    let capturedArgs = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    const ctx = { category: 'mouse', productId: 'mouse-1', runId: 'r-1', round: 2 };
    await fn({ payloadJson: '{}', llmContext: {}, usageContext: ctx });

    assert.deepEqual(capturedArgs.usageContext, ctx);
  });

  it('forwards costRates from llmContext when present', async () => {
    let capturedArgs = null;
    const customRates = { inputCostPer1k: 0.5 };
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: { fallback: true },
      logger: null,
    });

    await fn({ payloadJson: '{}', llmContext: { costRates: customRates }, usageContext: {} });

    assert.equal(capturedArgs.costRates, customRates);
  });

  it('falls back to config for costRates when llmContext lacks it', async () => {
    let capturedArgs = null;
    const cfg = { llmModelPlan: 'test-model' };
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: cfg,
      logger: null,
    });

    await fn({ payloadJson: '{}', llmContext: {}, usageContext: {} });

    assert.equal(capturedArgs.costRates, cfg);
  });

  it('forwards onUsage from llmContext.recordUsage', async () => {
    let capturedArgs = null;
    let usageReceived = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({
      payloadJson: '{}',
      llmContext: { recordUsage: async (row) => { usageReceived = row; } },
      usageContext: {},
    });

    assert.equal(typeof capturedArgs.onUsage, 'function');
    await capturedArgs.onUsage({ tokens: 100 });
    assert.deepEqual(usageReceived, { tokens: 100 });
  });

  it('onUsage is undefined when llmContext.recordUsage is missing', async () => {
    let capturedArgs = null;
    const fn = createSearchPlannerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payloadJson: '{}', llmContext: {}, usageContext: {} });

    assert.equal(capturedArgs.onUsage, undefined);
  });

  it('exports plannerResponseZodSchema', () => {
    assert.ok(plannerResponseZodSchema);
    assert.equal(typeof plannerResponseZodSchema.parse, 'function');
  });
});
