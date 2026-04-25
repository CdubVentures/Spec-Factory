import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export function isTypedPhraseMatched(input: string, phrase: string): boolean {
  return input.trim() === phrase;
}

interface TypedConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmPhrase: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly confirmLabel?: string;
  readonly isPending?: boolean;
}

export function TypedConfirmModal({
  open,
  title,
  body,
  confirmPhrase,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  isPending = false,
}: TypedConfirmModalProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setInput('');
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  if (!open) return null;

  const matched = isTypedPhraseMatched(input, confirmPhrase);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && matched && !isPending) {
      event.preventDefault();
      onConfirm();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      className="sf-overlay-muted fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="typed-confirm-title"
      onClick={onCancel}
    >
      <div
        className="sf-surface-panel rounded-lg shadow-xl p-6 max-w-sm w-full space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="typed-confirm-title" className="text-sm font-bold sf-text-primary">{title}</h3>
        <p className="sf-text-caption sf-text-muted">{body}</p>
        <div className="space-y-1.5">
          <label className="sf-text-caption sf-text-muted block">
            Type <span className="font-mono font-semibold sf-text-primary">{confirmPhrase}</span> to confirm:
          </label>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className="sf-input w-full px-2.5 py-2 sf-text-label"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={`Type ${confirmPhrase} to confirm`}
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-[11px] font-semibold rounded sf-action-button disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matched || isPending}
            className="px-3 py-1.5 text-[11px] font-bold rounded sf-danger-button disabled:opacity-50"
          >
            {isPending ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
