/**
 * Key Finder — Loop orchestrator tests.
 *
 * Exhaustive boundary matrix per CLAUDE.md [CLASS: BEHAVIORAL]: budget
 * exhaustion, exits on publish, exits on definitive unk, keeps going on
 * below-threshold, loop_id stamping across iterations, tier bundle snapshot,
 * AbortSignal mid-loop, passenger re-pack.
 *
 * Uses a `_runKeyFinderOverride` test seam so loop-logic tests don't depend
 * on the full runKeyFinder call stack. Integration is covered end-to-end by
 * the route tests (keyFinderRoutes.loop.test.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runKeyFinderLoop } from '../keyFinderLoop.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const PRODUCT = {
  product_id: 'loop-test-001',
  category: 'mouse',
  brand: 'Razer',
  model: 'DeathAdder V3 Pro',
  base_model: 'DeathAdder V3 Pro',
};

const POLLING_RATE_RULE = {
  field_key: 'polling_rate',
  difficulty: 'medium',
  required_level: 'mandatory',
  availability: 'always',
  group: 'sensor_performance',
};

const COMPILED_FIELD_RULES = {
  fields: { polling_rate: POLLING_RATE_RULE },
  known_values: {},
};

const POLICY = {
  keyFinderTiers: {
    easy: { model: 'mini', useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false },
    medium: { model: 'gpt-5.4-mini', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    hard: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    very_hard: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
    fallback: { model: 'gpt-5.4', useReasoning: false, reasoningModel: '', thinking: true, thinkingEffort: 'xhigh', webSearch: true },
  },
  models: { plan: 'gpt-5.4' },
};

const KNOBS = {
  budgetRequiredPoints: JSON.stringify({ mandatory: 2, non_mandatory: 1 }),
  budgetAvailabilityPoints: JSON.stringify({ always: 1, sometimes: 2, rare: 3 }),
  budgetDifficultyPoints: JSON.stringify({ easy: 1, medium: 2, hard: 3, very_hard: 4 }),
  budgetVariantPointsPerExtra: '1',
  budgetFloor: '3',
};

function makeSpecDb({ settings = KNOBS, variantCount = 1, resolvedPrimary = false } = {}) {
  const vs = Array.from({ length: variantCount }, (_, i) => ({
    variant_id: `v${i}`, variant_key: `variant-${i}`, variant_label: `Variant ${i}`, variant_type: 'color',
  }));
  return {
    category: 'mouse',
    getFinderStore: (id) => (id === 'keyFinder' ? {
      getSetting: (k) => (k in settings ? String(settings[k]) : ''),
    } : null),
    getCompiledRules: () => COMPILED_FIELD_RULES,
    variants: { listActive: () => vs, listByProduct: () => vs },
    getResolvedFieldCandidate: () => (resolvedPrimary ? { value: 'pre-resolved', confidence: 95 } : null),
  };
}

// ── Test seam: programmable runKeyFinder ─────────────────────────────

function makeRunOverride(results) {
  // results: array of { status, unknown_reason?, candidate?, passenger_candidates? }
  // one entry per expected iteration. Each call returns the next entry;
  // throws if called more times than entries provided.
  let idx = 0;
  const calls = [];
  const fn = async (opts) => {
    calls.push({ idx, opts });
    if (idx >= results.length) {
      throw new Error(`_runKeyFinderOverride: called ${idx + 1} times; only ${results.length} results provided`);
    }
    const r = results[idx];
    idx += 1;
    return {
      run_number: idx,
      field_key: opts.fieldKey,
      tier: 'medium',
      passenger_candidates: [],
      ...r,
    };
  };
  fn.calls = calls;
  fn.callCount = () => idx;
  return fn;
}

// ── Tests ────────────────────────────────────────────────────────────

test('budget honored: loop exhausts after N calls when nothing resolves', async () => {
  const specDb = makeSpecDb();
  // medium/mandatory/always/1-variant → 2+1+2+0=5, floor=3 → attempts=5
  const runOverride = makeRunOverride([
    { status: 'accepted', candidate: { value: 4000, confidence: 50 } }, // below threshold
    { status: 'accepted', candidate: { value: 4000, confidence: 55 } },
    { status: 'accepted', candidate: { value: 4000, confidence: 60 } },
    { status: 'accepted', candidate: { value: 4000, confidence: 65 } },
    { status: 'accepted', candidate: { value: 4000, confidence: 70 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 5);
  assert.equal(result.final_status, 'budget_exhausted');
  assert.equal(runOverride.callCount(), 5);
  assert.ok(result.loop_id.startsWith('loop-'));
  assert.deepEqual(result.runs, [1, 2, 3, 4, 5]);
});

test('exits on publish at iteration 2', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'below_threshold', candidate: { value: 4000, confidence: 55 } },
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 2);
  assert.equal(result.final_status, 'published');
  assert.equal(runOverride.callCount(), 2, 'no 3rd call after publish');
  assert.equal(result.last_result.candidate.value, 8000);
});

test('exits on definitive unk at iteration 1', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'unk', unknown_reason: 'Manufacturer page does not disclose the sensor IC' },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 1);
  assert.equal(result.final_status, 'definitive_unk');
  assert.equal(runOverride.callCount(), 1);
});

test('keeps going on below_threshold status', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'below_threshold', candidate: { value: 4000, confidence: 55 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 60 } },
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 3);
  assert.equal(result.final_status, 'published');
});

test('empty unknown_reason does NOT exit — loop continues', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'unk', unknown_reason: '' }, // empty reason = try again
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 2);
  assert.equal(result.final_status, 'published');
});

test('loop_id stamped on every iteration (passed via opts.loop_id)', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'below_threshold' },
    { status: 'below_threshold' },
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(runOverride.calls.length, 3);
  const loopIds = runOverride.calls.map((c) => c.opts.loop_id);
  assert.ok(loopIds.every((id) => id === result.loop_id), 'every iteration carries the SAME loop_id');
  assert.ok(result.loop_id.startsWith('loop-'));
});

test('tier bundle snapshot — policy mutation mid-loop does not affect subsequent iterations', async () => {
  const specDb = makeSpecDb();
  const mutablePolicy = {
    ...POLICY,
    keyFinderTiers: { ...POLICY.keyFinderTiers },
  };

  const runOverride = async (opts) => {
    // Record which tierBundleOverride the loop passed in
    runOverride.calls.push({ tierBundleOverride: opts.tierBundleOverride });
    // After first call, mutate the policy to ensure loop doesn't re-resolve
    mutablePolicy.keyFinderTiers.medium = {
      model: 'gpt-9-SHOULD-NEVER-BE-USED',
      useReasoning: false, reasoningModel: '', thinking: false, thinkingEffort: '', webSearch: false,
    };
    return { status: 'below_threshold', run_number: runOverride.calls.length };
  };
  runOverride.calls = [];

  // Budget is 5 for this rule. 5 iterations all below_threshold → budget_exhausted.
  await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: mutablePolicy,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(runOverride.calls.length, 5);
  const models = runOverride.calls.map((c) => c.tierBundleOverride.model);
  const uniqueModels = new Set(models);
  assert.equal(uniqueModels.size, 1, `all iterations must use the same model (got ${[...uniqueModels].join(', ')})`);
  assert.equal(models[0], 'gpt-5.4-mini', 'snapshot captured BEFORE the mutation');
});

test('AbortSignal: abort before iter 2 stops loop cleanly', async () => {
  const specDb = makeSpecDb();
  const controller = new AbortController();
  let callCount = 0;
  const runOverride = async () => {
    callCount += 1;
    if (callCount === 1) {
      // Abort signal BEFORE iteration 2 fires
      controller.abort();
    }
    return { status: 'below_threshold', run_number: callCount };
  };

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    signal: controller.signal,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(callCount, 1, 'iteration 2 must not start after abort');
  assert.equal(result.iterations, 1);
  assert.equal(result.final_status, 'aborted');
});

test('AbortSignal: already-aborted signal → no iterations run', async () => {
  const specDb = makeSpecDb();
  const controller = new AbortController();
  controller.abort();
  let callCount = 0;
  const runOverride = async () => { callCount += 1; return { status: 'below_threshold' }; };

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    signal: controller.signal,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(callCount, 0, 'no iterations fire when signal already aborted');
  assert.equal(result.iterations, 0);
  assert.equal(result.final_status, 'aborted');
});

// ── onLoopProgress pill shape (Stage 3) ──────────────────────────────
// WHY: Canonical two-budget pill shape per active-operations-upgrade §6.
// Per-iteration events carry final_status=null; a terminal event fires once
// after the loop exits with the computed final_status. Shape is identical
// across all finders so LoopProgressRouter can shape-detect on the frontend.

test('onLoopProgress emits pre+post pill per iteration + 1 terminal with publisher gate data', async () => {
  const specDb = makeSpecDb();
  // WHY: result.publish mirrors the publisher's gate output in production
  // (src/features/publisher/.../publishCandidate.js) — actual evidence count,
  // confidence (0-1), threshold (0-1), required count.
  const runOverride = makeRunOverride([
    { status: 'below_threshold', candidate: { value: 4000, confidence: 60 },
      publish: { status: 'below_threshold', confidence: 0.60, threshold: 0.95, required: 1, actual: 1 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 80 },
      publish: { status: 'below_threshold', confidence: 0.80, threshold: 0.95, required: 1, actual: 1 } },
    { status: 'published', candidate: { value: 8000, confidence: 95 },
      publish: { status: 'published', confidence: 0.95, threshold: 0.95, required: 1, actual: 1 } },
  ]);
  const progressEvents = [];

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    config: { publishConfidenceThreshold: 0.95 },
    onLoopProgress: (evt) => progressEvents.push(evt),
    _runKeyFinderOverride: runOverride,
  });

  // 2 per iteration (pre + post) * 3 iterations + 1 terminal = 7.
  assert.equal(progressEvents.length, 7, '3 pre-iter + 3 post-iter + 1 terminal');

  // Every event shares the same loop_id.
  assert.ok(progressEvents.every((e) => e.loop_id === result.loop_id));

  // Intermediate events carry final_status=null + threshold=95 (from config),
  // evidenceTarget=1 (from POLLING_RATE_RULE has no evidence rule → default 1).
  for (let i = 0; i < 6; i += 1) {
    assert.equal(progressEvents[i].final_status, null);
    assert.equal(progressEvents[i].publish.evidenceTarget, 1);
    assert.equal(progressEvents[i].publish.threshold, 95, 'threshold normalized to 0-100');
    assert.equal(progressEvents[i].callBudget.budget, 5);
  }

  // callBudget.used ticks: pre-1=1, post-1=1, pre-2=2, post-2=2, pre-3=3, post-3=3
  assert.equal(progressEvents[0].callBudget.used, 1, 'pre-iter 1');
  assert.equal(progressEvents[1].callBudget.used, 1, 'post-iter 1');
  assert.equal(progressEvents[5].callBudget.used, 3, 'post-iter 3');

  // Pre-iter pills never have satisfied=true (iter hasn't run yet).
  assert.equal(progressEvents[0].publish.satisfied, false);

  // Post-iter 1 — confidence 60 from publisher (0.6 → 60).
  assert.equal(progressEvents[1].publish.confidence, 60);
  assert.equal(progressEvents[1].publish.evidenceCount, 1);

  // Pre-iter 2 carries previous-best evidence/confidence (sticky between iters).
  assert.equal(progressEvents[2].publish.confidence, 60, 'pre-iter shows last best until new call returns');

  // Post-iter 3 published → satisfied + confidence 95.
  assert.equal(progressEvents[5].publish.satisfied, true);
  assert.equal(progressEvents[5].publish.confidence, 95);

  // Terminal pill — final_status='published', threshold present.
  const terminal = progressEvents[6];
  assert.equal(terminal.final_status, 'published');
  assert.equal(terminal.publish.satisfied, true);
  assert.equal(terminal.publish.confidence, 95);
  assert.equal(terminal.publish.threshold, 95);
  assert.equal(terminal.callBudget.used, 3);
  assert.equal(terminal.callBudget.exhausted, false, 'early-stopped before budget');
});

test('onLoopProgress: budget_exhausted path sets final_status + exhausted=true on terminal', async () => {
  const specDb = makeSpecDb();
  // Budget is 5 for this rule.
  const runOverride = makeRunOverride([
    { status: 'below_threshold', candidate: { value: 4000, confidence: 50 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 55 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 60 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 65 } },
    { status: 'below_threshold', candidate: { value: 4000, confidence: 70 } },
  ]);
  const events = [];

  await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    onLoopProgress: (e) => events.push(e),
    _runKeyFinderOverride: runOverride,
  });

  const terminal = events[events.length - 1];
  assert.equal(terminal.final_status, 'budget_exhausted');
  assert.equal(terminal.publish.satisfied, false);
  assert.equal(terminal.callBudget.used, 5);
  assert.equal(terminal.callBudget.budget, 5);
  assert.equal(terminal.callBudget.exhausted, true, 'used === budget → exhausted');
});

test('onLoopProgress: definitive_unk path emits terminal with final_status set', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'unk', unknown_reason: 'Manufacturer does not disclose' },
  ]);
  const events = [];

  await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    onLoopProgress: (e) => events.push(e),
    _runKeyFinderOverride: runOverride,
  });

  const terminal = events[events.length - 1];
  assert.equal(terminal.final_status, 'definitive_unk');
  assert.equal(terminal.publish.satisfied, false);
  assert.equal(terminal.callBudget.used, 1);
});

test('onLoopProgress: aborted path emits terminal with final_status=aborted', async () => {
  const specDb = makeSpecDb();
  const controller = new AbortController();
  controller.abort(); // abort before the loop body runs
  const events = [];

  await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY, signal: controller.signal,
    onLoopProgress: (e) => events.push(e),
    _runKeyFinderOverride: async () => ({ status: 'below_threshold' }),
  });

  // Zero per-iteration events (loop body never ran). One terminal event.
  assert.equal(events.length, 1, 'only the terminal pill fires when the signal is pre-aborted');
  assert.equal(events[0].final_status, 'aborted');
  assert.equal(events[0].callBudget.used, 0);
});

test('onLoopProgress: skipped_resolved path emits single terminal pill before early-return', async () => {
  const specDb = makeSpecDb({
    settings: { ...KNOBS, reloopRunBudget: '0' },
    resolvedPrimary: true,
  });
  const events = [];

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    onLoopProgress: (e) => events.push(e),
    _runKeyFinderOverride: async () => { throw new Error('LLM must not be called'); },
  });

  assert.equal(events.length, 1, 'exactly one pill fires in the skip branch');
  assert.equal(events[0].final_status, 'skipped_resolved');
  assert.equal(events[0].publish.satisfied, true, 'primary is already resolved');
  assert.equal(events[0].callBudget.budget, 0);
  assert.equal(events[0].loop_id, result.loop_id);
});

test('reserved field_key rejected before any iteration fires', async () => {
  const specDb = makeSpecDb();
  let callCount = 0;
  const runOverride = async () => { callCount += 1; return { status: 'below_threshold' }; };

  await assert.rejects(
    () => runKeyFinderLoop({
      product: PRODUCT, fieldKey: 'release_date', category: 'mouse',
      specDb, policy: POLICY,
      _runKeyFinderOverride: runOverride,
    }),
    /reserved/i,
  );
  assert.equal(callCount, 0);
});

test('missing field rule throws before any iteration fires', async () => {
  const specDb = makeSpecDb();
  let callCount = 0;
  const runOverride = async () => { callCount += 1; return { status: 'below_threshold' }; };

  await assert.rejects(
    () => runKeyFinderLoop({
      product: PRODUCT, fieldKey: 'nonexistent_key', category: 'mouse',
      specDb, policy: POLICY,
      _runKeyFinderOverride: runOverride,
    }),
    /missing_field_rule/,
  );
  assert.equal(callCount, 0);
});

// ─── reloopRunBudget — re-loop on already-published primary ──────────────

test('primary already resolved + default reloopRunBudget=1 → exactly 1 iteration', async () => {
  const specDb = makeSpecDb({
    settings: { ...KNOBS, reloopRunBudget: '1' },
    resolvedPrimary: true,
  });
  const runOverride = makeRunOverride([
    { status: 'below_threshold', candidate: { value: 4000, confidence: 50 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 1, 'attempts capped to reloopRunBudget=1');
  assert.equal(runOverride.callCount(), 1);
});

test('primary already resolved + reloopRunBudget=0 → 0 iterations, final_status=skipped_resolved', async () => {
  const specDb = makeSpecDb({
    settings: { ...KNOBS, reloopRunBudget: '0' },
    resolvedPrimary: true,
  });
  const runOverride = makeRunOverride([]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 0);
  assert.equal(result.final_status, 'skipped_resolved');
  assert.equal(runOverride.callCount(), 0, 'no LLM calls made');
  assert.deepEqual(result.runs, []);
});

test('primary already resolved + reloopRunBudget=3 → up to 3 iterations, exits early on published', async () => {
  const specDb = makeSpecDb({
    settings: { ...KNOBS, reloopRunBudget: '3' },
    resolvedPrimary: true,
  });
  const runOverride = makeRunOverride([
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 1, 'published on iter 1 → normal published-exit');
  assert.equal(result.final_status, 'published');
});

test('primary NOT resolved → reloopRunBudget is ignored, full attempts used', async () => {
  const specDb = makeSpecDb({
    settings: { ...KNOBS, reloopRunBudget: '1' },
    resolvedPrimary: false,
  });
  // medium/mandatory/always/1-variant → attempts=5
  const runOverride = makeRunOverride([
    { status: 'below_threshold' },
    { status: 'below_threshold' },
    { status: 'below_threshold' },
    { status: 'below_threshold' },
    { status: 'below_threshold' },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(result.iterations, 5, 'unresolved primary uses full budget, ignores reloopRunBudget');
  assert.equal(result.final_status, 'budget_exhausted');
});

test('loop threads mode="loop" to every inner runKeyFinder call', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'below_threshold' },
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.ok(runOverride.calls.length >= 1);
  for (const call of runOverride.calls) {
    assert.equal(call.opts.mode, 'loop', `iter ${call.idx} must pass mode='loop'`);
  }
});

test('return envelope shape: {iterations, final_status, loop_id, runs, last_result}', async () => {
  const specDb = makeSpecDb();
  const runOverride = makeRunOverride([
    { status: 'published', candidate: { value: 8000, confidence: 92 } },
  ]);

  const result = await runKeyFinderLoop({
    product: PRODUCT, fieldKey: 'polling_rate', category: 'mouse',
    specDb, policy: POLICY,
    _runKeyFinderOverride: runOverride,
  });

  assert.equal(typeof result.iterations, 'number');
  assert.equal(typeof result.final_status, 'string');
  assert.equal(typeof result.loop_id, 'string');
  assert.ok(Array.isArray(result.runs));
  assert.ok(result.last_result);
  assert.equal(result.last_result.status, 'published');
});
