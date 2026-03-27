import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { resolveScrollPosition } from '../scrollStore.ts';

describe('resolveScrollPosition', () => {
  it('returns null for null input', () => {
    strictEqual(resolveScrollPosition(null), null);
  });

  it('returns null for undefined input', () => {
    strictEqual(resolveScrollPosition(undefined), null);
  });

  it('parses valid scroll position', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 100, left: 50 })),
      { top: 100, left: 50 },
    );
  });

  it('returns null for zero position (default, not worth restoring)', () => {
    strictEqual(resolveScrollPosition(JSON.stringify({ top: 0, left: 0 })), null);
  });

  it('returns position when only top is non-zero', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 200, left: 0 })),
      { top: 200, left: 0 },
    );
  });

  it('returns position when only left is non-zero', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 0, left: 75 })),
      { top: 0, left: 75 },
    );
  });

  it('defaults missing left to 0', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 100 })),
      { top: 100, left: 0 },
    );
  });

  it('defaults missing top to 0', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ left: 50 })),
      { top: 0, left: 50 },
    );
  });

  it('returns null when both fields are missing', () => {
    strictEqual(resolveScrollPosition(JSON.stringify({})), null);
  });

  it('returns null for corrupt JSON', () => {
    strictEqual(resolveScrollPosition('{bad json'), null);
  });

  it('returns null for JSON array', () => {
    strictEqual(resolveScrollPosition('[1,2]'), null);
  });

  it('returns null for JSON string', () => {
    strictEqual(resolveScrollPosition('"hello"'), null);
  });

  it('returns null for JSON number', () => {
    strictEqual(resolveScrollPosition('42'), null);
  });

  it('treats non-number top as 0', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 'abc', left: 100 })),
      { top: 0, left: 100 },
    );
  });

  it('treats non-number left as 0', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 50, left: true })),
      { top: 50, left: 0 },
    );
  });

  it('treats non-finite top as 0', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: null, left: 80 })),
      { top: 0, left: 80 },
    );
  });

  it('returns null for non-string input types', () => {
    // @ts-expect-error testing runtime coercion
    strictEqual(resolveScrollPosition(42), null);
  });

  it('handles fractional scroll values', () => {
    deepStrictEqual(
      resolveScrollPosition(JSON.stringify({ top: 123.5, left: 0.75 })),
      { top: 123.5, left: 0.75 },
    );
  });
});
