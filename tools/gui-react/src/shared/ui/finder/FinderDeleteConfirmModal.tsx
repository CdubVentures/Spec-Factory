import type { DeleteTarget } from './types.ts';

interface FinderDeleteConfirmModalProps {
  target: DeleteTarget;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  moduleLabel?: string;
  /** Override the default description with a module-specific explanation. */
  descriptionOverrides?: Readonly<Record<'run' | 'loop' | 'all', string>>;
}

export function FinderDeleteConfirmModal({ target, onConfirm, onCancel, isPending, moduleLabel = 'Finder', descriptionOverrides }: FinderDeleteConfirmModalProps) {
  const title = target.kind === 'all'
    ? `Delete all ${moduleLabel} data?`
    : target.kind === 'loop'
      ? `Delete loop (${target.runNumbers?.length ?? 0} runs)?`
      : `Delete run #${target.runNumber}?`;

  const defaultDescription = target.kind === 'all'
    ? `This will permanently remove all ${target.count ?? 0} run(s) and reset the ${moduleLabel} state for this product.`
    : target.kind === 'loop'
      ? `This will permanently remove all ${target.runNumbers?.length ?? 0} run(s) from this loop and recalculate the selected state from remaining runs.`
      : `This will permanently remove run #${target.runNumber} and recalculate the selected state from remaining runs.`;

  const description = descriptionOverrides?.[target.kind] ?? defaultDescription;

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
