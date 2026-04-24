import type { ReactNode } from 'react';
import './FinderRunPopoverShell.css';

export interface FinderRunPopoverShellProps {
  /** Short finder name, e.g. "Color & Edition Finder". */
  readonly title: string;
  /** Tiny right-aligned meta, e.g. "1/2 runs" or "Variant: Black". */
  readonly meta?: ReactNode;
  /** Resolved model badge slot — pass a <FinderRunModelBadge /> here. */
  readonly modelSlot?: ReactNode;
  /** Action buttons row — typically one or more <button> elements. Omit to skip. */
  readonly actions?: ReactNode;
  /** Optional content between model and actions (e.g. variant picker). */
  readonly children?: ReactNode;
}

/**
 * Shared layout for finder-run popovers across the Overview panel. Every
 * finder (CEF / PIF / SKU / RDF / Keys) will render its run-trigger popover
 * through this shell so the anatomy — header · model · [body] · actions —
 * is consistent.
 */
export function FinderRunPopoverShell({
  title, meta, modelSlot, actions, children,
}: FinderRunPopoverShellProps) {
  return (
    <div className="sf-frp">
      <header className="sf-frp-header">
        <span className="sf-frp-title">{title}</span>
        {meta !== undefined && <span className="sf-frp-meta">{meta}</span>}
      </header>

      {modelSlot && (
        <section className="sf-frp-section">
          <span className="sf-frp-section-label">Model</span>
          <div className="sf-frp-section-body">{modelSlot}</div>
        </section>
      )}

      {children && (
        <section className="sf-frp-section">{children}</section>
      )}

      {actions != null && <div className="sf-frp-actions">{actions}</div>}
    </div>
  );
}
