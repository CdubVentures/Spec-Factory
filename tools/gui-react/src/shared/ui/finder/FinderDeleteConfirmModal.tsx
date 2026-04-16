import type { DeleteTarget } from './types.ts';

interface FinderDeleteConfirmModalProps {
  target: DeleteTarget;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  moduleLabel?: string;
  /** Override the default description with a module-specific explanation per kind. */
  descriptionOverrides?: Readonly<Partial<Record<DeleteTarget['kind'], string>>>;
}

function resolveTitle(target: DeleteTarget, moduleLabel: string): string {
  switch (target.kind) {
    case 'all': return `Delete all ${moduleLabel} data?`;
    case 'loop': return `Delete loop (${target.runNumbers?.length ?? 0} runs)?`;
    case 'run': return `Delete run #${target.runNumber}?`;
    case 'image': return `Delete image?`;
    case 'images-all': return `Delete all ${target.count ?? 0} image(s)?`;
    case 'images-variant': return `Delete ${target.count ?? 0} image(s) for "${target.label}"?`;
    case 'eval': return `Delete eval #${target.evalNumber}?`;
    case 'eval-all': return `Delete all ${target.count ?? 0} eval(s)?`;
    case 'eval-variant': return `Delete ${target.count ?? 0} eval(s) for variant?`;
    case 'variant': return `Delete variant "${target.label}"?`;
    case 'variant-all': return `Delete all ${target.count ?? 0} variant(s)?`;
  }
}

function resolveDefaultDescription(target: DeleteTarget, moduleLabel: string): string {
  switch (target.kind) {
    case 'all':
      return `This will permanently remove all ${target.count ?? 0} run(s) and reset the ${moduleLabel} state for this product.`;
    case 'loop':
      return `This will permanently remove all ${target.runNumbers?.length ?? 0} run(s) from this loop and recalculate the selected state from remaining runs.`;
    case 'run':
      return `This will permanently remove run #${target.runNumber} and recalculate the selected state from remaining runs.`;
    case 'image':
      return `This will permanently delete "${target.filename ?? 'this image'}" from disk and remove it from all run records.`;
    case 'images-all':
      return `This will permanently delete all ${target.count ?? 0} image(s) from disk and remove them from all run records. Run history and eval records are preserved.`;
    case 'images-variant':
      return `This will permanently delete ${target.count ?? 0} image(s) for variant "${target.label ?? ''}" from disk. Run history and eval records are preserved.`;
    case 'eval':
      return `This will permanently remove eval #${target.evalNumber} and its carousel selections.`;
    case 'eval-all':
      return `This will permanently remove all ${target.count ?? 0} eval record(s) and reset carousel selections for this product.`;
    case 'eval-variant':
      return `This will permanently remove ${target.count ?? 0} eval(s) for variant "${target.label ?? ''}" and reset its carousel selections.`;
    case 'variant':
      return `This will permanently strip this variant's values from all field candidates, remove its colors/editions from published values, delete all PIF data (images, runs, evals), and remove carousel slots. This cannot be undone.`;
    case 'variant-all':
      return `This will permanently delete all ${target.count ?? 0} variant(s) and cascade-delete all variant-scoped data (field candidates, images, evals, carousel slots). This cannot be undone.`;
  }
}

export function FinderDeleteConfirmModal({ target, onConfirm, onCancel, isPending, moduleLabel = 'Finder', descriptionOverrides }: FinderDeleteConfirmModalProps) {
  const title = resolveTitle(target, moduleLabel);
  const description = descriptionOverrides?.[target.kind] ?? resolveDefaultDescription(target, moduleLabel);

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
