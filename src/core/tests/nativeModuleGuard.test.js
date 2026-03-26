import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertNativeModulesHealthy } from '../nativeModuleGuard.js';

describe('assertNativeModulesHealthy', () => {
  it('returns a synchronous plain object result', () => {
    const result = assertNativeModulesHealthy({ logger: { error() {} } });

    assert.equal(typeof result, 'object');
    assert.equal(typeof result?.then, 'undefined', 'should not return a Promise');
    assert.equal(typeof result.ok, 'boolean');
  });

  it('returns the success shape when native modules are healthy and the failure shape otherwise', () => {
    const logged = [];
    const result = assertNativeModulesHealthy({
      logger: {
        error(message) {
          logged.push(String(message));
        },
      },
    });

    if (result.ok) {
      assert.deepEqual(Object.keys(result), ['ok']);
      assert.equal(logged.length, 0);
      return;
    }

    assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.equal(logged.length, 1);
    assert.ok(logged[0].includes('NATIVE MODULE LOAD FAILURE'));
  });

  it('accepts the default logger without throwing', () => {
    const result = assertNativeModulesHealthy();
    assert.equal(typeof result.ok, 'boolean');
  });
});
