import { useCallback, useState } from 'react';

export interface CopyButtonProps {
  readonly text: string;
  readonly label?: string;
  readonly copiedLabel?: string;
  readonly className?: string;
  readonly title?: string;
}

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'px-2 py-0.5 text-[10px] font-semibold rounded sf-icon-button',
  title = 'Copy to clipboard',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className={className}
      title={title}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
