import test from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { resolveScrollPosition, type ScrollPosition } from '../scrollStore.ts';

test('resolveScrollPosition restores meaningful finite positions and rejects defaults', () => {
  const cases: Array<{
    name: string;
    storedValue: string | null | undefined;
    expected: ScrollPosition | null;
  }> = [
    { name: 'null', storedValue: null, expected: null },
    { name: 'undefined', storedValue: undefined, expected: null },
    {
      name: 'valid position',
      storedValue: JSON.stringify({ top: 100, left: 50 }),
      expected: { top: 100, left: 50 },
    },
    {
      name: 'zero default position',
      storedValue: JSON.stringify({ top: 0, left: 0 }),
      expected: null,
    },
    {
      name: 'top only',
      storedValue: JSON.stringify({ top: 200, left: 0 }),
      expected: { top: 200, left: 0 },
    },
    {
      name: 'left only',
      storedValue: JSON.stringify({ top: 0, left: 75 }),
      expected: { top: 0, left: 75 },
    },
    {
      name: 'missing left defaults to 0',
      storedValue: JSON.stringify({ top: 100 }),
      expected: { top: 100, left: 0 },
    },
    {
      name: 'missing top defaults to 0',
      storedValue: JSON.stringify({ left: 50 }),
      expected: { top: 0, left: 50 },
    },
    { name: 'missing both fields', storedValue: JSON.stringify({}), expected: null },
    { name: 'corrupt JSON', storedValue: '{bad json', expected: null },
    { name: 'array', storedValue: '[1,2]', expected: null },
    { name: 'JSON string', storedValue: '"hello"', expected: null },
    { name: 'JSON number', storedValue: '42', expected: null },
    {
      name: 'non-number top',
      storedValue: JSON.stringify({ top: 'abc', left: 100 }),
      expected: { top: 0, left: 100 },
    },
    {
      name: 'non-number left',
      storedValue: JSON.stringify({ top: 50, left: true }),
      expected: { top: 50, left: 0 },
    },
    {
      name: 'non-finite top',
      storedValue: JSON.stringify({ top: null, left: 80 }),
      expected: { top: 0, left: 80 },
    },
    {
      name: 'non-string input',
      storedValue: 42 as unknown as string,
      expected: null,
    },
    {
      name: 'fractional values',
      storedValue: JSON.stringify({ top: 123.5, left: 0.75 }),
      expected: { top: 123.5, left: 0.75 },
    },
  ];

  for (const { name, storedValue, expected } of cases) {
    const result = resolveScrollPosition(storedValue);
    if (expected === null) {
      strictEqual(result, null, name);
      continue;
    }
    deepStrictEqual(result, expected, name);
  }
});
