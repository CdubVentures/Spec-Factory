// WHY: withLlmCallTracking is a boundary contract — four finder orchestrators
// (keyFinder, variantScalarFieldProducer, CEF Discovery, CEF Identity Check)
// call it and rely on the exact emission shape the modal's LlmCallCard reads.
// Stage 2 of the active-operations upgrade consolidates ~30 LOC of duplicated
// pending-before/completed-after emission code per orchestrator into this
// single helper. Exhaustive matrix per CLAUDE.md test budget heuristic rule 5.

import test from 'node:test';
import assert from 'node:assert/strict';
import { withLlmCallTracking } from '../withLlmCallTracking.js';

function makeModelTrackingStub(overrides = {}) {
  return {
    actualModel: 'gpt-5.4',
    actualFallbackUsed: false,
    actualAccessMode: 'api',
    actualEffortLevel: 'high',
    actualThinking: true,
    actualWebSearch: false,
    configModel: 'gpt-5.4-plan',
    wrappedOnModelResolved: () => {},
    ...overrides,
  };
}

function makeRecorder() {
  const emissions = [];
  return {
    emissions,
    onLlmCallComplete: (call) => emissions.push(call),
  };
}

test('withLlmCallTracking emits pending row with correct keys + response null', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: 'sys', user: 'usr' },
    initialModel: 'gpt-5.4-easy',
    tierCapabilities: { thinking: true, webSearch: false, effortLevel: 'low' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: { ok: true }, usage: { total_tokens: 100 } }),
  });

  const pending = emissions[0];
  assert.equal(pending.label, 'Discovery');
  assert.deepEqual(pending.prompt, { system: 'sys', user: 'usr' });
  assert.equal(pending.response, null, 'pending must have response: null so appendLlmCall creates a pending row');
  assert.equal(pending.model, 'gpt-5.4-easy', 'pending shows initialModel — not modelTracking.actualModel (which is empty pre-call)');
  assert.equal(pending.isFallback, false);
  assert.equal(pending.thinking, true);
  assert.equal(pending.webSearch, false);
  assert.equal(pending.effortLevel, 'low');
  assert.equal(pending.accessMode, '', 'pending always emits accessMode: empty — not yet known');
});

test('withLlmCallTracking emits completed row with modelTracking.actual* + usage + duration + started_at', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  const modelTracking = makeModelTrackingStub({
    actualModel: 'gpt-5.4-fallback',
    actualFallbackUsed: true,
    actualAccessMode: 'claude-desktop',
    actualEffortLevel: 'medium',
    actualThinking: false,
    actualWebSearch: true,
  });

  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: 'sys', user: 'usr' },
    initialModel: 'gpt-5.4-easy',
    tierCapabilities: { thinking: true, webSearch: false, effortLevel: 'low' },
    modelTracking,
    onLlmCallComplete,
    callFn: async () => ({ result: { ok: true }, usage: { total_tokens: 250 } }),
  });

  const completed = emissions[1];
  assert.equal(completed.label, 'Discovery');
  assert.deepEqual(completed.response, { ok: true });
  assert.equal(completed.model, 'gpt-5.4-fallback', 'completed uses modelTracking.actualModel (populated after resolution)');
  assert.equal(completed.isFallback, true);
  assert.equal(completed.thinking, false);
  assert.equal(completed.webSearch, true);
  assert.equal(completed.effortLevel, 'medium');
  assert.equal(completed.accessMode, 'claude-desktop');
  assert.deepEqual(completed.usage, { total_tokens: 250 });
  assert.equal(typeof completed.started_at, 'string');
  assert.match(completed.started_at, /^\d{4}-\d{2}-\d{2}T/, 'started_at is ISO format');
  assert.equal(typeof completed.duration_ms, 'number');
  assert.ok(completed.duration_ms >= 0, 'duration_ms must be non-negative');
});

test('withLlmCallTracking spreads extras into BOTH pending and completed', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: 'sys', user: 'usr' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: 'ok', usage: null }),
    extras: { tier: 'medium', reason: 'key_finding_medium', variant: 'SKU-01' },
  });

  const [pending, completed] = emissions;
  assert.equal(pending.tier, 'medium', 'extras.tier spread into pending');
  assert.equal(pending.reason, 'key_finding_medium');
  assert.equal(pending.variant, 'SKU-01');
  assert.equal(completed.tier, 'medium', 'extras.tier spread into completed');
  assert.equal(completed.reason, 'key_finding_medium');
  assert.equal(completed.variant, 'SKU-01');
});

test('withLlmCallTracking intrinsic fields win over extras — extras CANNOT shadow label/prompt/response/model/usage/started_at/duration_ms', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: 'sys', user: 'usr' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: 'real-response', usage: { t: 1 } }),
    extras: {
      label: 'HIJACKED',
      prompt: { system: 'HIJACKED', user: 'HIJACKED' },
      response: 'HIJACKED',
      model: 'HIJACKED',
      usage: 'HIJACKED',
      started_at: 'HIJACKED',
      duration_ms: 'HIJACKED',
      tier: 'medium', // should survive
    },
  });

  const [pending, completed] = emissions;
  assert.equal(pending.label, 'Discovery', 'intrinsic label wins');
  assert.deepEqual(pending.prompt, { system: 'sys', user: 'usr' }, 'intrinsic prompt wins');
  assert.equal(pending.response, null, 'intrinsic response wins');
  assert.equal(pending.model, 'gpt-5.4', 'intrinsic model wins');
  assert.equal(pending.tier, 'medium', 'non-intrinsic extras still flow through');

  assert.equal(completed.label, 'Discovery');
  assert.deepEqual(completed.response, 'real-response');
  assert.deepEqual(completed.usage, { t: 1 });
  assert.equal(typeof completed.started_at, 'string');
  assert.notEqual(completed.started_at, 'HIJACKED');
  assert.equal(typeof completed.duration_ms, 'number');
  assert.notEqual(completed.duration_ms, 'HIJACKED');
});

