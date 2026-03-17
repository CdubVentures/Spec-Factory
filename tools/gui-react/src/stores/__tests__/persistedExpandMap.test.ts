import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { resolvePersistedExpandMap } from '../tabStore.ts';

describe('resolvePersistedExpandMap', () => {
  it('returns default when storedValue is null', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: null }), {});
  });

  it('returns default when storedValue is undefined', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: undefined }), {});
  });

  it('returns provided default when storedValue is null', () => {
    const def = { a: true };
    strictEqual(resolvePersistedExpandMap({ storedValue: null, defaultValue: def }), def);
  });

  it('parses valid JSON object with boolean values', () => {
    const stored = JSON.stringify({ foo: true, bar: false });
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: stored }), { foo: true, bar: false });
  });

  it('filters out non-boolean values', () => {
    const stored = JSON.stringify({ a: true, b: 'yes', c: 42, d: false, e: null });
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: stored }), { a: true, d: false });
  });

  it('returns default for corrupt JSON', () => {
    const def = { fallback: true };
    strictEqual(resolvePersistedExpandMap({ storedValue: '{bad json', defaultValue: def }), def);
  });

  it('returns default for JSON array', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: '[1,2,3]' }), {});
  });

  it('returns default for JSON string', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: '"hello"' }), {});
  });

  it('returns default for JSON number', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: '42' }), {});
  });

  it('returns empty record for empty JSON object', () => {
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: '{}' }), {});
  });

  it('returns default for non-string storedValue types', () => {
    // @ts-expect-error testing runtime coercion
    deepStrictEqual(resolvePersistedExpandMap({ storedValue: 123 }), {});
  });
});
