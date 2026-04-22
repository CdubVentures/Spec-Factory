/**
 * PresetChip — pill-shaped quick-query chip with a leading tone dot +
 * count badge. Renders `.sf-filter-chip` (or `-active` when selected).
 *
 * Tone affects only the leading dot color; the chip background stays
 * accent-active for consistency with other filter bars in the repo.
 */

import { memo, useCallback } from 'react';

export type ChipTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'confirm'
  | 'muted';

interface PresetChipProps {
  readonly label: string;
  readonly count: number;
  readonly tone: ChipTone;
  readonly active: boolean;
  readonly running?: boolean;      // when true, the dot pulses
  readonly empty?: boolean;        // when true, chip is rendered dim + non-interactive
  readonly quietActive?: boolean;  // when true + active, skip loud accent fill (for "All")
  readonly onClick: () => void;
  readonly ariaLabel?: string;
}

function dotColor(tone: ChipTone): string {
  switch (tone) {
    case 'success': return 'var(--sf-state-success-fg)';
    case 'warning': return 'var(--sf-state-warning-fg)';
    case 'danger':  return 'var(--sf-state-danger-fg)';
    case 'info':    return 'var(--sf-state-info-fg)';
    case 'confirm': return 'var(--sf-state-confirm-fg)';
    case 'muted':   return 'var(--sf-token-text-subtle)';
    case 'accent':
    default:        return 'var(--sf-token-accent)';
  }
}

export const PresetChip = memo(function PresetChip({
  label,
  count,
  tone,
  active,
  running = false,
  empty = false,
  quietActive = false,
  onClick,
  ariaLabel,
}: PresetChipProps) {
  const handleClick = useCallback(() => {
    if (!empty) onClick();
  }, [empty, onClick]);

  const loudActive = active && !quietActive;
  const base = loudActive ? 'sf-filter-chip sf-filter-chip-active' : 'sf-filter-chip';
  const shape = 'rounded-full'; // preset = pill
  const disabledStyle = empty ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-disabled={empty || undefined}
      aria-label={ariaLabel ?? label}
      disabled={empty}
      onClick={handleClick}
      className={`${base} ${shape} ${disabledStyle} h-7`.trim()}
    >
      <span
        className={`sf-filter-dot ${running ? 'animate-pulse' : ''}`.trim()}
        style={{ background: loudActive ? 'rgba(255,255,255,0.85)' : dotColor(tone) }}
      />
      <span>{label}</span>
      <span className="sf-filter-chip-count">{count}</span>
    </button>
  );
});
