/**
 * PromptDrawerChevron — right-anchored chevron that expands left to reveal
 * inline action buttons.
 *
 * Mirrors the AppShell field-audit drawer pattern (AppShell.tsx:254-291):
 * fixed-height container anchored absolute right-0, width animates from
 * collapsed (chevron only) to expanded (chevron + inline actions). Chevron
 * rotates 180° on open; revealed content fades via opacity transition.
 * Same `sf-shell-header-drawer` token surface.
 *
 * Used by PIF Phase 2 (reveals View/Hero/Loop/Eval) and reserved for
 * RDF/SKU Phase 3 (reveals Run/Loop).
 */

import { usePersistedToggle } from '../../../stores/collapseStore.ts';

interface PromptDrawerAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}

interface PromptDrawerChevronProps {
  readonly actions: ReadonlyArray<PromptDrawerAction>;
  readonly storageKey: string;
  readonly openWidthClass: string;
  readonly closedWidthClass?: string;
  readonly ariaLabel: string;
  /** Small caps label shown at the left edge of the drawer when open. */
  readonly openTitle?: string;
}

export function PromptDrawerChevron({
  actions,
  storageKey,
  openWidthClass,
  closedWidthClass = 'w-7',
  ariaLabel,
  openTitle,
}: PromptDrawerChevronProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);

  return (
    <div
      className={`relative inline-block h-7 overflow-hidden rounded transition-[width] duration-300 ease-out ${open ? openWidthClass : closedWidthClass}`}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex h-full items-stretch">
        <div
          className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-1 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {openTitle && (
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] sf-prompt-preview-label mr-3 whitespace-nowrap">
              {openTitle}
            </span>
          )}
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={(e) => { e.stopPropagation(); action.onClick(); }}
              disabled={action.disabled}
              title={action.title ?? `Preview ${action.label} prompt`}
              className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-prompt-preview-button"
            >
              {action.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded sf-text-muted opacity-60 hover:opacity-100 transition-opacity"
          title={open ? 'Hide prompt previews' : 'Show prompt previews'}
          aria-expanded={open}
          aria-controls={`${storageKey}-drawer`}
        >
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path d="M13 4l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
