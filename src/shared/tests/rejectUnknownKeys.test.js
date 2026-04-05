import test from 'node:test';
import assert from 'node:assert/strict';
import { rejectUnknownKeys } from '../validationHelpers.js';

test('rejectUnknownKeys', async (t) => {
  await t.test('separates known keys into accepted and unknown keys into rejected', () => {
    const body = { name: 'Alice', age: 30, foo: 'bar', baz: 42 };
    const allowed = new Set(['name', 'age']);
    const result = rejectUnknownKeys(body, allowed);
    assert.deepEqual(result.accepted, { name: 'Alice', age: 30 });
    assert.deepEqual(result.rejected, { foo: 'unknown_key', baz: 'unknown_key' });
  });

  await t.test('returns all keys as accepted when no unknowns', () => {
    const body = { a: 1, b: 2 };
    const allowed = new Set(['a', 'b', 'c']);
    const result = rejectUnknownKeys(body, allowed);
    assert.deepEqual(result.accepted, { a: 1, b: 2 });
    assert.deepEqual(result.rejected, {});
  });

  await t.test('returns all keys as rejected when none are allowed', () => {
    const body = { x: 1, y: 2 };
    const allowed = new Set([]);
    const result = rejectUnknownKeys(body, allowed);
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, { x: 'unknown_key', y: 'unknown_key' });
  });

  await t.test('handles null body gracefully', () => {
    const result = rejectUnknownKeys(null, new Set(['a']));
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, {});
  });

  await t.test('handles undefined body gracefully', () => {
    const result = rejectUnknownKeys(undefined, new Set(['a']));
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, {});
  });

  await t.test('handles empty body', () => {
    const result = rejectUnknownKeys({}, new Set(['a']));
    assert.deepEqual(result.accepted, {});
    assert.deepEqual(result.rejected, {});
  });

  await t.test('accepts an array of allowed keys as well as a Set', () => {
    const body = { a: 1, b: 2, c: 3 };
    const result = rejectUnknownKeys(body, ['a', 'c']);
    assert.deepEqual(result.accepted, { a: 1, c: 3 });
    assert.deepEqual(result.rejected, { b: 'unknown_key' });
  });

  await t.test('preserves value types (objects, arrays, booleans, null)', () => {
    const body = {
      obj: { nested: true },
      arr: [1, 2],
      bool: false,
      nil: null,
    };
    const allowed = new Set(['obj', 'arr', 'bool', 'nil']);
    const result = rejectUnknownKeys(body, allowed);
    assert.deepEqual(result.accepted, body);
    assert.deepEqual(result.rejected, {});
  });
});
