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

import type { ReactNode } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../actionButton/index.ts';
import type { ActionButtonIntent } from '../actionButton/index.ts';

interface PromptDrawerAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
  /** Override the default 'prompt' intent. Use 'delete' for destructive
   *  actions like Unresolve / Delete. */
  readonly intent?: ActionButtonIntent;
  /** Override the default standardRow width. Use for actions with longer
   *  labels (e.g. "Unresolve" / "Delete group" need keyRow / keyGroup). */
  readonly width?: string;
}

interface PromptDrawerChevronProps {
  readonly actions: ReadonlyArray<PromptDrawerAction>;
  readonly storageKey: string;
  readonly openWidthClass: string;
  readonly closedWidthClass?: string;
  readonly ariaLabel: string;
  /** Small caps label shown at the left edge of the drawer when open. */
  readonly openTitle?: string;
  /** Chevron + prompt-preview-label class. Use a destructive-tinted variant
   *  when wrapping Delete/Unresolve actions so the collapsed chevron signals
   *  the drawer's contents. Defaults to the prompt-preview tokens. */
  readonly chevronClass?: string;
  readonly labelClass?: string;
  /** Tooltip shown when the chevron is closed / open. Defaults to the
   *  prompt-preview wording. */
  readonly closedTitle?: string;
  readonly openedTitle?: string;
  /** Optional element rendered in place of the default title label when
   *  open. Useful for leading icons or compound labels. */
  readonly openTitleContent?: ReactNode;
}

export function PromptDrawerChevron({
  actions,
  storageKey,
  openWidthClass,
  closedWidthClass = 'w-7',
  ariaLabel,
  openTitle,
  chevronClass,
  labelClass,
  closedTitle,
  openedTitle,
  openTitleContent,
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
          {openTitleContent ?? (openTitle && (
            <span className={`text-[9px] font-bold uppercase tracking-[0.12em] mr-3 whitespace-nowrap ${labelClass ?? 'sf-prompt-preview-label'}`}>
              {openTitle}
            </span>
          ))}
          {actions.map((action) => (
            <RowActionButton
              key={action.label}
              intent={action.intent ?? 'prompt'}
              label={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title ?? `Preview ${action.label} prompt`}
              width={action.width ?? ACTION_BUTTON_WIDTH.standardRow}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
          className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity ${chevronClass ?? 'sf-text-muted'}`}
          title={open ? (openedTitle ?? 'Hide prompt previews') : (closedTitle ?? 'Show prompt previews')}
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
