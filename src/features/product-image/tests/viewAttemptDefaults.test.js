import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_VIEW_ATTEMPT_DEFAULTS,
  GENERIC_VIEW_ATTEMPT_DEFAULT,
  resolveViewAttemptBudgets,
} from '../viewAttemptDefaults.js';

/* ── Registry invariants ────────────────────────────────────────── */

describe('CATEGORY_VIEW_ATTEMPT_DEFAULTS', () => {
  it('has mouse, keyboard, monitor, mousepad', () => {
    assert.deepEqual(
      Object.keys(CATEGORY_VIEW_ATTEMPT_DEFAULTS).sort(),
      ['keyboard', 'monitor', 'mouse', 'mousepad'],
    );
  });

  it('every value across all categories >= 2 (floor invariant)', () => {
    for (const [category, map] of Object.entries(CATEGORY_VIEW_ATTEMPT_DEFAULTS)) {
      for (const [view, attempts] of Object.entries(map)) {
        assert.ok(
          attempts >= 2,
          `${category}.${view} = ${attempts}, expected >= 2`,
        );
      }
    }
  });

  it('mouse follows 4,4,3,3,2,2 priority-descending pattern', () => {
    const vals = Object.values(CATEGORY_VIEW_ATTEMPT_DEFAULTS.mouse);
    assert.deepEqual(vals, [4, 4, 3, 3, 2, 2]);
  });
});

describe('GENERIC_VIEW_ATTEMPT_DEFAULT', () => {
  it('is a number >= 2', () => {
    assert.equal(typeof GENERIC_VIEW_ATTEMPT_DEFAULT, 'number');
    assert.ok(GENERIC_VIEW_ATTEMPT_DEFAULT >= 2);
  });
});

/* ── resolveViewAttemptBudgets ──────────────────────────────────── */

describe('resolveViewAttemptBudgets', () => {
  // Category defaults (empty setting → use registry)

  it('empty setting + mouse → category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '', 'mouse', ['top', 'left', 'angle', 'sangle', 'front', 'bottom'], 5,
    );
    assert.deepEqual(result, { top: 4, left: 4, angle: 3, sangle: 3, front: 2, bottom: 2 });
  });

  it('empty setting + keyboard → category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '', 'keyboard', ['top', 'left', 'angle', 'sangle'], 5,
    );
    assert.deepEqual(result, { top: 4, left: 4, angle: 3, sangle: 3 });
  });

  it('empty setting + monitor → category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '', 'monitor', ['front', 'angle', 'rear', 'left'], 5,
    );
    assert.deepEqual(result, { front: 4, angle: 4, rear: 3, left: 3 });
  });

  it('empty setting + mousepad → category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '', 'mousepad', ['top', 'angle'], 5,
    );
    assert.deepEqual(result, { top: 4, angle: 4 });
  });

  // Unknown category → flat fallback

  it('empty setting + unknown category → flat fallback for all views', () => {
    const result = resolveViewAttemptBudgets(
      '', 'headset', ['top', 'left', 'angle'], 5,
    );
    assert.deepEqual(result, { top: 5, left: 5, angle: 5 });
  });

  // JSON override (partial merge with category defaults)

  it('JSON override partial, merges with category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '{"front":5}', 'mouse', ['top', 'left', 'front'], 5,
    );
    assert.deepEqual(result, { top: 4, left: 4, front: 5 });
  });

  // Floor clamping

  it('JSON override of 1 respected (floor is 1)', () => {
    const result = resolveViewAttemptBudgets(
      '{"top":1}', 'mouse', ['top'], 5,
    );
    assert.deepEqual(result, { top: 1 });
  });

  it('JSON override at 2 kept as-is', () => {
    const result = resolveViewAttemptBudgets(
      '{"top":2}', 'mouse', ['top'], 5,
    );
    assert.deepEqual(result, { top: 2 });
  });

  it('flat fallback of 0 clamped to 1', () => {
    const result = resolveViewAttemptBudgets(
      '', 'headset', ['top'], 0,
    );
    assert.deepEqual(result, { top: 1 });
  });

  // Invalid JSON → falls through to category defaults

  it('invalid JSON string falls through to category defaults', () => {
    const result = resolveViewAttemptBudgets(
      'not json', 'mouse', ['top', 'left'], 5,
    );
    assert.deepEqual(result, { top: 4, left: 4 });
  });

  it('array JSON (wrong shape) falls through to category defaults', () => {
    const result = resolveViewAttemptBudgets(
      '[1,2,3]', 'mouse', ['top'], 5,
    );
    assert.deepEqual(result, { top: 4 });
  });

  // View not in category defaults → flat fallback

  it('view not in category defaults uses flat fallback', () => {
    const result = resolveViewAttemptBudgets(
      '', 'mouse', ['top', 'right'], 7,
    );
    assert.deepEqual(result, { top: 4, right: 7 });
  });
});
