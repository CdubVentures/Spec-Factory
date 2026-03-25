import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNativeModulesHealthy } from '../nativeModuleGuard.js';

describe('assertNativeModulesHealthy', () => {
  it('returns ok: true under normal conditions', () => {
    const result = assertNativeModulesHealthy({ logger: { error() {} } });
    assert.equal(result.ok, true);
  });

  it('returns correct shape on success', () => {
    const result = assertNativeModulesHealthy({ logger: { error() {} } });
    assert.deepEqual(Object.keys(result), ['ok']);
    assert.equal(typeof result.ok, 'boolean');
  });

  it('is synchronous (returns plain object, not a Promise)', () => {
    const result = assertNativeModulesHealthy({ logger: { error() {} } });
    assert.equal(typeof result.then, 'undefined', 'should not return a Promise');
    assert.equal(typeof result, 'object');
  });

  it('accepts default logger without throwing', () => {
    // Uses console by default — should not throw
    const result = assertNativeModulesHealthy();
    assert.equal(result.ok, true);
  });
});
