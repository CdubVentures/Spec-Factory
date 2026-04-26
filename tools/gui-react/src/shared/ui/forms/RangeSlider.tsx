import { memo, useCallback, useId } from 'react';
import './RangeSlider.css';

export function parseRangeInput(raw: string, fallback: number): number {
  const trimmed = String(raw ?? '').trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

export function clampRangeValue(raw: unknown, min: number, max: number, fallback: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

export interface RangeSliderProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly onChange: (next: number) => void;
  readonly disabled?: boolean;
  readonly ariaLabel: string;
  readonly className?: string;
  /** Renders the live numeric value next to the slider (default: true). */
  readonly showValue?: boolean;
  readonly id?: string;
  readonly title?: string;
}

export const RangeSlider = memo(function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled = false,
  ariaLabel,
  className,
  showValue = true,
  id,
  title,
}: RangeSliderProps) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const safeValue = clampRangeValue(value, min, max, min);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseRangeInput(e.target.value, safeValue);
      onChange(clampRangeValue(parsed, min, max, safeValue));
    },
    [onChange, min, max, safeValue],
  );

  const wrapperClass = `sf-range-slider${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`;

  return (
    <span className={wrapperClass} title={title}>
      <input
        id={inputId}
        type="range"
        className="sf-range-slider-input"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={safeValue}
        onChange={handleChange}
      />
      {showValue && (
        <span className="sf-range-slider-value" aria-hidden>
          {safeValue}
        </span>
      )}
    </span>
  );
});