test('withLlmCallTracking returns { result, usage, durationMs, startedAt }', async () => {
  const { onLlmCallComplete } = makeRecorder();
  const out = await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: { answer: 42 }, usage: { total_tokens: 7 } }),
  });

  assert.deepEqual(out.result, { answer: 42 });
  assert.deepEqual(out.usage, { total_tokens: 7 });
  assert.equal(typeof out.durationMs, 'number');
  assert.ok(out.durationMs >= 0);
  // WHY: callers that persist runs (keyFinder/CEF) reuse startedAt instead of
  // recording a second Date.now(). Must match the completed emission's started_at.
  assert.equal(typeof out.startedAt, 'string');
  assert.match(out.startedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('withLlmCallTracking two sequential calls emit 4 in order: pending-A → completed-A → pending-B → completed-B', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  const modelTracking = makeModelTrackingStub();

  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: 'sysA', user: 'usrA' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking,
    onLlmCallComplete,
    callFn: async () => ({ result: 'A', usage: null }),
  });
  await withLlmCallTracking({
    label: 'Identity Check',
    prompt: { system: 'sysB', user: 'usrB' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking,
    onLlmCallComplete,
    callFn: async () => ({ result: 'B', usage: null }),
  });

  assert.equal(emissions.length, 4, 'two calls produce exactly 4 emissions (2 each)');
  assert.equal(emissions[0].label, 'Discovery');
  assert.equal(emissions[0].response, null, 'pending-A');
  assert.equal(emissions[1].label, 'Discovery');
  assert.equal(emissions[1].response, 'A', 'completed-A');
  assert.equal(emissions[2].label, 'Identity Check');
  assert.equal(emissions[2].response, null, 'pending-B — appendLlmCall will append as new row because last row has non-null response');
  assert.equal(emissions[3].label, 'Identity Check');
  assert.equal(emissions[3].response, 'B', 'completed-B');
});

test('withLlmCallTracking when callFn throws: pending emitted, error bubbles, NO completed emit', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  const err = new Error('upstream_llm_boom');

  await assert.rejects(
    () => withLlmCallTracking({
      label: 'Discovery',
      prompt: { system: '', user: '' },
      initialModel: 'gpt-5.4',
      tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
      modelTracking: makeModelTrackingStub(),
      onLlmCallComplete,
      callFn: async () => { throw err; },
    }),
    (caught) => caught === err,
    'error must propagate verbatim',
  );

  assert.equal(emissions.length, 1, 'only pending emitted — no completed');
  assert.equal(emissions[0].response, null, 'pending row preserved');
});

test('withLlmCallTracking can delegate the full row to routed phase telemetry', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    emitCompleted: false,
    callFn: async () => ({ result: { ok: true }, usage: { total_tokens: 7 } }),
  });

  assert.equal(emissions.length, 0, 'delegated mode emits no wrapper rows; routed telemetry owns pending + completed');
});

test('withLlmCallTracking callFn returns undefined usage → completed emits usage: null', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: 'ok', usage: undefined }),
  });
  assert.equal(emissions[1].usage, null, 'undefined usage normalized to null so the modal does not render "undefined"');
});

test('withLlmCallTracking initialModel omitted → falls back to modelTracking.configModel', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    // initialModel intentionally omitted
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub({ configModel: 'gpt-4-plan' }),
    onLlmCallComplete,
    callFn: async () => ({ result: 'ok', usage: null }),
  });
  assert.equal(emissions[0].model, 'gpt-4-plan', 'pending model falls back to modelTracking.configModel');
});

test('withLlmCallTracking tierCapabilities omitted → wrapper does not throw; pending emits all-falsy defaults', async () => {
  const { emissions, onLlmCallComplete } = makeRecorder();
  await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    initialModel: 'gpt-5.4',
    // tierCapabilities intentionally omitted
    modelTracking: makeModelTrackingStub(),
    onLlmCallComplete,
    callFn: async () => ({ result: 'ok', usage: null }),
  });
  const pending = emissions[0];
  assert.equal(pending.thinking, false);
  assert.equal(pending.webSearch, false);
  assert.equal(pending.effortLevel, '');
});

test('withLlmCallTracking onLlmCallComplete omitted → wrapper still runs callFn and returns', async () => {
  const out = await withLlmCallTracking({
    label: 'Discovery',
    prompt: { system: '', user: '' },
    initialModel: 'gpt-5.4',
    tierCapabilities: { thinking: false, webSearch: false, effortLevel: '' },
    modelTracking: makeModelTrackingStub(),
    // onLlmCallComplete intentionally omitted — test stub has no telemetry
    callFn: async () => ({ result: { ok: true }, usage: null }),
  });
  assert.deepEqual(out.result, { ok: true });
  assert.equal(typeof out.durationMs, 'number');
});
