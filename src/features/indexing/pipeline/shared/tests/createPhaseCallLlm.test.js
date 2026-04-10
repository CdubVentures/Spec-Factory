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

  it('forwards optional fields (usageContext, costRates, onUsage) when mapArgs returns them', async () => {
    const { deps, getCaptured } = makeDeps();
    const onUsageFn = async () => {};
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({
      user: 'x',
      usageContext: { reason: 'test' },
      costRates: { llmCostInputPer1M: 3 },
      onUsage: onUsageFn,
    }));
    await fn({});
    const c = getCaptured();
    assert.deepEqual(c.usageContext, { reason: 'test' });
    assert.deepEqual(c.costRates, { llmCostInputPer1M: 3 });
    assert.equal(c.onUsage, onUsageFn);
  });

  it('does not inject usageContext/costRates/onUsage when mapArgs returns only { user }', async () => {
    const { deps, getCaptured } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    const c = getCaptured();
    assert.equal(c.user, 'x');
    assert.ok(!Object.hasOwn(c, 'usageContext'), 'usageContext should not be present');
    assert.ok(!Object.hasOwn(c, 'costRates'), 'costRates should not be present');
    assert.ok(!Object.hasOwn(c, 'onUsage'), 'onUsage should not be present');
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

  it('returns the callRoutedLlmFn result transparently', async () => {
    const { deps } = makeDeps();
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    const result = await fn({});
    assert.deepEqual(result, { mock: true });
  });

  it('forwards onModelResolved from deps to callRoutedLlmFn', async () => {
    const cb = () => {};
    const { deps, getCaptured } = makeDeps({ onModelResolved: cb });
    const fn = createPhaseCallLlm(deps, MINIMAL_SPEC, () => ({ user: 'x' }));
    await fn({});
    assert.equal(getCaptured().onModelResolved, cb);
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
});
