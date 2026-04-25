import type { DeleteTarget } from './types.ts';

interface FinderDeleteConfirmModalProps {
  target: DeleteTarget;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
  moduleLabel?: string;
  /** Override the default description with a module-specific explanation per kind. */
  descriptionOverrides?: Readonly<Partial<Record<DeleteTarget['kind'], string>>>;
  /** Override the confirm button label. Defaults to "Delete". Use for non-delete
   *  destructive verbs like "Unresolve" that share this modal's confirmation UX. */
  confirmLabel?: string;
  /** Override the in-progress confirm label. Defaults to `${confirmLabel}...`. */
  pendingLabel?: string;
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
    case 'carousel-clear-variant': return `Clear carousel winners for "${target.label ?? target.variantKey ?? ''}"?`;
    case 'variant': return `Delete variant "${target.label}"?`;
    case 'variant-all': return `Delete all ${target.count ?? 0} variant(s)?`;
    case 'key-unpublish': return `Unresolve "${target.fieldKey ?? ''}"?`;
    case 'key-delete': return `Delete all data for "${target.fieldKey ?? ''}"?`;
    case 'key-unpublish-group': return `Unresolve ${target.count ?? 0} key(s) in "${target.label ?? ''}"?`;
    case 'key-delete-group': return `Delete all data for ${target.count ?? 0} key(s) in "${target.label ?? ''}"?`;
    case 'key-unpublish-all': return `Unresolve all ${target.count ?? 0} published key(s)?`;
    case 'key-delete-all': return `Delete all data for ${target.count ?? 0} key(s) in this product?`;
    case 'field-variant-unpublish': return `Unpublish ${target.fieldKey ?? ''} for "${target.label ?? target.variantId ?? ''}"?`;
    case 'field-variant-delete': return `Delete all ${target.fieldKey ?? ''} data for "${target.label ?? target.variantId ?? ''}"?`;
    case 'field-all-variants-unpublish': return `Unpublish ${target.fieldKey ?? ''} for all ${target.count ?? 0} variant(s)?`;
    case 'field-all-variants-delete': return `Delete all ${target.fieldKey ?? ''} data across all ${target.count ?? 0} variant(s)?`;
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
    case 'carousel-clear-variant':
      return `This will clear the current carousel winner flags and manual slot overrides for variant "${target.label ?? target.variantKey ?? ''}". Images, runs, and eval history are preserved.`;
    case 'variant':
      return `This will permanently strip this variant's values from all field candidates, remove its colors/editions from published values, delete all PIF data (images, runs, evals), and remove carousel slots. This cannot be undone.`;
    case 'variant-all':
      return `This will permanently delete all ${target.count ?? 0} variant(s) and cascade-delete all variant-scoped data (field candidates, images, evals, carousel slots). This cannot be undone.`;
    case 'key-unpublish':
      return `Demote the published value for "${target.fieldKey ?? ''}" back to a candidate. Candidates, runs, and discovery history are preserved — a future Run can re-resolve. Reversible.`;
    case 'key-delete':
      return `Permanently wipe every trace of "${target.fieldKey ?? ''}": the published value, confidence, all candidates and evidence, URL history, query history, and every run where this key was the primary. Fresh slate. This cannot be undone.`;
    case 'key-unpublish-group':
      return `Demote every currently published value in "${target.label ?? ''}" back to a candidate. Candidates, runs, and discovery history are preserved per key. Reversible.`;
    case 'key-delete-group':
      return `Permanently wipe every trace of ${target.count ?? 0} key(s) in "${target.label ?? ''}": published values, candidates, evidence, URL/query history, and every primary run. Fresh slate for each. This cannot be undone.`;
    case 'key-unpublish-all':
      return `Demote every currently published value across every group back to a candidate. Candidates, runs, and discovery history are preserved per key. Reversible.`;
    case 'key-delete-all':
      return `Permanently wipe every trace of ${target.count ?? 0} key(s) across every group: published values, candidates, evidence, URL/query history, and every primary run. Fresh slate for each. This cannot be undone.`;
    case 'field-variant-unpublish':
      return `Demote the published ${target.fieldKey ?? 'field'} value for "${target.label ?? target.variantId ?? ''}" back to a candidate. Candidates and run history are preserved — a future Run can re-resolve. Reversible.`;
    case 'field-variant-delete':
      return `Permanently wipe the ${target.fieldKey ?? 'field'} value, all candidates, and evidence for "${target.label ?? target.variantId ?? ''}". Other variants and run records are untouched. This cannot be undone.`;
    case 'field-all-variants-unpublish':
      return `Demote every published ${target.fieldKey ?? 'field'} value across all ${target.count ?? 0} variant(s) back to a candidate. Candidates, runs, and discovery history are preserved per variant. Reversible.`;
    case 'field-all-variants-delete':
      return `Permanently wipe the ${target.fieldKey ?? 'field'} value, every candidate, evidence, and every run for all ${target.count ?? 0} variant(s) in this product. Fresh slate. This cannot be undone.`;
  }
}

export function FinderDeleteConfirmModal({ target, onConfirm, onCancel, isPending, moduleLabel = 'Finder', descriptionOverrides, confirmLabel, pendingLabel }: FinderDeleteConfirmModalProps) {
  const title = resolveTitle(target, moduleLabel);
  const description = descriptionOverrides?.[target.kind] ?? resolveDefaultDescription(target, moduleLabel);
  const finalConfirmLabel = confirmLabel ?? 'Delete';
  const finalPendingLabel = pendingLabel ?? `${finalConfirmLabel.replace(/e$/, '')}ing...`;

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
            {isPending ? finalPendingLabel : finalConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
