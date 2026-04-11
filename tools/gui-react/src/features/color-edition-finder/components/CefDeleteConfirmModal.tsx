interface CefDeleteConfirmModalProps {
  readonly target: { kind: 'single'; runNumber: number } | { kind: 'all'; count: number };
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly isPending: boolean;
}

export function CefDeleteConfirmModal({ target, onConfirm, onCancel, isPending }: CefDeleteConfirmModalProps) {
  const isBulk = target.kind === 'all';
  const title = isBulk
    ? `Delete All ${target.count} Run${target.count !== 1 ? 's' : ''}?`
    : `Delete Run #${target.runNumber}?`;
  const description = isBulk
    ? 'This will permanently remove all run history and associated artifacts for this product.'
    : `This will permanently remove Run #${target.runNumber} and its associated artifacts.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="sf-surface-elevated rounded-sm border sf-border-soft p-6 max-w-md w-full shadow-lg">
        <h3 className="text-sm font-bold mb-3">{title}</h3>
        <p className="text-xs sf-text-muted mb-4">{description}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded sf-icon-button px-3 py-1.5 text-xs"
            onClick={onCancel}
            disabled={isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-red-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
