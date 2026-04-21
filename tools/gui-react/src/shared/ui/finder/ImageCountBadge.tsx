import './ImageCountBadge.css';

export interface ImageCountBadgeProps {
  readonly count: number;
  /** Label under the count. Defaults to "Images". */
  readonly label?: string;
}

/**
 * Stacked-tile badge showing a count with a small uppercase label beneath.
 * Echoes the shape of panel-level stat tiles at row-size. Used on PIF
 * variant rows where it replaces the `{N} img` chip + "no images" italic.
 */
export function ImageCountBadge({ count, label = 'Images' }: ImageCountBadgeProps) {
  const tone = count > 0 ? 'done' : 'none';
  const tipText = count > 0 ? `${count} ${label.toLowerCase()}` : `No ${label.toLowerCase()} yet`;
  return (
    <span
      className={`sf-image-count-badge sf-image-count-badge-${tone}`}
      title={tipText}
      aria-label={tipText}
    >
      <span className="sf-image-count-badge-num">{count}</span>
      <span className="sf-image-count-badge-label">{label}</span>
    </span>
  );
}
