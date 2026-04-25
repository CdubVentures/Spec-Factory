/**
 * PifRunStackDrawer — chevron-expand drawer hosting per-run stacked columns.
 *
 * Closed state: chevron only (matches PromptDrawerChevron h-7 w-7 affordance).
 * Open state: width animates wider AND height grows to fit two stacked rows
 * per column — top is a `spammable` run button, bottom is a thin purple
 * `prompt`-intent preview button that opens the LLM prompt that WOULD be
 * sent if the run button above were clicked.
 */

import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';

export interface PifRunStackAction {
  readonly id: string;
  readonly label: string;
  readonly runTitle?: string;
  readonly previewTitle?: string;
  readonly onRun: () => void;
  readonly onPreview: () => void;
}

interface PifRunStackDrawerProps {
  readonly actions: ReadonlyArray<PifRunStackAction>;
  readonly storageKey: string;
  readonly ariaLabel: string;
  readonly openTitle?: string;
  readonly openWidthClass: string;
}

export function PifRunStackDrawer({
  actions,
  storageKey,
  ariaLabel,
  openTitle = 'Run:',
  openWidthClass,
}: PifRunStackDrawerProps) {
  const [open, toggleOpen] = usePersistedToggle(storageKey, false);

  return (
    <div
      className={`relative inline-block overflow-hidden rounded transition-[width,height] duration-300 ease-out ${open ? `${openWidthClass} h-11` : 'w-7 h-7'}`}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex h-full items-stretch">
        <div
          className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-1 transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          {openTitle && (
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] mr-2 whitespace-nowrap sf-prompt-preview-label">
              {openTitle}
            </span>
          )}
          {actions.map((action) => (
            <div key={action.id} className={`flex flex-col items-stretch gap-0.5 ${ACTION_BUTTON_WIDTH.standardRow}`}>
              <RowActionButton
                intent="spammable"
                label={action.label}
                onClick={action.onRun}
                title={action.runTitle ?? action.label}
                width={ACTION_BUTTON_WIDTH.standardRow}
              />
              <button
                type="button"
                onClick={action.onPreview}
                title={action.previewTitle ?? `Preview ${action.label} prompt`}
                aria-label={action.previewTitle ?? `Preview ${action.label} prompt`}
                className="sf-prompt-preview-button h-3 w-full text-[7px] font-bold uppercase tracking-[0.08em] leading-none"
              >
                Prompt
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleOpen(); }}
          className="inline-flex h-7 w-7 self-center flex-shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100 transition-opacity sf-text-muted"
          title={open ? 'Hide run actions' : 'Show run actions'}
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
