/**
 * keyFinderRegistry — in-flight passenger registry contract tests.
 *
 * Exhaustive boundary matrix per [CLASS: BEHAVIORAL]. Module-singleton state
 * is reset before each test via _resetForTest.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  register,
  release,
  isPrimary,
  count,
  _resetForTest,
  _sizeForTest,
} from '../keyFinderRegistry.js';

describe('keyFinderRegistry — register / release round trip', () => {
  beforeEach(() => _resetForTest());

  it('register primary then release primary returns count to zero', () => {
    register('p1', 'polling_rate', 'primary');
    assert.deepEqual(count('p1', 'polling_rate'), { asPrimary: 1, asPassenger: 0, total: 1 });
    release('p1', 'polling_rate', 'primary');
    assert.deepEqual(count('p1', 'polling_rate'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });

  it('register passenger then release passenger returns count to zero', () => {
    register('p1', 'dpi', 'passenger');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 1, total: 1 });
    release('p1', 'dpi', 'passenger');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });

  it('multiple registers accumulate', () => {
    register('p1', 'dpi', 'passenger');
    register('p1', 'dpi', 'passenger');
    register('p1', 'dpi', 'passenger');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 3, total: 3 });
  });

  it('release never goes below zero', () => {
    release('p1', 'nonexistent', 'primary');
    release('p1', 'nonexistent', 'primary');
    assert.deepEqual(count('p1', 'nonexistent'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });

  it('releasing the same role more times than registered stays at 0', () => {
    register('p1', 'dpi', 'passenger');
    release('p1', 'dpi', 'passenger');
    release('p1', 'dpi', 'passenger');
    release('p1', 'dpi', 'passenger');
    assert.equal(count('p1', 'dpi').asPassenger, 0);
  });

  it('primary and passenger counts are independent on the same key', () => {
    register('p1', 'dpi', 'primary');
    register('p1', 'dpi', 'passenger');
    register('p1', 'dpi', 'passenger');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 1, asPassenger: 2, total: 3 });
    release('p1', 'dpi', 'primary');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 2, total: 2 });
    release('p1', 'dpi', 'passenger');
    release('p1', 'dpi', 'passenger');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });
});

describe('keyFinderRegistry — isPrimary', () => {
  beforeEach(() => _resetForTest());

  it('returns false when no entry exists', () => {
    assert.equal(isPrimary('p1', 'dpi'), false);
  });

  it('returns true when asPrimary > 0', () => {
    register('p1', 'dpi', 'primary');
    assert.equal(isPrimary('p1', 'dpi'), true);
  });

  it('returns false when only passengers are registered', () => {
    register('p1', 'dpi', 'passenger');
    register('p1', 'dpi', 'passenger');
    assert.equal(isPrimary('p1', 'dpi'), false);
  });

  it('returns false after release drops asPrimary to 0', () => {
    register('p1', 'dpi', 'primary');
    assert.equal(isPrimary('p1', 'dpi'), true);
    release('p1', 'dpi', 'primary');
    assert.equal(isPrimary('p1', 'dpi'), false);
  });
});

describe('keyFinderRegistry — cross-product isolation', () => {
  beforeEach(() => _resetForTest());

  it('product 1 state does not affect product 2', () => {
    register('p1', 'dpi', 'primary');
    assert.equal(isPrimary('p1', 'dpi'), true);
    assert.equal(isPrimary('p2', 'dpi'), false);
    assert.deepEqual(count('p2', 'dpi'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });

  it('cross-product releases do not interfere', () => {
    register('p1', 'dpi', 'primary');
    register('p2', 'dpi', 'primary');
    release('p1', 'dpi', 'primary');
    assert.equal(isPrimary('p1', 'dpi'), false);
    assert.equal(isPrimary('p2', 'dpi'), true);
  });
});

describe('keyFinderRegistry — Map pruning', () => {
  beforeEach(() => _resetForTest());

  it('entries are pruned when both counts hit zero', () => {
    register('p1', 'dpi', 'primary');
    register('p1', 'buttons', 'passenger');
    assert.equal(_sizeForTest(), 2);
    release('p1', 'dpi', 'primary');
    assert.equal(_sizeForTest(), 1, 'dpi entry pruned');
    release('p1', 'buttons', 'passenger');
    assert.equal(_sizeForTest(), 0, 'all entries pruned');
  });

  it('entry stays when one role decrements but the other is still non-zero', () => {
    register('p1', 'dpi', 'primary');
    register('p1', 'dpi', 'passenger');
    release('p1', 'dpi', 'primary');
    assert.equal(_sizeForTest(), 1, 'dpi still has a passenger ride');
    assert.deepEqual(count('p1', 'dpi'), { asPrimary: 0, asPassenger: 1, total: 1 });
  });
});

describe('keyFinderRegistry — invalid role', () => {
  beforeEach(() => _resetForTest());

  it('register rejects unknown role', () => {
    assert.throws(() => register('p1', 'dpi', 'bogus'), /invalid role/);
  });

  it('release rejects unknown role', () => {
    assert.throws(() => release('p1', 'dpi', 'bogus'), /invalid role/);
  });
});

describe('keyFinderRegistry — _resetForTest', () => {
  it('clears all state between tests', () => {
    register('p1', 'a', 'primary');
    register('p2', 'b', 'passenger');
    assert.equal(_sizeForTest(), 2);
    _resetForTest();
    assert.equal(_sizeForTest(), 0);
    assert.deepEqual(count('p1', 'a'), { asPrimary: 0, asPassenger: 0, total: 0 });
  });
});
