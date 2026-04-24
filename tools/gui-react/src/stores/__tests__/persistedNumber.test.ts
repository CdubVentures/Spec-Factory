import test from 'node:test';
import { strictEqual } from 'node:assert';
import { resolvePersistedNumber } from '../tabStore.ts';

test('resolvePersistedNumber parses finite numeric strings and falls back otherwise', () => {
  const cases: Array<{
    name: string;
    storedValue: string | null | undefined;
    defaultValue: number;
    expected: number;
  }> = [
    { name: 'integer string', storedValue: '42', defaultValue: 0, expected: 42 },
    { name: 'float string', storedValue: '3.14', defaultValue: 0, expected: 3.14 },
    { name: 'zero', storedValue: '0', defaultValue: 5, expected: 0 },
    { name: 'negative number', storedValue: '-7', defaultValue: 0, expected: -7 },
    { name: 'NaN string', storedValue: 'abc', defaultValue: 10, expected: 10 },
    { name: 'empty string', storedValue: '', defaultValue: 5, expected: 5 },
    { name: 'Infinity', storedValue: 'Infinity', defaultValue: 0, expected: 0 },
    { name: '-Infinity', storedValue: '-Infinity', defaultValue: 0, expected: 0 },
    { name: 'null', storedValue: null, defaultValue: 99, expected: 99 },
    { name: 'undefined', storedValue: undefined, defaultValue: 99, expected: 99 },
    {
      name: 'non-string type',
      storedValue: 123 as unknown as string,
      defaultValue: 0,
      expected: 0,
    },
  ];

  for (const { name, storedValue, defaultValue, expected } of cases) {
    strictEqual(
      resolvePersistedNumber({ storedValue, defaultValue }),
      expected,
      name,
    );
  }
});
