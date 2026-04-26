import { memo } from 'react';

/**
 * Default-variant indicator — small filled diamond SVG.
 *
 * Marks the variant that drives the grid cell's value for variant-dependent
 * fields (release_date, price, sku, discontinued). For CEF this is the color
 * variant matching colors[0]. Editions never carry this marker.
 *
 * Usage:
 *   <DefaultVariantMark />                     — render when is_default
 *   <DefaultVariantMark isDefault={false} />   — renders nothing
 */

interface DefaultVariantMarkProps {
  readonly isDefault?: boolean;
  readonly size?: number;
}

export const DefaultVariantMark = memo(function DefaultVariantMark({
  isDefault = true,
  size = 12,
}: DefaultVariantMarkProps) {
  if (!isDefault) return null;

  return (
    <span
      title="Default variant — drives the grid cell value"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, lineHeight: 1, userSelect: 'none' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* WHY: Filled diamond — distinct from the circular PubMark.
            Suggests "pinned / anchor / default" without reusing star visual language. */}
        <path
          d="M6 1 L11 6 L6 11 L1 6 Z"
          fill="var(--sf-token-accent-strong)"
          stroke="var(--sf-token-accent-strong)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <path
          d="M6 3.5 L8.5 6 L6 8.5 L3.5 6 Z"
          fill="var(--sf-surface-elevated)"
          opacity="0.35"
        />
      </svg>
    </span>
  );
});

export function DefaultVariantLegend() {
  return (
    <span
      className="inline-flex items-center gap-1.5 sf-text-caption"
      style={{ fontSize: 10, color: 'var(--sf-muted)' }}
    >
      <DefaultVariantMark size={10} />
      <span>= default variant</span>
    </span>
  );
}
