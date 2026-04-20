import { memo, useCallback, useRef } from 'react';

export function parseStepperValue(raw: string, fallback: number): number {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function formatSteppedValue(n: number, step: number): string {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(step)) return String(Math.round(n));
  const decimals = decimalsForStep(step);
  return Number(n.toFixed(decimals)).toString();
}

function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  const abs = Math.abs(step);
  if (abs >= 1) return 0;
  const s = abs.toString();
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return s.length - dot - 1;
}

function isEmptyOrInvalid(raw: string): boolean {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return true;
  return !Number.isFinite(Number(trimmed));
}

export function stepUp(raw: string, step: number, min?: number, max?: number): string {
  if (isEmptyOrInvalid(raw) && min !== undefined) {
    return formatSteppedValue(min, step);
  }
  const base = parseStepperValue(raw, 0);
  const next = base + step;
  const clamped = max !== undefined ? Math.min(next, max) : next;
  const bounded = min !== undefined ? Math.max(clamped, min) : clamped;
  return formatSteppedValue(bounded, step);
}

export function stepDown(raw: string, step: number, min?: number, max?: number): string {
  if (isEmptyOrInvalid(raw) && min !== undefined) {
    return formatSteppedValue(min, step);
  }
  const base = parseStepperValue(raw, 0);
  const next = base - step;
  const clamped = min !== undefined ? Math.max(next, min) : next;
  const bounded = max !== undefined ? Math.min(clamped, max) : clamped;
  return formatSteppedValue(bounded, step);
}

export function isDecrementDisabled(raw: string, min?: number, disabled?: boolean): boolean {
  if (disabled) return true;
  if (min === undefined) return false;
  const current = parseStepperValue(raw, min);
  return current <= min;
}

export function isIncrementDisabled(raw: string, max?: number, disabled?: boolean): boolean {
  if (disabled) return true;
  if (max === undefined) return false;
  const current = parseStepperValue(raw, max);
  return current >= max;
}

export function buildStepperClasses(opts: {
  compact?: boolean;
  className?: string;
  disabled?: boolean;
}): { wrapper: string; input: string; button: string } {
  const compactFlag = opts.compact === true;
  // WHY: wrapper uses block-level flex so it fills grid cells and column slots by default,
  // matching the width of sibling dropdowns/toggles. Callers pass w-14 etc. via className to shrink.
  const wrapperBase = 'sf-stepper flex items-stretch';
  const wrapperCompact = compactFlag ? ' sf-stepper-compact' : '';
  const wrapperDisabled = opts.disabled ? ' sf-stepper-disabled' : '';
  const wrapperCustom = opts.className ? ` ${opts.className}` : '';
  const wrapper = `${wrapperBase}${wrapperCompact}${wrapperDisabled}${wrapperCustom}`;

  const input = 'sf-stepper-input text-center font-mono min-w-0';

  const buttonBase = compactFlag
    ? 'sf-stepper-btn sf-stepper-btn-compact inline-flex items-center justify-center shrink-0 select-none'
    : 'sf-stepper-btn inline-flex items-center justify-center shrink-0 select-none';
  const button = buttonBase;

  return { wrapper, input, button };
}

export interface NumberStepperProps {
  value: string;
  onChange?: (next: string) => void;
  onCommit?: (next: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

export const NumberStepper = memo(function NumberStepper({
  value,
  onChange,
  onCommit,
  min,
  max,
  step,
  disabled = false,
  placeholder,
  compact = false,
  ariaLabel,
  className,
  id,
}: NumberStepperProps) {
  const resolvedStep = step ?? 1;
  const classes = buildStepperClasses({ compact, className, disabled });
  const decDisabled = isDecrementDisabled(value, min, disabled);
  const incDisabled = isIncrementDisabled(value, max, disabled);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const emit = useCallback(
    (next: string) => {
      onChange?.(next);
      onCommit?.(next);
    },
    [onChange, onCommit],
  );

  const handleDecrement = useCallback(() => {
    if (decDisabled) return;
    emit(stepDown(value, resolvedStep, min, max));
  }, [decDisabled, emit, value, resolvedStep, min, max]);

  const handleIncrement = useCallback(() => {
    if (incDisabled) return;
    emit(stepUp(value, resolvedStep, min, max));
  }, [incDisabled, emit, value, resolvedStep, min, max]);

  return (
    <div className={classes.wrapper}>
      <button
        type="button"
        aria-label={`Decrease${ariaLabel ? ` ${ariaLabel}` : ''}`}
        tabIndex={-1}
        disabled={decDisabled}
        onClick={handleDecrement}
        className={classes.button}
      >
        −
      </button>
      <input
        ref={inputRef}
        id={id}
        type="number"
        inputMode="decimal"
        className={classes.input}
        value={value}
        min={min}
        max={max}
        step={resolvedStep}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={(e) => onCommit?.(e.target.value)}
      />
      <button
        type="button"
        aria-label={`Increase${ariaLabel ? ` ${ariaLabel}` : ''}`}
        tabIndex={-1}
        disabled={incDisabled}
        onClick={handleIncrement}
        className={classes.button}
      >
        +
      </button>
    </div>
  );
});
