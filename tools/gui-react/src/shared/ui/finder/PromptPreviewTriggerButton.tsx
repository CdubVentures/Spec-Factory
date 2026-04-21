// WHY: Header-slot trigger for the Compiled Prompt preview modal. Symmetric
// with DiscoveryHistoryButton (same size/typography) but uses the Feature-group
// purple class so it reads as pre-dispatch/inspection, not a destructive run.

interface PromptPreviewTriggerButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}

export function PromptPreviewTriggerButton({
  onClick,
  disabled,
  title = 'Preview the compiled prompt that Run Now would send',
}: PromptPreviewTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-prompt-preview-button whitespace-nowrap text-center disabled:opacity-40 disabled:cursor-not-allowed"
      title={title}
    >
      Prompt
    </button>
  );
}
