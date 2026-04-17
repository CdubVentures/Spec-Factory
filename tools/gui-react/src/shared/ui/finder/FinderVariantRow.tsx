import type { ReactNode } from 'react';
import { Chip } from '../feedback/Chip.tsx';
import { ColorSwatch } from './ColorSwatch.tsx';
import type { FinderVariantRowData } from './variantRowHelpers.ts';

interface FinderVariantRowProps {
  readonly variant: FinderVariantRowData;
  readonly hexParts: readonly string[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** When false, clicking the header does nothing and the arrow renders muted. */
  readonly expandable?: boolean;
  /** Chips / buttons rendered flush-right in the header row. */
  readonly trailing: ReactNode;
  /** Expanded body. Rendered when expanded=true. */
  readonly children?: ReactNode;
}

/**
 * Shared variant row chrome for variant-dependent finder panels (PIF, RDF,
 * discontinued, …). Owns the outer panel, arrow, ColorSwatch, label, and
 * ED/CLR chip. Modules plug in their own trailing content and expanded body.
 */
export function FinderVariantRow({
  variant,
  hexParts,
  expanded,
  onToggle,
  expandable = true,
  trailing,
  children,
}: FinderVariantRowProps) {
  return (
    <div className="mb-3 sf-surface-panel rounded-lg overflow-hidden">
      <div
        onClick={expandable ? onToggle : undefined}
        className={`flex items-center gap-2 px-3 py-2.5 select-none ${expandable ? 'cursor-pointer hover:opacity-80' : ''}`}
      >
        <span
          className={`text-[10px] shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''} ${expandable ? 'sf-text-muted' : 'sf-text-subtle opacity-40'}`}
        >
          {'\u25B6'}
        </span>
        <ColorSwatch hexParts={hexParts} />
        <span className="text-[12px] font-semibold sf-text-primary truncate min-w-0 flex-1">
          {variant.variant_label}
        </span>
        <Chip
          label={variant.variant_type === 'edition' ? 'ED' : 'CLR'}
          className={variant.variant_type === 'edition' ? 'sf-chip-accent' : 'sf-chip-info'}
        />
        {trailing}
      </div>
      {expanded && children && (
        <div className="border-t sf-border-soft px-3 py-2">
          {children}
        </div>
      )}
    </div>
  );
}
