import { memo } from 'react';

/**
 * Labeled published-state badge for the review drawer header.
 *
 * kind="variant"  — variant-backed fields (colors, editions). Signals that deleting
 *                   a candidate will NOT unpublish; only variant deletion demotes.
 * kind="value"    — evidence-backed fields. Signals that deleting the sole-source
 *                   candidate WILL unpublish.
 */

interface PublishedBadgeProps {
  kind: 'variant' | 'value';
}

export const PublishedBadge = memo(function PublishedBadge({ kind }: PublishedBadgeProps) {
  const label = kind === 'variant' ? 'Published Variant' : 'Published Value';
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold sf-chip-success"
      title={label}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <circle
          cx="5"
          cy="5"
          r="4"
          fill="none"
          stroke="var(--sf-success, #22c55e)"
          strokeWidth="1.5"
        />
        <text
          x="5"
          y="7.2"
          textAnchor="middle"
          fontSize="6"
          fontWeight="700"
          fill="var(--sf-success, #22c55e)"
        >
          P
        </text>
      </svg>
      {label}
    </span>
  );
});
