import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { resolvePersistedNumber } from '../tabStore.ts';

describe('resolvePersistedNumber', () => {
  it('parses valid numeric string', () => {
    strictEqual(resolvePersistedNumber({ storedValue: '42', defaultValue: 0 }), 42);
  });

  it('parses valid float string', () => {
    const result = resolvePersistedNumber({ storedValue: '3.14', defaultValue: 0 });
    strictEqual(Math.abs(result - 3.14) < 0.001, true);
  });

  it('parses zero', () => {
    strictEqual(resolvePersistedNumber({ storedValue: '0', defaultValue: 5 }), 0);
  });

  it('parses negative number', () => {
    strictEqual(resolvePersistedNumber({ storedValue: '-7', defaultValue: 0 }), -7);
  });

  it('returns default for NaN string', () => {
    strictEqual(resolvePersistedNumber({ storedValue: 'abc', defaultValue: 10 }), 10);
  });

  it('returns default for empty string', () => {
    strictEqual(resolvePersistedNumber({ storedValue: '', defaultValue: 5 }), 5);
  });

  it('returns default for Infinity', () => {
    strictEqual(resolvePersistedNumber({ storedValue: 'Infinity', defaultValue: 0 }), 0);
  });

  it('returns default for -Infinity', () => {
    strictEqual(resolvePersistedNumber({ storedValue: '-Infinity', defaultValue: 0 }), 0);
  });

  it('returns default for null', () => {
    strictEqual(resolvePersistedNumber({ storedValue: null, defaultValue: 99 }), 99);
  });

  it('returns default for undefined', () => {
    strictEqual(resolvePersistedNumber({ storedValue: undefined, defaultValue: 99 }), 99);
  });

  it('returns default for non-string types', () => {
    // @ts-expect-error testing runtime coercion
    strictEqual(resolvePersistedNumber({ storedValue: 123, defaultValue: 0 }), 0);
  });
});
