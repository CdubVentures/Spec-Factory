/**
 * RunPreviewCell — overview-popover atom that pairs a finder run/loop
 * button with a thin purple "Prompt" button underneath that opens a
 * PromptPreviewModal showing the exact prompt that would be dispatched.
 *
 * Used by every Overview finder popover (PIF, SKU, RDF, Keys) so the
 * stacked run + preview pattern lives in one place.
 */

interface RunPreviewCellProps {
  readonly label: string;
  readonly runTitle: string;
  readonly previewTitle: string;
  readonly onRun: () => void;
  readonly onPreview: () => void;
  readonly disabled?: boolean;
  readonly previewDisabled?: boolean;
  readonly primary?: boolean;
}

export function RunPreviewCell({
  label,
  runTitle,
  previewTitle,
  onRun,
  onPreview,
  disabled,
  previewDisabled,
  primary,
}: RunPreviewCellProps) {
  return (
    <div className="sf-overview-run-cell">
      <button
        type="button"
        className={primary ? 'sf-frp-btn-primary' : 'sf-frp-btn-secondary'}
        onClick={onRun}
        disabled={disabled}
        title={runTitle}
      >
        {label}
      </button>
      <button
        type="button"
        className="sf-prompt-preview-button h-3 w-full text-[7px] font-bold uppercase tracking-[0.08em] leading-none"
        onClick={onPreview}
        disabled={previewDisabled ?? disabled}
        title={previewTitle}
        aria-label={previewTitle}
      >
        Prompt
      </button>
    </div>
  );
}
