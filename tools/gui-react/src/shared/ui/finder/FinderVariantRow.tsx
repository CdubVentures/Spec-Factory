import type { ReactNode } from 'react';
import { ColorSwatch } from './ColorSwatch.tsx';
import type { FinderVariantRowData } from './variantRowHelpers.ts';
import './FinderVariantRow.css';

interface FinderVariantRowProps {
  readonly variant: FinderVariantRowData;
  readonly hexParts: readonly string[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** When false, clicking the header does nothing and the row becomes purely presentational. */
  readonly expandable?: boolean;
  /** Secondary content rendered below the name (e.g. the mono value, a status word). */
  readonly secondary?: ReactNode;
  /** Right-side content — typically a ring/badge + action buttons. */
  readonly trailing: ReactNode;
  /** Content rendered between the header and the expandable body. Shows regardless of expand state (use for data-integrity banners, etc.). */
  readonly afterHeader?: ReactNode;
  /** Expanded body. Rendered when expanded=true. */
  readonly children?: ReactNode;
}

/**
 * Shared variant row chrome for variant-dependent finder panels (PIF, RDF,
 * SKU, …). Layout:
 *
 *   [swatch] [main-col: name / secondary] [trailing (ring + actions)]
 *
 * Whole header is the click target when `expandable` is true. No arrow
 * caret — the expanded body below is the feedback.
 */
export function FinderVariantRow({
  variant,
  hexParts,
  expanded,
  onToggle,
  expandable = true,
  secondary,
  trailing,
  afterHeader,
  children,
}: FinderVariantRowProps) {
  return (
    <div className="sf-variant-row mb-3 sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={expandable ? onToggle : undefined}
        className={`sf-variant-row-header ${expandable ? 'sf-variant-row-header-clickable' : ''}`}
      >
        <svg
          className={`sf-variant-row-caret ${expanded ? 'sf-variant-row-caret-open' : ''} ${expandable ? '' : 'sf-variant-row-caret-disabled'}`}
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <ColorSwatch hexParts={hexParts} size="tall" />
        <div className="sf-variant-row-main">
          <span className="sf-variant-row-name">{variant.variant_label}</span>
          {secondary && (
            <span className="sf-variant-row-secondary">{secondary}</span>
          )}
        </div>
        <div className="sf-variant-row-trailing" onClick={(e) => e.stopPropagation()}>
          {trailing}
        </div>
      </div>
      {afterHeader}
      {expanded && children && (
        <div className="sf-variant-row-body border-t sf-border-soft px-3 py-2">
          {children}
        </div>
      )}
    </div>
  );
}
