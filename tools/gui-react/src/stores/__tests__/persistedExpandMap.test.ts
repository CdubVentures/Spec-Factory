import test from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { resolvePersistedExpandMap } from '../tabStore.ts';

test('resolvePersistedExpandMap returns boolean maps or defaults for invalid input', () => {
  const providedDefault = { a: true };
  const corruptDefault = { fallback: true };
  const cases: Array<{
    name: string;
    storedValue: string | null | undefined;
    defaultValue?: Record<string, boolean>;
    expected: Record<string, boolean>;
    expectSameReference?: boolean;
  }> = [
    { name: 'null', storedValue: null, expected: {} },
    { name: 'undefined', storedValue: undefined, expected: {} },
    {
      name: 'provided default',
      storedValue: null,
      defaultValue: providedDefault,
      expected: providedDefault,
      expectSameReference: true,
    },
    {
      name: 'valid boolean object',
      storedValue: JSON.stringify({ foo: true, bar: false }),
      expected: { foo: true, bar: false },
    },
    {
      name: 'non-boolean values filtered',
      storedValue: JSON.stringify({ a: true, b: 'yes', c: 42, d: false, e: null }),
      expected: { a: true, d: false },
    },
    {
      name: 'corrupt JSON',
      storedValue: '{bad json',
      defaultValue: corruptDefault,
      expected: corruptDefault,
      expectSameReference: true,
    },
    { name: 'array', storedValue: '[1,2,3]', expected: {} },
    { name: 'JSON string', storedValue: '"hello"', expected: {} },
    { name: 'JSON number', storedValue: '42', expected: {} },
    { name: 'empty object', storedValue: '{}', expected: {} },
    {
      name: 'non-string type',
      storedValue: 123 as unknown as string,
      expected: {},
    },
  ];

  for (const { name, storedValue, defaultValue, expected, expectSameReference } of cases) {
    const result = resolvePersistedExpandMap({ storedValue, defaultValue });
    if (expectSameReference) {
      strictEqual(result, expected, name);
      continue;
    }
    deepStrictEqual(result, expected, name);
  }
});
