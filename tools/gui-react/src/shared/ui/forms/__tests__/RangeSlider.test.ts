import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let clampRangeValue: (raw: unknown, min: number, max: number, fallback: number) => number;
let parseRangeInput: (raw: string, fallback: number) => number;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/shared/ui/forms/RangeSlider.tsx',
    {
      prefix: 'range-slider-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        react: `
          export function memo(fn) { return fn; }
          export function useCallback(fn) { return fn; }
          export function useId() { return 'rs-test'; }
        `,
      },
    },
  );
  ({ clampRangeValue, parseRangeInput } = mod);
});

describe('clampRangeValue', () => {
  it('returns the fallback for non-numeric input', () => {
    assert.equal(clampRangeValue(undefined, 1, 50, 10), 10);
    assert.equal(clampRangeValue(null, 1, 50, 10), 10);
    assert.equal(clampRangeValue('xyz', 1, 50, 10), 10);
    assert.equal(clampRangeValue(NaN, 1, 50, 10), 10);
  });

  it('clamps below min to min', () => {
    assert.equal(clampRangeValue(0, 1, 50, 10), 1);
    assert.equal(clampRangeValue(-99, 1, 50, 10), 1);
  });

  it('clamps above max to max', () => {
    assert.equal(clampRangeValue(99, 1, 50, 10), 50);
  });

  it('rounds floats to the nearest integer', () => {
    assert.equal(clampRangeValue(12.4, 1, 50, 10), 12);
    assert.equal(clampRangeValue(12.6, 1, 50, 10), 13);
  });

  it('passes through valid in-range integers unchanged', () => {
    assert.equal(clampRangeValue(25, 1, 50, 10), 25);
  });

  it('accepts numeric strings', () => {
    assert.equal(clampRangeValue('20', 1, 50, 10), 20);
    assert.equal(clampRangeValue('60', 1, 50, 10), 50);
  });
});

describe('parseRangeInput', () => {
  it('returns the parsed integer for a numeric string', () => {
    assert.equal(parseRangeInput('15', 10), 15);
  });

  it('returns the fallback for an empty / non-numeric string', () => {
    assert.equal(parseRangeInput('', 10), 10);
    assert.equal(parseRangeInput('abc', 10), 10);
  });
});
