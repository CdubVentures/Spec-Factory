/**
 * runVariantFieldLoop — contract tests.
 *
 * Exhaustive boundary matrix for the generic per-variant retry loop that wraps
 * runPerVariant for variantFieldProducer modules (RDF, and future MSRP / weight
 * / dimension finders). The loop owns attempt counting, satisfaction short-
 * circuit, loop_id generation, and onLoopProgress emission.
 *
 * Internals of produceForVariant and satisfactionPredicate are black-boxes
 * owned by consumer modules — tested only through their observable effects.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runVariantFieldLoop } from '../variantFieldLoop.js';

function makeSpecDbStub(variants) {
  return { variants: { listActive: () => variants } };
}

function variantRow({ id, key, label = key, type = 'color' }) {
  return { variant_id: id, variant_key: key, variant_label: label, variant_type: type };
}

const ONE_BLACK = [variantRow({ id: 'v1', key: 'color:black', label: 'Black' })];
const TWO_VARIANTS = [
  variantRow({ id: 'v1', key: 'color:black', label: 'Black' }),
  variantRow({ id: 'v2', key: 'color:white', label: 'White' }),
];
const PRODUCT = { product_id: 'p1', category: 'mouse' };

const constBudget = (n) => () => n;

describe('runVariantFieldLoop', () => {
  it('stops a variant after the first satisfied attempt', async () => {
    const calls = [];
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(3),
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ key: variant.key, attempt: ctx.attempt });
        return { ok: true };
      },
      satisfactionPredicate: (r) => r?.ok === true,
    });

    assert.equal(out.rejected, false);
    assert.equal(calls.length, 1, 'only one attempt because the first satisfied');
    assert.equal(calls[0].attempt, 1);
  });

  it('exhausts the budget when the predicate never returns true', async () => {
    const calls = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(3),
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ attempt: ctx.attempt });
        return { ok: false };
      },
      satisfactionPredicate: () => false,
    });

    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((c) => c.attempt), [1, 2, 3]);
  });

  it('budget=1 behaves like a single call (no retry)', async () => {
    const calls = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(1),
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ attempt: ctx.attempt });
        return null;
      },
      satisfactionPredicate: () => false,
    });

    assert.equal(calls.length, 1);
  });

  it('budget=0 skips the variant entirely (no produceForVariant call)', async () => {
    let produceCalls = 0;
    const events = [];
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(0),
      staggerMs: 0,
      evidenceTarget: 2,
      thresholdPct: 95,
      produceForVariant: () => { produceCalls++; return null; },
      satisfactionPredicate: () => false,
      onLoopProgress: (ev) => events.push(ev),
    });

    assert.equal(produceCalls, 0, 'produceForVariant is NOT called when budget is 0');
    assert.equal(events.length, 1, 'exactly one skip event is emitted');
    // Pill shape (publisher-driven): skip emits final_status='skipped_resolved' with
    // evidenceCount === evidenceTarget (already-resolved variant has all evidence).
    assert.equal(events[0].final_status, 'skipped_resolved');
    assert.equal(events[0].publish.satisfied, true);
    assert.equal(events[0].publish.evidenceCount, 2);
    assert.equal(events[0].publish.evidenceTarget, 2);
    assert.equal(events[0].publish.threshold, 95);
    assert.equal(events[0].callBudget.used, 0);
    assert.equal(events[0].callBudget.budget, 0);

    const pvr = out.perVariantResults[0];
    assert.equal(pvr.result._loop.skipped, true);
    assert.equal(pvr.result._loop.attempts, 0);
    assert.equal(pvr.result._loop.satisfied, true);
  });

  it('coerces non-integer / negative budgets to 0 (skip)', async () => {
    // WHY: caller is responsible for budget hygiene; engine treats garbage as 0.
    let produceCalls = 0;
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: () => Number.NaN,
      staggerMs: 0,
      produceForVariant: () => { produceCalls++; return null; },
      satisfactionPredicate: () => false,
    });
    assert.equal(produceCalls, 0, 'NaN budget → skip');

    produceCalls = 0;
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(-3),
      staggerMs: 0,
      produceForVariant: () => { produceCalls++; return null; },
      satisfactionPredicate: () => false,
    });
    assert.equal(produceCalls, 0, 'negative budget → skip');
  });

  it('resolveBudget can return different values per variant', async () => {
    const calls = [];
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      resolveBudget: (v) => v.key === 'color:black' ? 0 : 2,
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ key: variant.key, attempt: ctx.attempt });
        return null;
      },
      satisfactionPredicate: () => false,
    });

    const black = calls.filter((c) => c.key === 'color:black');
    const white = calls.filter((c) => c.key === 'color:white');
    assert.equal(black.length, 0, 'black skipped (budget=0)');
    assert.equal(white.length, 2, 'white exhausts its 2-call budget');

    const blackResult = out.perVariantResults.find((r) => r.variant.key === 'color:black');
    assert.equal(blackResult.result._loop.skipped, true);
  });

  it('isolates variants: one satisfies early while the other exhausts', async () => {
    const calls = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      resolveBudget: constBudget(3),
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ key: variant.key, attempt: ctx.attempt });
        return { variant: variant.key };
      },
      satisfactionPredicate: (r) => r?.variant === 'color:black',
    });

    const black = calls.filter((c) => c.key === 'color:black');
    const white = calls.filter((c) => c.key === 'color:white');
    assert.equal(black.length, 1, 'black satisfies on attempt 1');
    assert.equal(white.length, 3, 'white exhausts the full budget');
  });

  it('passes variantKey through to runPerVariant (filters to one variant)', async () => {
    const calls = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      variantKey: 'color:black',
      resolveBudget: constBudget(2),
      staggerMs: 0,
      produceForVariant: (variant, i, ctx) => {
        calls.push({ key: variant.key, attempt: ctx.attempt });
        return null;
      },
      satisfactionPredicate: () => false,
    });

    assert.equal(calls.length, 2, 'only the filtered variant runs, for 2 attempts');
    assert.ok(calls.every((c) => c.key === 'color:black'));
  });

  it('propagates no_cef_data rejection when the generator has no variants', async () => {
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub([]),
      product: PRODUCT,
      resolveBudget: constBudget(3),
      staggerMs: 0,
      produceForVariant: () => { throw new Error('should not be called'); },
      satisfactionPredicate: () => false,
    });
    assert.equal(out.rejected, true);
    assert.equal(out.rejections[0].reason_code, 'no_cef_data');
  });

  it('propagates unknown_variant rejection when variantKey is not found', async () => {
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      variantKey: 'color:purple',
      resolveBudget: constBudget(3),
      staggerMs: 0,
      produceForVariant: () => { throw new Error('should not be called'); },
      satisfactionPredicate: () => false,
    });
    assert.equal(out.rejected, true);
    assert.equal(out.rejections[0].reason_code, 'unknown_variant');
  });

  it('shares a single loopId across all attempts within a call, and uses a new one on the next call', async () => {
    const events1 = [];
    const r1 = await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      resolveBudget: constBudget(2),
      staggerMs: 0,
      produceForVariant: () => ({ ok: false }),
      satisfactionPredicate: () => false,
      onLoopProgress: (ev) => events1.push(ev),
    });
    const events2 = [];
    const r2 = await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      resolveBudget: constBudget(2),
      staggerMs: 0,
      produceForVariant: () => ({ ok: false }),
      satisfactionPredicate: () => false,
      onLoopProgress: (ev) => events2.push(ev),
    });

    // Pill shape carries loop_id (snake_case) as part of the canonical Stage 3 contract.
    const ids1 = new Set(events1.map((e) => e.loop_id));
    const ids2 = new Set(events2.map((e) => e.loop_id));
    assert.equal(ids1.size, 1, 'all events in call #1 share one loop_id');
    assert.equal(ids2.size, 1, 'all events in call #2 share one loop_id');
    assert.notEqual([...ids1][0], [...ids2][0], 'two calls have different loop_ids');
    assert.equal(r1.loopId, [...ids1][0]);
    assert.equal(r2.loopId, [...ids2][0]);
  });

  it('onLoopProgress emits pre+post per attempt + 1 terminal pill per variant', async () => {
    const events = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(5),
      staggerMs: 0,
      evidenceTarget: 1,
      thresholdPct: 95,
      // result.publish mirrors the publisher's gate snapshot (see
      // variantScalarFieldProducer.js — `publish` field on produceForVariant
      // result). Here we simulate the publisher gating each attempt.
      produceForVariant: (v, i, ctx) => ({
        attempt: ctx.attempt,
        publish: {
          status: ctx.attempt === 3 ? 'published' : 'below_threshold',
          confidence: ctx.attempt === 3 ? 0.95 : 0.60,
          threshold: 0.95,
          required: 1,
          actual: 1,
        },
      }),
      satisfactionPredicate: (r) => r.attempt === 3,
      onLoopProgress: (ev) => events.push(ev),
    });

    // 2 per attempt (pre + post) × 3 attempts + 1 terminal = 7.
    assert.equal(events.length, 7, '3 pre-attempt + 3 post-attempt + 1 terminal');

    // Every event carries threshold=95 (from opts) and evidenceTarget=1.
    for (let i = 0; i < 6; i += 1) {
      assert.equal(events[i].final_status, null);
      assert.equal(events[i].publish.evidenceTarget, 1);
      assert.equal(events[i].publish.threshold, 95);
      assert.equal(events[i].callBudget.budget, 5);
    }

    // post-attempt 1 — confidence from the publisher's 0.60 → 60.
    assert.equal(events[1].publish.confidence, 60);
    assert.equal(events[1].publish.satisfied, false);

    // post-attempt 3 — published → satisfied + confidence 95.
    assert.equal(events[5].publish.satisfied, true);
    assert.equal(events[5].publish.confidence, 95);
    assert.equal(events[5].callBudget.used, 3);

    // Terminal pill — final_status='published' + variant identity preserved.
    const terminal = events[6];
    assert.equal(terminal.final_status, 'published');
    assert.equal(terminal.publish.satisfied, true);
    assert.equal(terminal.publish.confidence, 95);
    assert.equal(terminal.callBudget.used, 3);
    assert.equal(terminal.variantKey, 'color:black');
    assert.equal(terminal.variantLabel, 'Black');
  });

  it('onLoopProgress: budget exhausted variant emits terminal with final_status=budget_exhausted', async () => {
    const events = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(3),
      staggerMs: 0,
      evidenceTarget: 2,
      thresholdPct: 95,
      produceForVariant: () => ({
        ok: false,
        publish: { status: 'below_evidence_refs', required: 2, actual: 1, confidence: 0.4 },
      }),
      satisfactionPredicate: () => false,
      onLoopProgress: (ev) => events.push(ev),
    });

    // 3 attempts × 2 (pre+post) + 1 terminal = 7.
    assert.equal(events.length, 7);
    const terminal = events[events.length - 1];
    assert.equal(terminal.final_status, 'budget_exhausted');
    assert.equal(terminal.publish.satisfied, false);
    assert.equal(terminal.publish.evidenceCount, 1, 'publisher counted 1 ref of 2 required');
    assert.equal(terminal.publish.evidenceTarget, 2);
    assert.equal(terminal.callBudget.used, 3);
    assert.equal(terminal.callBudget.budget, 3);
    assert.equal(terminal.callBudget.exhausted, true);
  });

  it('onLoopProgress: multi-variant emits complete pill lifecycle per variant', async () => {
    // One variant publishes on attempt 1; the other exhausts its 2-call budget.
    const events = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(TWO_VARIANTS),
      product: PRODUCT,
      resolveBudget: constBudget(2),
      staggerMs: 0,
      evidenceTarget: 1,
      thresholdPct: 95,
      produceForVariant: (variant) => ({ variant: variant.key }),
      satisfactionPredicate: (r) => r?.variant === 'color:black',
      onLoopProgress: (ev) => events.push(ev),
    });

    // Per-variant cadence: black = 2 (pre+post) + 1 terminal = 3.
    // Per-variant cadence: white = 4 (pre+post × 2) + 1 terminal = 5.
    // Total = 8.
    assert.equal(events.length, 8);

    const blackTerminal = events.find((e) => e.variantKey === 'color:black' && e.final_status);
    assert.equal(blackTerminal?.final_status, 'published');
    const whiteTerminal = events.find((e) => e.variantKey === 'color:white' && e.final_status);
    assert.equal(whiteTerminal?.final_status, 'budget_exhausted');
  });

  it('surfaces the last result (with _loop metadata) when budget exhausts', async () => {
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(2),
      staggerMs: 0,
      produceForVariant: (v, i, ctx) => ({ tag: `attempt-${ctx.attempt}` }),
      satisfactionPredicate: () => false,
    });

    const pvr = out.perVariantResults[0];
    assert.equal(pvr.result.tag, 'attempt-2', 'last attempt result is surfaced');
    assert.equal(pvr.result._loop.attempts, 2);
    assert.equal(pvr.result._loop.satisfied, false);
    assert.equal(pvr.result._loop.loopId, out.loopId);
  });

  it('surfaces the satisfying result (with _loop metadata) when predicate returns true early', async () => {
    const out = await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(5),
      staggerMs: 0,
      produceForVariant: (v, i, ctx) => ({ tag: `attempt-${ctx.attempt}` }),
      satisfactionPredicate: (r) => r.tag === 'attempt-2',
    });

    const pvr = out.perVariantResults[0];
    assert.equal(pvr.result.tag, 'attempt-2');
    assert.equal(pvr.result._loop.attempts, 2);
    assert.equal(pvr.result._loop.satisfied, true);
  });
});
