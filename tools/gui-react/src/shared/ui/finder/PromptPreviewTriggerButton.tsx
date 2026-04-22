// WHY: Header-slot trigger for the Compiled Prompt preview modal. Renders via
// HeaderActionButton with intent="prompt" so the purple theme and header
// sizing stay identical across every panel. Width prop lets a panel align
// Prompt with Run/Loop/History siblings in the same cluster.

import { HeaderActionButton } from '../actionButton/index.ts';

interface PromptPreviewTriggerButtonProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly width?: string;
}

export function PromptPreviewTriggerButton({
  onClick,
  disabled,
  title = 'Preview the compiled prompt that Run Now would send',
  width,
}: PromptPreviewTriggerButtonProps) {
  return (
    <HeaderActionButton
      intent="prompt"
      label="Prompt"
      onClick={onClick}
      disabled={disabled}
      title={title}
      width={width}
    />
  );
}
