interface CandidateDeleteConfirmProps {
  mode: 'single' | 'all';
  fieldLabel: string;
  candidateCount?: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

export function CandidateDeleteConfirm({
  mode,
  fieldLabel,
  candidateCount,
  onConfirm,
  onCancel,
  isPending,
}: CandidateDeleteConfirmProps) {
  const title = mode === 'all'
    ? `Delete all candidates for ${fieldLabel}?`
    : `Delete this candidate?`;

  const description = mode === 'all'
    ? `This will permanently remove ${candidateCount ?? 'all'} candidate(s) for ${fieldLabel}. Sources with no remaining candidates in other fields will have their artifacts removed.`
    : `This will remove this extraction for ${fieldLabel}. If this is the last candidate from this source, the backing run/artifacts will also be removed.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="sf-surface-panel rounded-lg shadow-xl p-6 max-w-sm w-full space-y-4">
        <h3 className="text-sm font-bold sf-text-primary">{title}</h3>
        <p className="sf-text-caption sf-text-muted">{description}</p>
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
            disabled={isPending}
            className="px-3 py-1.5 text-[11px] font-bold rounded sf-danger-button disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
