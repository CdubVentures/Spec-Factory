import { buildSlotDots } from '../../shared/ui/finder/slotDotsHelpers.ts';
import './ConfidenceDiamond.css';

export interface FinderRunDiamondsProps {
  readonly filled: number;
  readonly total: number;
  /** When true, the diamond SVGs pulse (finder op in flight). */
  readonly pulsing?: boolean;
}

/**
 * Run-count indicator for finders that track "mandatory run" completion
 * at the product level (e.g. CEF needs 2 runs before advancing). Renders
 * N rhombus diamonds side-by-side using the same SVG shape as
 * `ConfidenceDiamond` so the Overview Finders column reads as one family.
 *
 * Unlike the confidence diamond, this one is binary per diamond — filled
 * green when that run is done, dashed outline when not. No color chip is
 * drawn above because CEF is what *discovers* variants; there are no
 * variant colors to show until a CEF run completes.
 *
 * The fraction text is rendered by the caller (so it can be a deep-link
 * into the Indexing Lab); this component only paints the diamond shapes.
 */
export function FinderRunDiamonds({ filled, total, pulsing = false }: FinderRunDiamondsProps) {
  if (total <= 0) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  const dots = buildSlotDots(filled, total);
  return (
    <span className={`sf-run-diamond-strip${pulsing ? ' sf-pulsing' : ''}`}>
      {dots.map((d, i) => (
        <svg
          key={i}
          className={`sf-conf-diamond sf-conf-diamond-${d.filled ? 'good' : 'empty'}`}
          viewBox="0 0 40 40"
          aria-hidden
        >
          <polygon points="20,2 38,20 20,38 2,20" />
        </svg>
      ))}
    </span>
  );
}

export function finderRunFracClass(filled: number, total: number): string {
  if (total <= 0) return 'sf-run-diamond-frac-none';
  if (filled >= total) return 'sf-run-diamond-frac-done';
  if (filled > 0) return 'sf-run-diamond-frac-part';
  return 'sf-run-diamond-frac-none';
}
