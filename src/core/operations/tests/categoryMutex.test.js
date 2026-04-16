import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { acquireCategoryLock, _resetForTest } from '../categoryMutex.js';

describe('categoryMutex — contract', () => {
  beforeEach(() => _resetForTest());

  it('acquire succeeds on empty category', () => {
    const result = acquireCategoryLock('mouse');
    assert.strictEqual(result.acquired, true);
    assert.strictEqual(typeof result.release, 'function');
  });

  it('acquire fails when category already locked', () => {
    acquireCategoryLock('mouse');
    const second = acquireCategoryLock('mouse');
    assert.strictEqual(second.acquired, false);
  });

  it('release makes category available again', () => {
    const first = acquireCategoryLock('mouse');
    first.release();
    const second = acquireCategoryLock('mouse');
    assert.strictEqual(second.acquired, true);
  });

  it('different categories do not block each other', () => {
    acquireCategoryLock('mouse');
    const second = acquireCategoryLock('keyboard');
    assert.strictEqual(second.acquired, true);
  });

  it('release is idempotent', () => {
    const first = acquireCategoryLock('mouse');
    first.release();
    first.release(); // should not throw
    const second = acquireCategoryLock('mouse');
    assert.strictEqual(second.acquired, true);
  });

  it('returns acquired: false with a no-op release', () => {
    acquireCategoryLock('mouse');
    const second = acquireCategoryLock('mouse');
    assert.strictEqual(second.acquired, false);
    second.release(); // should not throw, should not unlock the first
    const third = acquireCategoryLock('mouse');
    assert.strictEqual(third.acquired, false);
  });
});
