// WHY: Boundary tests for the generic pipeline phase LLM call adapter factory.
// Validates that static phase constants and dynamic mapped args are forwarded
// correctly to callRoutedLlmFn without the wrapper adding behavior.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPhaseCallLlm } from '../createPhaseCallLlm.js';

// ── Test helpers ──

function makeDeps(overrides = {}) {
  let captured = null;
  const callRoutedLlmFn = async (args) => { captured = args; return { mock: true }; };
  const deps = { callRoutedLlmFn, config: { key: 'test-config' }, logger: { info: () => {} }, ...overrides };
  return { deps, getCaptured: () => captured };
}

const MINIMAL_SPEC = {
  phase: 'testPhase',
  reason: 'test_reason',
  role: 'plan',
  system: 'You are a test assistant.',
  jsonSchema: { type: 'object', properties: { answer: { type: 'string' } } },
};

// ── Factory contract ──

describe('createPhaseCallLlm', () => {
  it('returns a function', () => {
    const { deps } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'hi' }));
    assert.equal(typeof fn, 'function');
  });

  // ── Static field forwarding ──

  it('forwards phase, reason, role, config, and logger from deps and spec', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'payload' }));
    await fn({});
    const c = getCaptured();
    assert.equal(c.phase, 'testPhase');
    assert.equal(c.reason, 'test_reason');
    assert.equal(c.role, 'plan');
    assert.deepEqual(c.config, { key: 'test-config' });
    assert.equal(c.logger, deps.logger);
  });

  // ── System prompt handling ──

  it('forwards a static system prompt string verbatim', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    assert.equal(getCaptured().system, 'You are a test assistant.');
  });

  it('calls a dynamic system prompt function with domainArgs', async () => {
    const { deps, getCaptured } = makeDeps();
    const spec = { ...MINIMAL_SPEC, system: (args) => `Dynamic: ${args.count}` };
    const fn = createPhaseCallLlm(deps, spec, () => ({ user: 'x' }));
    await fn({ count: 42 });
    assert.equal(getCaptured().system, 'Dynamic: 42');
  });

  // ── jsonSchema handling ──

  it('forwards a static jsonSchema object verbatim', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    assert.deepEqual(getCaptured().jsonSchema, MINIMAL_SPEC.jsonSchema);
  });

  it('calls a jsonSchema function per invocation', async () => {
    let callCount = 0;
    const schemaFn = () => { callCount += 1; return { type: 'object', call: callCount }; };
    const spec = { ...MINIMAL_SPEC, jsonSchema: schemaFn };
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, spec, () => ({ user: 'x' }));

    await fn({});
    assert.equal(callCount, 1);
    assert.deepEqual(getCaptured().jsonSchema, { type: 'object', call: 1 });

    await fn({});
    assert.equal(callCount, 2);
    assert.deepEqual(getCaptured().jsonSchema, { type: 'object', call: 2 });
  });

  // ── mapArgs forwarding ──

  it('forwards user from mapArgs', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: '{"brand":"Razer"}' }));
    await fn({});
    assert.equal(getCaptured().user, '{"brand":"Razer"}');
  });

  it('forwards optional fields (usageContext, costRates) when mapArgs returns them', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({
      user: 'x',
      usageContext: { reason: 'test' },
      costRates: { llmCostInputPer1M: 3 },
    }));
    await fn({});
    const c = getCaptured();
    assert.deepEqual(c.usageContext, { reason: 'test' });
    assert.deepEqual(c.costRates, { llmCostInputPer1M: 3 });
    // WHY: onUsage is always composed by createPhaseCallLlm (usage capture), so it's always a function
    assert.equal(typeof c.onUsage, 'function');
  });

  it('does not inject usageContext/costRates when mapArgs returns only { user }', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    const c = getCaptured();
    assert.equal(c.user, 'x');
    assert.ok(!Object.hasOwn(c, 'usageContext'), 'usageContext should not be present');
    assert.ok(!Object.hasOwn(c, 'costRates'), 'costRates should not be present');
    // WHY: onUsage is always injected by createPhaseCallLlm for usage capture
    assert.equal(typeof c.onUsage, 'function');
  });

  // ── mapArgs receives config ──

  it('passes config as second argument to mapArgs', async () => {
    const { deps } = makeDeps();
    let receivedConfig = null;
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, (_args, cfg) => {
      receivedConfig = cfg;
      return { user: 'x' };
    });
    await fn({});
    assert.deepEqual(receivedConfig, { key: 'test-config' });
  });

  // ── Return value and error propagation ──

  it('returns { result, usage } wrapping the callRoutedLlmFn result', async () => {
    const { deps } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const out = await fn({});
    assert.deepEqual(out.result, { mock: true });
    assert.equal(out.usage, null);
  });

  it('forwards onModelResolved from deps to callRoutedLlmFn', async () => {
    const cb = () => {};
    const { deps, getCaptured } = makeDeps({ onModelResolved: cb });
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    assert.equal(getCaptured().onModelResolved, cb);
  });

  it('forwards onStreamChunk from deps to callRoutedLlmFn', async () => {
    const cb = () => {};
    const { deps, getCaptured } = makeDeps({ onStreamChunk: cb });
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    assert.equal(getCaptured().onStreamChunk, cb);
  });

  it('propagates callRoutedLlmFn rejection', async () => {
    const deps = {
      callRoutedLlmFn: async () => { throw new Error('LLM_FAIL'); },
      config: {},
      logger: null,
    };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await assert.rejects(() => fn({}), { message: 'LLM_FAIL' });
  });

  // ── Usage capture ──

  it('returns { result, usage } when onUsage fires', async () => {
    const callRoutedLlmFn = async (args) => {
      await args.onUsage?.({ prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost_usd: 0.003, estimated_usage: false });
      return { answer: 'hello' };
    };
    const deps = { callRoutedLlmFn, config: {}, logger: null };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const out = await fn({});
    assert.deepEqual(out.result, { answer: 'hello' });
    assert.deepEqual(out.usage, { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost_usd: 0.003, estimated_usage: false });
  });

  it('usage is null when onUsage never fires', async () => {
    const callRoutedLlmFn = async () => { return { answer: 'hi' }; };
    const deps = { callRoutedLlmFn, config: {}, logger: null };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const out = await fn({});
    assert.deepEqual(out.result, { answer: 'hi' });
    assert.equal(out.usage, null);
  });

  it('composes with existing onUsage from mapArgs — both fire', async () => {
    let originalCalled = false;
    const originalOnUsage = async (u) => { originalCalled = u; };
    const usageData = { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280, cost_usd: 0.005, estimated_usage: false };
    const callRoutedLlmFn = async (args) => {
      await args.onUsage?.(usageData);
      return { ok: true };
    };
    const deps = { callRoutedLlmFn, config: {}, logger: null };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x', onUsage: originalOnUsage }));
    const out = await fn({});
    // Original onUsage must still fire (cost ledger)
    assert.deepEqual(originalCalled, usageData, 'original onUsage from mapArgs must fire');
    // Captured usage must also be present
    assert.deepEqual(out.usage, usageData);
  });

  it('accumulates usage across multiple onUsage firings (two-phase writer)', async () => {
    const callRoutedLlmFn = async (args) => {
      await args.onUsage?.({ prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost_usd: 0.002, estimated_usage: false });
      await args.onUsage?.({ prompt_tokens: 80, completion_tokens: 60, total_tokens: 140, cost_usd: 0.003, estimated_usage: false });
      return { combined: true };
    };
    const deps = { callRoutedLlmFn, config: {}, logger: null };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const out = await fn({});
    assert.equal(out.usage.prompt_tokens, 180);
    assert.equal(out.usage.completion_tokens, 100);
    assert.equal(out.usage.total_tokens, 280);
    assert.equal(out.usage.cost_usd, 0.005);
    assert.equal(out.usage.estimated_usage, false);
  });

  it('estimated_usage is true if ANY firing is estimated', async () => {
    const callRoutedLlmFn = async (args) => {
      await args.onUsage?.({ prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost_usd: 0.002, estimated_usage: false });
      await args.onUsage?.({ prompt_tokens: 80, completion_tokens: 60, total_tokens: 140, cost_usd: 0.003, estimated_usage: true });
      return {};
    };
    const deps = { callRoutedLlmFn, config: {}, logger: null };
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const out = await fn({});
    assert.equal(out.usage.estimated_usage, true);
  });
});
