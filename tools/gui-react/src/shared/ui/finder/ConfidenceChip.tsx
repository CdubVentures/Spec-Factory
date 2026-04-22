/**
 * ConfidenceChip — pill rendering a 0-100 confidence value with the shared
 * 4-band color scale Review Grid uses (conf-100 / conf-70 / conf-40 / conf-10).
 *
 * Background, text and border all tie to the same band so the chip sits
 * visually between neighbor chips without looking like a dangling number.
 * Consumed by every finder Run History surface + evidence rows.
 */

import { confidenceColorClass } from '../../../utils/colors.ts';

interface ConfidenceChipProps {
  /** Integer 0-100 (as emitted by LLM responses + field_candidates). */
  readonly value: number | null | undefined;
  /** 0-1 publisher threshold — defaults to the publisher-gate default (0.7). */
  readonly threshold?: number;
  /** Suppress rendering when the value is missing / zero (default true). */
  readonly hideWhenEmpty?: boolean;
  /** Optional override title; falls back to a descriptive one-liner. */
  readonly title?: string;
}

// Matches Chip's border weight (border-[1.5px] border-current) so the
// confidence pill reads as part of the same badge family next to Chips.
const BASE_CLS =
  'text-[10px] font-bold px-1.5 py-0.5 rounded-sm font-mono min-w-[2.2rem] text-center shrink-0 border-[1.5px] border-current';

export function ConfidenceChip({
  value,
  threshold,
  hideWhenEmpty = true,
  title,
}: ConfidenceChipProps) {
  if (!Number.isFinite(value as number)) {
    if (hideWhenEmpty) return null;
    return (
      <span className={`${BASE_CLS} conf-10`} title={title ?? 'No confidence'}>
        —
      </span>
    );
  }
  const n = value as number;
  if (hideWhenEmpty && n <= 0) return null;
  const cls = confidenceColorClass(n / 100, threshold);
  return (
    <span
      className={`${BASE_CLS} ${cls}`}
      title={title ?? 'Confidence band (same 4-band scale Review Grid uses)'}
    >
      {Math.round(n)}%
    </span>
  );
}
