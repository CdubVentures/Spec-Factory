import { memo } from 'react';

/**
 * Published indicator — small "P" in a circle.
 * O(1) reuse: any module imports this component and places it next to published values.
 *
 * Usage:
 *   <PubMark />                        — green, published
 *   <PubMark published={false} />      — hidden (renders nothing)
 */

interface PubMarkProps {
  /** Whether the value is published. Renders nothing when false. */
  published?: boolean;
  /** Override the default 12px size. */
  size?: number;
}

export const PubMark = memo(function PubMark({ published = true, size = 12 }: PubMarkProps) {
  if (!published) return null;

  return (
    <span
      title="Published"
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1.5px solid var(--sf-success)',
        color: 'var(--sf-success)',
        fontSize: size * 0.58,
        fontWeight: 700,
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      P
    </span>
  );
});

/**
 * Small legend row explaining the PubMark indicator.
 * Drop this once near the top of any module panel that uses PubMark.
 */
export function PubLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 sf-text-caption" style={{ fontSize: 10, color: 'var(--sf-muted)' }}>
      <PubMark size={10} />
      <span>= published</span>
    </span>
  );
}
