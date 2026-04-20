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
      produceForVariant: () => { produceCalls++; return null; },
      satisfactionPredicate: () => false,
      onLoopProgress: (ev) => events.push(ev),
    });

    assert.equal(produceCalls, 0, 'produceForVariant is NOT called when budget is 0');
    assert.equal(events.length, 1, 'exactly one skip event is emitted');
    assert.equal(events[0].skipped, true);
    assert.equal(events[0].satisfied, true);
    assert.equal(events[0].attempt, 0);
    assert.equal(events[0].budget, 0);

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

    const ids1 = new Set(events1.map((e) => e.loopId));
    const ids2 = new Set(events2.map((e) => e.loopId));
    assert.equal(ids1.size, 1, 'all attempts in call #1 share one loopId');
    assert.equal(ids2.size, 1, 'all attempts in call #2 share one loopId');
    assert.notEqual([...ids1][0], [...ids2][0], 'two calls have different loopIds');
    assert.equal(r1.loopId, [...ids1][0]);
    assert.equal(r2.loopId, [...ids2][0]);
  });

  it('onLoopProgress emits satisfied=true only on the final stopping attempt', async () => {
    const events = [];
    await runVariantFieldLoop({
      specDb: makeSpecDbStub(ONE_BLACK),
      product: PRODUCT,
      resolveBudget: constBudget(5),
      staggerMs: 0,
      produceForVariant: (v, i, ctx) => ({ attempt: ctx.attempt }),
      satisfactionPredicate: (r) => r.attempt === 3,
      onLoopProgress: (ev) => events.push(ev),
    });

    assert.equal(events.length, 3, 'stopped after attempt 3 — no further emissions');
    assert.equal(events[0].satisfied, false);
    assert.equal(events[1].satisfied, false);
    assert.equal(events[2].satisfied, true);
    assert.equal(events[2].attempt, 3);
    assert.equal(events[2].budget, 5);
    assert.equal(events[2].variantKey, 'color:black');
    assert.equal(events[2].variantLabel, 'Black');
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
