import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCarousel } from '../carouselStrategy.js';

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Build a quality-passing image for a view+variant. */
function img(view, variantKey = 'color:black', quality_pass = true) {
  return { view, variant_key: variantKey, quality_pass };
}

/** Shorthand: N quality-passing images for a single view. */
function nImgs(view, n, variantKey = 'color:black') {
  return Array.from({ length: n }, () => img(view, variantKey));
}

const MOUSE_BUDGET = ['top', 'left', 'angle', 'sangle', 'front', 'bottom'];
const SMALL_BUDGET = ['top', 'left'];
const VARIANT = 'color:black';

/* ── Contract: evaluateCarousel ───────────────────────────────────── */

describe('evaluateCarousel', () => {

  /* ── Basic contract shape ────────────────────────────────────── */

  it('returns the expected shape with all required fields', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.ok(result);
    assert.ok(['view', 'hero', 'complete'].includes(result.mode));
    assert.ok(Array.isArray(result.viewsToSearch));
    assert.ok(result.carouselProgress);
    assert.equal(typeof result.carouselProgress.viewsFilled, 'number');
    assert.equal(typeof result.carouselProgress.viewsTotal, 'number');
    assert.ok(result.carouselProgress.viewDetails);
    assert.equal(typeof result.carouselProgress.heroCount, 'number');
    assert.equal(typeof result.carouselProgress.heroTarget, 'number');
    assert.equal(typeof result.carouselProgress.heroSatisfied, 'boolean');
    assert.equal(typeof result.isComplete, 'boolean');
  });

  /* ── Empty state ─────────────────────────────────────────────── */

  it('empty images → mode view, all budget views unsatisfied', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'view');
    assert.deepEqual(result.viewsToSearch.sort(), [...MOUSE_BUDGET].sort());
    assert.equal(result.carouselProgress.viewsFilled, 0);
    assert.equal(result.carouselProgress.viewsTotal, MOUSE_BUDGET.length);
    assert.equal(result.isComplete, false);
  });

  /* ── Partial fill ────────────────────────────────────────────── */

  it('some views satisfied, others not → mode view, only unsatisfied views returned', () => {
    const images = [
      ...nImgs('top', 3),    // satisfied
      ...nImgs('left', 3),   // satisfied
      ...nImgs('angle', 1),  // NOT satisfied (only 1 of 3)
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'view');
    // top and left satisfied; angle, sangle, front, bottom still needed
    assert.ok(!result.viewsToSearch.includes('top'));
    assert.ok(!result.viewsToSearch.includes('left'));
    assert.ok(result.viewsToSearch.includes('angle'));
    assert.ok(result.viewsToSearch.includes('sangle'));
    assert.ok(result.viewsToSearch.includes('front'));
    assert.ok(result.viewsToSearch.includes('bottom'));
    assert.equal(result.carouselProgress.viewsFilled, 2);
  });

  /* ── All views satisfied → hero needed ───────────────────────── */

  it('all budget views satisfied, hero enabled → mode hero', () => {
    const images = MOUSE_BUDGET.flatMap(v => nImgs(v, 3));
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'hero');
    assert.deepEqual(result.viewsToSearch, []);
    assert.equal(result.carouselProgress.viewsFilled, MOUSE_BUDGET.length);
    assert.equal(result.carouselProgress.heroSatisfied, false);
    assert.equal(result.isComplete, false);
  });

  /* ── All views + hero satisfied → complete ───────────────────── */

  it('all views and hero satisfied → mode complete', () => {
    const images = [
      ...MOUSE_BUDGET.flatMap(v => nImgs(v, 3)),
      ...nImgs('hero', 3),
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'complete');
    assert.deepEqual(result.viewsToSearch, []);
    assert.equal(result.carouselProgress.viewsFilled, MOUSE_BUDGET.length);
    assert.equal(result.carouselProgress.heroSatisfied, true);
    assert.equal(result.isComplete, true);
  });

  /* ── Hero disabled → skip hero, complete after views ─────────── */

  it('hero disabled, all views satisfied → complete (skip hero)', () => {
    const images = MOUSE_BUDGET.flatMap(v => nImgs(v, 3));
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: MOUSE_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'complete');
    assert.equal(result.carouselProgress.heroSatisfied, true);
    assert.equal(result.isComplete, true);
  });

  /* ── Wrong variant ignored ───────────────────────────────────── */

  it('images from different variant are not counted', () => {
    const images = SMALL_BUDGET.flatMap(v => nImgs(v, 3, 'color:red'));
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: 'color:black',
    });

    assert.equal(result.mode, 'view');
    assert.equal(result.carouselProgress.viewsFilled, 0);
    assert.deepEqual(result.viewsToSearch.sort(), [...SMALL_BUDGET].sort());
  });

  /* ── Quality-fail images not counted ─────────────────────────── */

  it('quality_pass === false images are not counted toward budget', () => {
    const images = [
      ...nImgs('top', 3),                             // 3 passing
      img('left', VARIANT, false),                     // fail
      img('left', VARIANT, false),                     // fail
      img('left', VARIANT, false),                     // fail — all 3 fail
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    assert.equal(result.carouselProgress.viewDetails.top.count, 3);
    assert.equal(result.carouselProgress.viewDetails.top.satisfied, true);
    assert.equal(result.carouselProgress.viewDetails.left.count, 0);
    assert.equal(result.carouselProgress.viewDetails.left.satisfied, false);
    assert.equal(result.carouselProgress.viewsFilled, 1);
  });

  /* ── Non-budget views in collected images are ignored for budget ─ */

  it('images for non-budget views are not counted toward viewsFilled', () => {
    const images = [
      ...nImgs('top', 3),     // budgeted, satisfied
      ...nImgs('right', 5),   // NOT in budget — should not count
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    // 'right' is not in SMALL_BUDGET, so viewsFilled should be 1 (only 'top')
    assert.equal(result.carouselProgress.viewsFilled, 1);
    assert.equal(result.carouselProgress.viewsTotal, 2);
    assert.ok(!result.carouselProgress.viewDetails.right);
  });

  /* ── Empty budget → skip directly to hero ────────────────────── */

  it('empty viewBudget → all views "satisfied", jumps to hero', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: [],
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 2,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'hero');
    assert.equal(result.carouselProgress.viewsFilled, 0);
    assert.equal(result.carouselProgress.viewsTotal, 0);
    assert.deepEqual(result.viewsToSearch, []);
  });

  /* ── Empty budget + hero disabled → complete immediately ─────── */

  it('empty viewBudget + hero disabled → complete', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: [],
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'complete');
    assert.equal(result.isComplete, true);
  });

  /* ── Threshold = 1 ───────────────────────────────────────────── */

  it('threshold = 1 → single quality image satisfies a view', () => {
    const images = [img('top'), img('left')];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 1,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'complete');
    assert.equal(result.carouselProgress.viewsFilled, 2);
    assert.equal(result.isComplete, true);
  });

  /* ── Hero partially filled ───────────────────────────────────── */

  it('views done, hero partially filled → mode hero', () => {
    const images = [
      ...SMALL_BUDGET.flatMap(v => nImgs(v, 3)),
      ...nImgs('hero', 1),  // 1 of 3
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'hero');
    assert.equal(result.carouselProgress.heroCount, 1);
    assert.equal(result.carouselProgress.heroTarget, 3);
    assert.equal(result.carouselProgress.heroSatisfied, false);
  });

  /* ── viewDetails has correct per-view counts ─────────────────── */

  it('viewDetails reports accurate per-view counts and satisfied flags', () => {
    const images = [
      ...nImgs('top', 5),    // over threshold
      ...nImgs('left', 2),   // under threshold
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    assert.equal(result.carouselProgress.viewDetails.top.count, 5);
    assert.equal(result.carouselProgress.viewDetails.top.satisfied, true);
    assert.equal(result.carouselProgress.viewDetails.left.count, 2);
    assert.equal(result.carouselProgress.viewDetails.left.satisfied, false);
  });

  /* ── Mixed variants: only target variant counted ─────────────── */

  it('mixed variants: only target variant images counted', () => {
    const images = [
      ...nImgs('top', 3, 'color:black'),
      ...nImgs('top', 3, 'color:red'),
      ...nImgs('left', 3, 'color:black'),
      ...nImgs('left', 3, 'edition:premium'),
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: 'color:black',
    });

    assert.equal(result.mode, 'complete');
    assert.equal(result.carouselProgress.viewsFilled, 2);
  });

  /* ── quality_pass undefined treated as pass ──────────────────── */

  it('quality_pass undefined treated as true (backward compat)', () => {
    const images = [
      { view: 'top', variant_key: VARIANT },
      { view: 'top', variant_key: VARIANT },
      { view: 'top', variant_key: VARIANT },
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: ['top'],
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
    });

    assert.equal(result.carouselProgress.viewDetails.top.count, 3);
    assert.equal(result.carouselProgress.viewDetails.top.satisfied, true);
  });

  /* ── Hero images counted correctly ───────────────────────────── */

  it('hero images use view="hero" and are counted separately from view budget', () => {
    const images = [
      ...SMALL_BUDGET.flatMap(v => nImgs(v, 3)),
      img('hero'), img('hero'), img('hero'),
    ];
    const result = evaluateCarousel({
      collectedImages: images,
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });

    assert.equal(result.mode, 'complete');
    assert.equal(result.carouselProgress.heroCount, 3);
    assert.equal(result.carouselProgress.heroTarget, 3);
    assert.equal(result.carouselProgress.heroSatisfied, true);
    assert.equal(result.isComplete, true);
  });
});

