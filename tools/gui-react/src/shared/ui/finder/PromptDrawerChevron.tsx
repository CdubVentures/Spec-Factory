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
  /** Display label. ReactNode so callers can embed count suffixes
   *  (e.g. "Hist (5qu)(12url)") matching the existing history button shape. */
  readonly label: ReactNode;
  /** Stable string identifier for React keys. Defaults to label when it's a
   *  plain string. Required when label is a ReactNode. */
  readonly id?: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
  /** Override the default 'prompt' intent. Use 'delete' for destructive
   *  actions like Unresolve / Delete, 'history' for history. */
  readonly intent?: ActionButtonIntent;
  /** Override the default standardRow width. Use for actions with longer
   *  labels (e.g. "Unresolve" / "Hist (NNqu)(NNurl)" need more room). */
  readonly width?: string;
}

interface PromptDrawerChevronProps {
  /** Primary-section action buttons. Optional — omit when the section is
   *  satisfied by `primaryCustom` alone (e.g. a drop-in DiscoveryHistoryButton). */
  readonly actions?: ReadonlyArray<PromptDrawerAction>;
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
  /** Second section rendered after a vertical divider. Used to group
   *  secondary actions (e.g. destructive Data: UnPub/Del) inside the same
   *  drawer as the primary Prompts: Run/Loop previews. */
  readonly secondaryTitle?: string;
  readonly secondaryLabelClass?: string;
  readonly secondaryActions?: ReadonlyArray<PromptDrawerAction>;
  /** Third section rendered after another divider. Used when the drawer
   *  carries three distinct concerns (e.g. Prompts: | Data: | Hist:). */
  readonly tertiaryTitle?: string;
  readonly tertiaryLabelClass?: string;
  readonly tertiaryActions?: ReadonlyArray<PromptDrawerAction>;
  /** Raw JSX rendered inside a section, appended after that section's
   *  actions. Use when the section needs a self-contained component
   *  (e.g. DiscoveryHistoryButton carrying its own counts + click handler)
   *  rather than a PromptDrawerAction. If you supply only *Custom, the
   *  section still renders as long as its title or actions are set (or
   *  the custom node is non-null). */
  readonly primaryCustom?: ReactNode;
  readonly secondaryCustom?: ReactNode;
  readonly tertiaryCustom?: ReactNode;
  /** Drawer height. 'row' (h-7, default) pairs with RowActionButton siblings
   *  — used for KeyRow / group-header / variant-row drawers. 'header' (h-8)
   *  pairs with HeaderActionButton siblings — used for panel-header drawers
   *  where the drawer contains DiscoveryHistoryButton / PromptPreviewTriggerButton
   *  at their natural h-8 size. Without this, h-8 buttons inside an h-7
   *  drawer get clipped by the `overflow-hidden` on the container. */
  readonly drawerHeight?: 'row' | 'header';
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
  secondaryTitle,
  secondaryLabelClass,
  secondaryActions,
  tertiaryTitle,
  tertiaryLabelClass,
  tertiaryActions,
  primaryCustom,
  secondaryCustom,
  tertiaryCustom,
  drawerHeight = 'row',
}: PromptDrawerChevronProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);
  // WHY: h-7 for row / group scopes (RowActionButton siblings); h-8 for
  // panel headers that host HeaderActionButton-sized content (h-8 naturally).
  // Without this, an h-8 DiscoveryHistoryButton dropped inside an h-7
  // drawer gets clipped by the container's overflow-hidden.
  const heightCls = drawerHeight === 'header' ? 'h-8' : 'h-7';
  const chevronSize = drawerHeight === 'header' ? 'h-8 w-8' : 'h-7 w-7';

  return (
    <div
      className={`relative inline-block ${heightCls} overflow-hidden rounded transition-[width] duration-300 ease-out ${open ? openWidthClass : closedWidthClass}`}
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
          {actions?.map((action) => (
            <RowActionButton
              key={action.id ?? (typeof action.label === 'string' ? action.label : 'prompt-action')}
              intent={action.intent ?? 'prompt'}
              label={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.title ?? (typeof action.label === 'string' ? `Preview ${action.label} prompt` : undefined)}
              width={action.width ?? ACTION_BUTTON_WIDTH.standardRow}
            />
          ))}
          {primaryCustom}
          {((secondaryActions && secondaryActions.length > 0) || secondaryCustom) && (
            <>
              <span className="inline-block h-5 w-px mx-1 bg-current opacity-20" aria-hidden />
              {secondaryTitle && (
                <span className={`text-[9px] font-bold uppercase tracking-[0.12em] mr-2 whitespace-nowrap ${secondaryLabelClass ?? labelClass ?? 'sf-prompt-preview-label'}`}>
                  {secondaryTitle}
                </span>
              )}
              {secondaryActions?.map((action) => (
                <RowActionButton
                  key={`secondary-${action.id ?? (typeof action.label === 'string' ? action.label : 'action')}`}
                  intent={action.intent ?? 'delete'}
                  label={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title ?? (typeof action.label === 'string' ? action.label : undefined)}
                  width={action.width ?? ACTION_BUTTON_WIDTH.standardRow}
                />
              ))}
              {secondaryCustom}
            </>
          )}
          {((tertiaryActions && tertiaryActions.length > 0) || tertiaryCustom) && (
            <>
              <span className="inline-block h-5 w-px mx-1 bg-current opacity-20" aria-hidden />
              {tertiaryTitle && (
                <span className={`text-[9px] font-bold uppercase tracking-[0.12em] mr-2 whitespace-nowrap ${tertiaryLabelClass ?? labelClass ?? 'sf-prompt-preview-label'}`}>
                  {tertiaryTitle}
                </span>
              )}
              {tertiaryActions?.map((action) => (
                <RowActionButton
                  key={`tertiary-${action.id ?? (typeof action.label === 'string' ? action.label : 'action')}`}
                  intent={action.intent ?? 'history'}
                  label={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title ?? (typeof action.label === 'string' ? action.label : undefined)}
                  width={action.width ?? ACTION_BUTTON_WIDTH.standardRow}
                />
              ))}
              {tertiaryCustom}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
          className={`inline-flex ${chevronSize} flex-shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity ${chevronClass ?? 'sf-text-muted'}`}
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
