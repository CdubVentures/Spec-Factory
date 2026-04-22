/**
 * ChipSegmentedGroup — rounded segmented group of filter chips.
 *
 * First option is always the "All" chip (empty value = axis cleared).
 * Zero-count options render dim + non-interactive but keep their width
 * so the group's geometry stays stable.
 *
 * Tone affects the leading dot color; chip active-state is the shared
 * accent-active fill.
 */

import { memo, useCallback } from 'react';
import type { ChipTone } from './PresetChip.tsx';

export interface SegmentOption {
  readonly value: string;        // '' = All
  readonly label: string;
  readonly count: number;
  readonly tone?: ChipTone;
  readonly running?: boolean;    // pulses the leading dot
}

interface ChipSegmentedGroupProps {
  readonly options: readonly SegmentOption[];
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly ariaLabel: string;
}

function dotColor(tone: ChipTone | undefined): string {
  switch (tone) {
    case 'success': return 'var(--sf-state-success-fg)';
    case 'warning': return 'var(--sf-state-warning-fg)';
    case 'danger':  return 'var(--sf-state-danger-fg)';
    case 'info':    return 'var(--sf-state-info-fg)';
    case 'confirm': return 'var(--sf-state-confirm-fg)';
    case 'muted':   return 'var(--sf-token-text-subtle)';
    case 'accent':  return 'var(--sf-token-accent)';
    default:        return 'var(--sf-token-text-subtle)';
  }
}

export const ChipSegmentedGroup = memo(function ChipSegmentedGroup({
  options,
  value,
  onChange,
  ariaLabel,
}: ChipSegmentedGroupProps) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex items-center flex-wrap gap-1.5">
      {options.map((opt) => (
        <Segment
          key={opt.value || '__all__'}
          option={opt}
          active={value === opt.value}
          onSelect={onChange}
        />
      ))}
    </div>
  );
});

interface SegmentProps {
  readonly option: SegmentOption;
  readonly active: boolean;
  readonly onSelect: (value: string) => void;
}

const Segment = memo(function Segment({ option, active, onSelect }: SegmentProps) {
  const { value, label, count, tone, running } = option;
  const empty = count === 0 && value !== '';
  const isAll = value === '';
  // "All" is the no-filter state — don't paint it loud-blue when active;
  // reserve the saturated active style for explicit axis selections so the
  // user's filter choices pop against quiet "All" neighbors.
  const loudActive = active && !isAll;

  const handleClick = useCallback(() => {
    if (!empty) onSelect(value);
  }, [empty, value, onSelect]);

  const base = loudActive ? 'sf-filter-chip sf-filter-chip-active' : 'sf-filter-chip';
  const disabled = empty ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={empty || undefined}
      aria-label={`${label}${count > 0 ? ` (${count})` : ''}`}
      disabled={empty}
      onClick={handleClick}
      className={`${base} ${disabled} h-7`.trim()}
    >
      {!isAll && (
        <span
          className={`sf-filter-dot ${running ? 'animate-pulse' : ''}`.trim()}
          style={{ background: loudActive ? 'rgba(255,255,255,0.85)' : dotColor(tone) }}
        />
      )}
      <span>{label}</span>
      <span className="sf-filter-chip-count">{count}</span>
    </button>
  );
});