/* ── Attempt tracking + focusView (loop support) ─────────────────── */

describe('evaluateCarousel: attempt tracking', () => {
  it('focusView picks first unsatisfied non-exhausted view from budget order', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 3)], // top satisfied
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptCounts: {},
    });
    assert.equal(result.focusView, 'left', 'top is satisfied, left is next');
  });

  it('exhausted view skipped for focusView but still reported', () => {
    const result = evaluateCarousel({
      collectedImages: [img('left')], // left has 1, not satisfied (needs 3)
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 2,
      viewAttemptCounts: { top: 2 }, // top exhausted (2 >= budget 2)
    });
    assert.equal(result.focusView, 'left', 'top exhausted, left is focus');
    assert.equal(result.carouselProgress.viewDetails.top.exhausted, true);
    assert.equal(result.carouselProgress.viewDetails.top.attempts, 2);
    assert.equal(result.carouselProgress.viewDetails.left.exhausted, false);
  });

  it('all views exhausted → mode transitions to hero', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 2,
      variantKey: VARIANT,
      viewAttemptBudget: 1,
      viewAttemptCounts: { top: 1, left: 1 },
    });
    assert.equal(result.mode, 'hero');
    assert.equal(result.focusView, null);
  });

  it('hero exhausted → mode = complete even if hero not satisfied', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 3), ...nImgs('left', 3), img('hero')],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3, // need 3, only have 1
      variantKey: VARIANT,
      heroAttemptBudget: 2,
      heroAttemptCount: 2, // exhausted
    });
    assert.equal(result.mode, 'complete');
    assert.equal(result.isComplete, true);
    assert.equal(result.carouselProgress.heroSatisfied, false);
    assert.equal(result.carouselProgress.heroExhausted, true);
  });

  it('estimatedCallsRemaining reflects budget minus attempts', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 1)], // top: 1/3
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 2,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptCounts: { top: 1 },
      heroAttemptBudget: 3,
      heroAttemptCount: 0,
    });
    // top: 5-1 = 4, left: 5-0 = 5, hero: 3-0 = 3 → total 12
    assert.equal(result.estimatedCallsRemaining, 12);
  });

  it('omitting new params → identical behavior (Infinity budget)', () => {
    const withParams = evaluateCarousel({
      collectedImages: [img('top')],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
      viewAttemptBudget: Infinity,
      viewAttemptCounts: {},
      heroAttemptBudget: Infinity,
      heroAttemptCount: 0,
    });
    const without = evaluateCarousel({
      collectedImages: [img('top')],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 3,
      variantKey: VARIANT,
    });
    assert.equal(withParams.mode, without.mode);
    assert.equal(withParams.isComplete, without.isComplete);
    assert.deepEqual(withParams.viewsToSearch, without.viewsToSearch);
  });

  it('focusView is null when mode is hero', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 3), ...nImgs('left', 3)],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 2,
      variantKey: VARIANT,
    });
    assert.equal(result.mode, 'hero');
    assert.equal(result.focusView, null);
  });

  it('focusView is null when mode is complete', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 3), ...nImgs('left', 3), ...nImgs('hero', 2)],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: true,
      heroCount: 2,
      variantKey: VARIANT,
    });
    assert.equal(result.mode, 'complete');
    assert.equal(result.focusView, null);
  });
});

