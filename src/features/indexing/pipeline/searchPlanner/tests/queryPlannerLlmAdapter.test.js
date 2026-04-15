import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createQueryEnhancerCallLlm, queryEnhancerResponseZodSchema, buildEnhancerSystemPrompt } from '../queryPlannerLlmAdapter.js';

describe('createQueryEnhancerCallLlm', () => {
  it('returns a function', () => {
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async () => ({}),
      config: {},
      logger: null,
    });
    assert.equal(typeof fn, 'function');
  });

  it('calls callRoutedLlmFn with correct reason, role, phase', async () => {
    let capturedArgs = null;
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payload: { rows: [] }, rowCount: 0, usageContext: {} });

    assert.equal(capturedArgs.reason, 'search_planner_enhance');
    assert.equal(capturedArgs.role, 'plan');
    assert.equal(capturedArgs.phase, 'searchPlanner');
  });

  it('passes payload as user JSON string', async () => {
    let capturedArgs = null;
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    const payload = { identity_lock: { brand: 'Razer' }, rows: [{ index: 0 }] };
    await fn({ payload, rowCount: 1, usageContext: {} });

    assert.equal(capturedArgs.user, JSON.stringify(payload));
  });

  it('passes correct jsonSchema shape', async () => {
    let capturedArgs = null;
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payload: {}, rowCount: 0, usageContext: {} });

    assert.equal(capturedArgs.jsonSchema.type, 'object');
    assert.ok(capturedArgs.jsonSchema.properties.enhanced_queries);
    assert.ok(!capturedArgs.jsonSchema.$schema, '$schema must be stripped');
  });

  it('forwards usageContext', async () => {
    let capturedArgs = null;
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    const ctx = { reason: 'search_planner_enhance', evidence_chars: 500 };
    await fn({ payload: {}, rowCount: 0, usageContext: ctx });

    assert.deepEqual(capturedArgs.usageContext, ctx);
  });

  it('passes config as costRates', async () => {
    let capturedArgs = null;
    const cfg = { llmModelPlan: 'test-model' };
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: cfg,
      logger: null,
    });

    await fn({ payload: {}, rowCount: 0, usageContext: {} });

    assert.equal(capturedArgs.costRates, cfg);
  });

  it('builds system prompt using rowCount', async () => {
    let capturedArgs = null;
    const fn = createQueryEnhancerCallLlm({
      callRoutedLlmFn: async (args) => { capturedArgs = args; return {}; },
      config: {},
      logger: null,
    });

    await fn({ payload: {}, rowCount: 5, usageContext: {} });

    assert.ok(capturedArgs.system.includes('5'), 'system prompt should include row count');
    assert.ok(capturedArgs.system.includes('enhanced_queries') || capturedArgs.system.includes('enhance'),
      'system prompt should describe the enhancement task');
  });

  it('exports queryEnhancerResponseZodSchema', () => {
    assert.ok(queryEnhancerResponseZodSchema);
    assert.equal(typeof queryEnhancerResponseZodSchema.parse, 'function');
  });
});

// ── Characterization: buildEnhancerSystemPrompt ───────────────────────────────
// WHY: Lock down prompt structure before template extraction.

describe('buildEnhancerSystemPrompt — characterization', () => {

  it('is a function that returns a string', () => {
    const result = buildEnhancerSystemPrompt(10);
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 200);
  });

  it('injects rowCount into the prompt', () => {
    const result = buildEnhancerSystemPrompt(7);
    assert.ok(result.includes('7 query rows'));
    assert.ok(result.includes('Return exactly 7'));
  });

  it('includes identity lock rules', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('IDENTITY LOCK'));
    assert.ok(result.includes('brand name and model name'));
  });

  it('includes domain format rules', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('DOMAIN FORMAT'));
    assert.ok(result.includes('NEVER use site: operator'));
  });

  it('includes all three tiers', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('TIER 1'));
    assert.ok(result.includes('TIER 2'));
    assert.ok(result.includes('TIER 3'));
    assert.ok(result.includes('"seed"'));
    assert.ok(result.includes('"group_search"'));
    assert.ok(result.includes('"key_search"'));
  });

  it('includes tier 3 sub-rules by repeat_count', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('repeat=0'));
    assert.ok(result.includes('repeat=1'));
    assert.ok(result.includes('repeat=2'));
    assert.ok(result.includes('repeat=3+'));
  });

  it('includes history awareness section', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('HISTORY AWARENESS'));
    assert.ok(result.includes('query_history'));
  });

  it('includes output format', () => {
    const result = buildEnhancerSystemPrompt(1);
    assert.ok(result.includes('enhanced_queries'));
  });
});
