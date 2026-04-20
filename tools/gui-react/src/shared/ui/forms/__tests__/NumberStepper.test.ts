import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let parseStepperValue: (raw: string, fallback: number) => number;
let stepUp: (raw: string, step: number, min?: number, max?: number) => string;
let stepDown: (raw: string, step: number, min?: number, max?: number) => string;
let isDecrementDisabled: (raw: string, min?: number, disabled?: boolean) => boolean;
let isIncrementDisabled: (raw: string, max?: number, disabled?: boolean) => boolean;
let formatSteppedValue: (n: number, step: number) => string;
let buildStepperClasses: (opts: {
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}) => { wrapper: string; input: string; button: string };

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/shared/ui/forms/NumberStepper.tsx',
    {
      prefix: 'number-stepper-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        react: `
          export function memo(fn) { return fn; }
          export function useCallback(fn) { return fn; }
          export function useRef() { return { current: null }; }
        `,
      },
    },
  );
  ({
    parseStepperValue,
    stepUp,
    stepDown,
    isDecrementDisabled,
    isIncrementDisabled,
    formatSteppedValue,
    buildStepperClasses,
  } = mod);
});

describe('parseStepperValue', () => {
  it('returns numeric value for well-formed integer string', () => {
    assert.equal(parseStepperValue('42', 0), 42);
  });

  it('returns numeric value for float string', () => {
    assert.equal(parseStepperValue('3.14', 0), 3.14);
  });

  it('returns fallback for empty string', () => {
    assert.equal(parseStepperValue('', 7), 7);
  });

  it('returns fallback for non-numeric string', () => {
    assert.equal(parseStepperValue('abc', 5), 5);
  });

  it('returns fallback for NaN-yielding string', () => {
    assert.equal(parseStepperValue('   ', 10), 10);
  });

  it('returns 0 when fallback is 0 and value is empty', () => {
    assert.equal(parseStepperValue('', 0), 0);
  });

  it('preserves negative numbers', () => {
    assert.equal(parseStepperValue('-5', 0), -5);
  });
});

describe('stepUp', () => {
  it('increments integer by step', () => {
    assert.equal(stepUp('5', 1), '6');
  });

  it('increments by arbitrary step', () => {
    assert.equal(stepUp('100', 25), '125');
  });

  it('starts from min when value is empty and min is defined', () => {
    assert.equal(stepUp('', 1, 10), '10');
  });

  it('starts from 0 when value is empty and min is undefined', () => {
    assert.equal(stepUp('', 1), '1');
  });

  it('clamps to max when increment would exceed', () => {
    assert.equal(stepUp('9', 5, 0, 10), '10');
  });

  it('returns current value when already at max', () => {
    assert.equal(stepUp('10', 1, 0, 10), '10');
  });

  it('handles float step without floating-point garbage', () => {
    assert.equal(stepUp('5', 0.01), '5.01');
  });

  it('handles float step 0.1 cleanly', () => {
    assert.equal(stepUp('0.1', 0.1), '0.2');
  });

  it('starts from fallback (0 or min) for invalid input', () => {
    assert.equal(stepUp('abc', 1, 5), '5');
  });
});

describe('stepDown', () => {
  it('decrements integer by step', () => {
    assert.equal(stepDown('5', 1), '4');
  });

  it('decrements by arbitrary step', () => {
    assert.equal(stepDown('100', 25), '75');
  });

  it('starts from min when value is empty', () => {
    assert.equal(stepDown('', 1, 10), '10');
  });

  it('starts from 0 when value is empty and no min', () => {
    assert.equal(stepDown('', 1), '-1');
  });

  it('clamps to min when decrement would go below', () => {
    assert.equal(stepDown('3', 5, 0, 100), '0');
  });

  it('returns current value when already at min', () => {
    assert.equal(stepDown('0', 1, 0), '0');
  });

  it('handles float step without floating-point garbage', () => {
    assert.equal(stepDown('5', 0.01), '4.99');
  });

  it('allows negative values when no min is set', () => {
    assert.equal(stepDown('0', 1), '-1');
  });
});

describe('isDecrementDisabled', () => {
  it('is false when value is above min', () => {
    assert.equal(isDecrementDisabled('5', 0), false);
  });

  it('is true when value equals min', () => {
    assert.equal(isDecrementDisabled('0', 0), true);
  });

  it('is true when value is below min', () => {
    assert.equal(isDecrementDisabled('-1', 0), true);
  });

  it('is true when disabled flag is set regardless of value', () => {
    assert.equal(isDecrementDisabled('5', 0, true), true);
  });

  it('is false when no min is defined and value is arbitrary', () => {
    assert.equal(isDecrementDisabled('5'), false);
  });

  it('is false for empty value when no min (can step down to -step)', () => {
    assert.equal(isDecrementDisabled(''), false);
  });

  it('is true for empty value when min equals 0 (fallback would be 0)', () => {
    assert.equal(isDecrementDisabled('', 0), true);
  });
});

describe('isIncrementDisabled', () => {
  it('is false when value is below max', () => {
    assert.equal(isIncrementDisabled('5', 10), false);
  });

  it('is true when value equals max', () => {
    assert.equal(isIncrementDisabled('10', 10), true);
  });

  it('is true when value is above max', () => {
    assert.equal(isIncrementDisabled('11', 10), true);
  });

  it('is true when disabled flag is set regardless of value', () => {
    assert.equal(isIncrementDisabled('5', 10, true), true);
  });

  it('is false when no max is defined', () => {
    assert.equal(isIncrementDisabled('99999'), false);
  });
});

describe('formatSteppedValue', () => {
  it('formats integer without decimal point', () => {
    assert.equal(formatSteppedValue(42, 1), '42');
  });

  it('formats float with step 0.01 to two decimals', () => {
    assert.equal(formatSteppedValue(5.01, 0.01), '5.01');
  });

  it('strips floating-point artifacts at step 0.1', () => {
    assert.equal(formatSteppedValue(0.1 + 0.2, 0.1), '0.3');
  });

  it('formats negative numbers', () => {
    assert.equal(formatSteppedValue(-5, 1), '-5');
  });

  it('formats 0 as "0"', () => {
    assert.equal(formatSteppedValue(0, 1), '0');
  });
});

describe('buildStepperClasses', () => {
  it('returns a wrapper class with flex layout', () => {
    const { wrapper } = buildStepperClasses({});
    assert.ok(/\bflex\b/.test(wrapper), `expected flex in wrapper, got: ${wrapper}`);
  });

  it('uses sf-stepper-input on the input', () => {
    const { input } = buildStepperClasses({});
    assert.ok(input.includes('sf-stepper-input'), `expected sf-stepper-input in input, got: ${input}`);
  });

  it('appends custom className to the wrapper (for sizing)', () => {
    const { wrapper } = buildStepperClasses({ className: 'w-24' });
    assert.ok(wrapper.includes('w-24'), `expected w-24 in wrapper, got: ${wrapper}`);
  });

  it('wrapper defaults to block-level flex so it fills grid cells', () => {
    const { wrapper } = buildStepperClasses({});
    assert.ok(
      wrapper.match(/\bflex\b/) && !wrapper.includes('inline-flex'),
      `expected wrapper to use block-level flex, got: ${wrapper}`,
    );
  });

  it('adds a compact marker when compact is true', () => {
    const { wrapper, button } = buildStepperClasses({ compact: true });
    const combined = `${wrapper} ${button}`;
    assert.ok(
      combined.includes('sf-stepper-compact') || combined.includes('sf-stepper-btn-compact'),
      `expected compact marker in classes, got wrapper="${wrapper}" button="${button}"`,
    );
  });

  it('omits compact marker when compact is false or undefined', () => {
    const { wrapper, button } = buildStepperClasses({ compact: false });
    const combined = `${wrapper} ${button}`;
    assert.ok(
      !combined.includes('sf-stepper-compact'),
      `expected no sf-stepper-compact class, got: ${combined}`,
    );
  });

  it('returns a sf-stepper-btn class for buttons', () => {
    const { button } = buildStepperClasses({});
    assert.ok(button.includes('sf-stepper-btn'), `expected sf-stepper-btn in button, got: ${button}`);
  });

  it('includes a disabled marker in wrapper when disabled is true', () => {
    const { wrapper } = buildStepperClasses({ disabled: true });
    assert.ok(
      wrapper.includes('opacity') || wrapper.includes('disabled'),
      `expected disabled visual marker in wrapper, got: ${wrapper}`,
    );
  });
});