/* ── Per-view attempt budgets (viewAttemptBudgets map) ───────────── */

describe('evaluateCarousel: per-view attempt budgets', () => {
  it('per-view budgets respected — top exhausted at 2, left at 4', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptBudgets: { top: 2, left: 4 },
      viewAttemptCounts: { top: 2, left: 2 },
    });
    assert.equal(result.carouselProgress.viewDetails.top.exhausted, true, 'top: 2 attempts >= budget 2');
    assert.equal(result.carouselProgress.viewDetails.left.exhausted, false, 'left: 2 attempts < budget 4');
    assert.equal(result.focusView, 'left');
  });

  it('missing view in map falls back to flat viewAttemptBudget', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptBudgets: { top: 3 },
      viewAttemptCounts: {},
    });
    assert.equal(result.carouselProgress.viewDetails.top.attemptBudget, 3);
    assert.equal(result.carouselProgress.viewDetails.left.attemptBudget, 5);
  });

  it('null map = backward compat (identical to flat budget)', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 3,
      viewAttemptBudgets: null,
      viewAttemptCounts: {},
    });
    assert.equal(result.carouselProgress.viewDetails.top.attemptBudget, 3);
    assert.equal(result.carouselProgress.viewDetails.left.attemptBudget, 3);
  });

  it('estimatedCallsRemaining uses per-view budgets', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptBudgets: { top: 2, left: 4 },
      viewAttemptCounts: {},
    });
    assert.equal(result.estimatedCallsRemaining, 6, '2 + 4 = 6');
  });

  it('satisfied view still uses reRunBudget, not per-view budget', () => {
    const result = evaluateCarousel({
      collectedImages: [...nImgs('top', 3)],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptBudgets: { top: 10 },
      reRunBudget: 1,
      viewAttemptCounts: {},
    });
    // top is satisfied → effectiveBudget = reRunBudget (1), not per-view (10)
    assert.equal(result.carouselProgress.viewDetails.top.attemptBudget, 1);
  });

  it('viewDetails.attemptBudget reflects per-view value for unsatisfied views', () => {
    const result = evaluateCarousel({
      collectedImages: [],
      viewBudget: SMALL_BUDGET,
      satisfactionThreshold: 3,
      heroEnabled: false,
      heroCount: 0,
      variantKey: VARIANT,
      viewAttemptBudget: 5,
      viewAttemptBudgets: { top: 2, left: 6 },
      viewAttemptCounts: {},
    });
    assert.equal(result.carouselProgress.viewDetails.top.attemptBudget, 2);
    assert.equal(result.carouselProgress.viewDetails.left.attemptBudget, 6);
  });
});
