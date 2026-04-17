import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRanAt,
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from '../finderOrchestrationHelpers.js';

// ─── computeRanAt ─────────────────────────────────────────────────────────────

describe('computeRanAt', () => {
  it('returns ISO string for ranAt and passes through now', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const { ranAt } = computeRanAt({ now });
    assert.equal(ranAt, now.toISOString());
  });

  it('returns the now date as-is', () => {
    const now = new Date('2025-06-15T12:30:00.000Z');
    const result = computeRanAt({ now });
    assert.equal(result.now, now);
  });

  it('defaults to current time when no argument', () => {
    const before = Date.now();
    const { ranAt } = computeRanAt();
    const after = Date.now();
    const ts = new Date(ranAt).getTime();
    assert.ok(ts >= before && ts <= after);
  });
});

// ─── resolveModelTracking ────────────────────────────────────────────────────

describe('resolveModelTracking', () => {
  it('strips composite key from config model', () => {
    const config = { _resolvedColorFinderBaseModel: 'anthropic:claude-sonnet-4-20250514' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    assert.equal(tracking.actualModel, 'claude-sonnet-4-20250514');
    assert.equal(tracking.actualFallbackUsed, false);
  });

  it('falls back to llmModelPlan when phase model not set', () => {
    const tracking = resolveModelTracking({ config: { llmModelPlan: 'gpt-4o' }, phaseKey: 'colorFinder' });
    assert.equal(tracking.actualModel, 'gpt-4o');
  });

  it('returns a string model even when config is empty', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    assert.equal(typeof tracking.actualModel, 'string');
    assert.ok(tracking.actualModel.length > 0);
  });

  it('wrappedOnModelResolved updates actualModel', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'real-model', isFallback: false });
    assert.equal(tracking.actualModel, 'real-model');
    assert.equal(tracking.actualFallbackUsed, false);
  });

  it('wrappedOnModelResolved captures fallback', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'fallback-model', isFallback: true });
    assert.equal(tracking.actualModel, 'fallback-model');
    assert.equal(tracking.actualFallbackUsed, true);
  });

  it('wrappedOnModelResolved passes through to original callback', () => {
    const calls = [];
    const tracking = resolveModelTracking({
      config: {},
      phaseKey: 'colorFinder',
      onModelResolved: (info) => calls.push(info),
    });
    tracking.wrappedOnModelResolved({ model: 'x', isFallback: false });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'x');
  });

  it('wrappedOnModelResolved works without original callback', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder', onModelResolved: null });
    // Should not throw
    tracking.wrappedOnModelResolved({ model: 'y', isFallback: false });
    assert.equal(tracking.actualModel, 'y');
  });

  // ── Effort + access mode tracking ──────────────────────────────────

  it('captures accessMode from onModelResolved callback', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-5', isFallback: false, accessMode: 'lab' });
    assert.equal(tracking.actualAccessMode, 'lab');
  });

  it('defaults accessMode to empty string before callback fires', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    assert.equal(tracking.actualAccessMode, '');
  });

  it('resolves baked effort from model name suffix', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-5.4-xhigh', isFallback: false, accessMode: 'lab' });
    assert.equal(tracking.actualEffortLevel, 'xhigh');
  });

  it('resolves configured effort when thinking is on and model has no baked effort', () => {
    const config = { _resolvedColorFinderThinkingEffort: 'high' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-4o', isFallback: false, accessMode: 'api', thinking: true });
    assert.equal(tracking.actualEffortLevel, 'high');
  });

  it('discards configured effort when thinking is off (no baked suffix)', () => {
    const config = { _resolvedColorFinderThinkingEffort: 'low' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-5.4-mini', isFallback: false, accessMode: 'lab', thinking: false });
    assert.equal(tracking.actualEffortLevel, '');
  });

  it('baked effort takes priority over configured effort', () => {
    const config = { _resolvedColorFinderThinkingEffort: 'low' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-5.4-xhigh', isFallback: false, accessMode: 'lab', thinking: true });
    assert.equal(tracking.actualEffortLevel, 'xhigh');
  });

  it('baked effort still applies when thinking is off', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-5.4-low', isFallback: false, accessMode: 'lab', thinking: false });
    assert.equal(tracking.actualEffortLevel, 'low');
  });

  it('effort defaults to empty string when no baked or configured effort', () => {
    const tracking = resolveModelTracking({ config: {}, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-4o', isFallback: false, accessMode: 'api', thinking: true });
    assert.equal(tracking.actualEffortLevel, '');
  });

  it('uses fallback configured effort when fallback model is used and thinking is on', () => {
    const config = { _resolvedColorFinderFallbackThinkingEffort: 'medium' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-4o-mini', isFallback: true, accessMode: 'api', thinking: true });
    assert.equal(tracking.actualEffortLevel, 'medium');
  });

  it('discards fallback configured effort when thinking is off', () => {
    const config = { _resolvedColorFinderFallbackThinkingEffort: 'medium' };
    const tracking = resolveModelTracking({ config, phaseKey: 'colorFinder' });
    tracking.wrappedOnModelResolved({ model: 'gpt-4o-mini', isFallback: true, accessMode: 'api', thinking: false });
    assert.equal(tracking.actualEffortLevel, '');
  });
});

// ─── resolveAmbiguityContext ─────────────────────────────────────────────────

describe('resolveAmbiguityContext', () => {
  it('returns snapshot values from resolveFn', async () => {
    const resolveFn = async () => ({ family_model_count: 5, ambiguity_level: 'hard' });
    const result = await resolveAmbiguityContext({
      config: {}, category: 'mouse', brand: 'Razer', baseModel: 'DeathAdder', specDb: {}, resolveFn,
    });
    assert.equal(result.familyModelCount, 5);
    assert.equal(result.ambiguityLevel, 'hard');
  });

  it('falls back to defaults when resolveFn throws', async () => {
    const resolveFn = async () => { throw new Error('boom'); };
    const result = await resolveAmbiguityContext({
      config: {}, category: 'mouse', brand: 'Razer', baseModel: 'DeathAdder', specDb: {}, resolveFn,
    });
    assert.equal(result.familyModelCount, 1);
    assert.equal(result.ambiguityLevel, 'easy');
  });

  it('falls back when snapshot returns nullish values', async () => {
    const resolveFn = async () => ({ family_model_count: 0, ambiguity_level: '' });
    const result = await resolveAmbiguityContext({
      config: {}, category: 'mouse', brand: 'Razer', baseModel: 'DeathAdder', specDb: {}, resolveFn,
    });
    assert.equal(result.familyModelCount, 1);
    assert.equal(result.ambiguityLevel, 'easy');
  });

  it('passes correct identityLock shape to resolveFn', async () => {
    let capturedArgs;
    const resolveFn = async (args) => { capturedArgs = args; return { family_model_count: 1, ambiguity_level: 'easy' }; };
    await resolveAmbiguityContext({
      config: { x: 1 }, category: 'keyboard', brand: 'Corsair', baseModel: 'K70', specDb: { y: 2 }, resolveFn,
    });
    assert.deepEqual(capturedArgs.identityLock, { brand: 'Corsair', base_model: 'K70' });
    assert.equal(capturedArgs.category, 'keyboard');
    assert.deepEqual(capturedArgs.config, { x: 1 });
    assert.deepEqual(capturedArgs.specDb, { y: 2 });
  });
});

// ─── buildFinderLlmCaller ────────────────────────────────────────────────────

describe('buildFinderLlmCaller', () => {
  it('returns override-wrapped function when _callLlmOverride is set', async () => {
    const calls = [];
    const override = (args, opts) => { calls.push({ args, opts }); return { result: true }; };
    const wrapped = () => {};
    const callLlm = buildFinderLlmCaller({
      _callLlmOverride: override,
      wrappedOnModelResolved: wrapped,
      createCallLlm: () => { throw new Error('should not be called'); },
      llmDeps: {},
    });

    const result = await callLlm({ foo: 'bar' });
    assert.equal(result.result, true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, { foo: 'bar' });
    assert.equal(calls[0].opts.onModelResolved, wrapped);
  });

  it('calls createCallLlm factory when no override', () => {
    const fakeCaller = (args) => ({ called: true, args });
    const deps = { config: {}, logger: null };
    const callLlm = buildFinderLlmCaller({
      _callLlmOverride: null,
      wrappedOnModelResolved: () => {},
      createCallLlm: (d) => { assert.equal(d, deps); return fakeCaller; },
      llmDeps: deps,
    });

    assert.equal(typeof callLlm, 'function');
    const result = callLlm({ x: 1 });
    assert.equal(result.called, true);
  });
});
