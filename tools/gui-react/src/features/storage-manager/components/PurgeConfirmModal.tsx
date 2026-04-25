import { useState } from 'react';

interface PurgeConfirmModalProps {
  totalRuns: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function PurgeConfirmModal({ totalRuns, onConfirm, onCancel, isPending }: PurgeConfirmModalProps) {
  const [typed, setTyped] = useState('');
  const confirmed = typed === 'DELETE';

  return (
    <div className="sf-overlay-muted fixed inset-0 z-50 flex items-center justify-center">
      <div className="sf-surface-elevated rounded-sm border sf-border-soft p-6 max-w-md w-full shadow-lg">
        <h3 className="text-sm font-bold mb-3 sf-status-text-danger">
          Purge All Runs
        </h3>
        <p className="text-xs sf-text-muted mb-3">
          This will permanently delete <strong>{totalRuns}</strong> {totalRuns === 1 ? 'run' : 'runs'} and all associated data.
          This action cannot be undone.
        </p>
        <p className="text-xs sf-text-muted mb-2">
          Type <code className="font-mono font-bold">DELETE</code> to confirm:
        </p>
        <input
          className="w-full rounded sf-input px-3 py-2 text-sm font-mono mb-4"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE"
          autoFocus
        />
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
            className="sf-danger-button-solid rounded px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            onClick={onConfirm}
            disabled={!confirmed || isPending}
          >
            {isPending ? 'Purging...' : 'Purge All'}
          </button>
        </div>
      </div>
    </div>
  );
}
