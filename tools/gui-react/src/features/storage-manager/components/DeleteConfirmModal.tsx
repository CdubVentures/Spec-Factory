interface DeleteConfirmModalProps {
  runIds: string[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function DeleteConfirmModal({ runIds, onConfirm, onCancel, isPending }: DeleteConfirmModalProps) {
  const count = runIds.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="sf-surface-elevated rounded-sm border sf-border-soft p-6 max-w-md w-full shadow-lg">
        <h3 className="text-sm font-bold mb-3">
          Delete {count} {count === 1 ? 'Run' : 'Runs'}?
        </h3>
        <p className="text-xs sf-text-muted mb-2">
          This will permanently remove the following {count === 1 ? 'run' : 'runs'} and all associated artifacts:
        </p>
        <ul className="text-xs font-mono sf-text-muted mb-4 max-h-32 overflow-y-auto space-y-0.5">
          {runIds.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
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
