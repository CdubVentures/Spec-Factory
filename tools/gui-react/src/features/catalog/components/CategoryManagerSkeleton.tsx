import { useUiCategoryStore } from '../../../stores/uiCategoryStore.ts';

// WHY: Categories live in a synchronous zustand store, so the skeleton renders
// real category names (transparent text) inside real chip chrome. The chip
// count, widths, and active-row position match what will hydrate. Only the
// chip chrome shimmers — the structural shape is byte-identical to the loaded
// view.
export function CategoryManagerSkeleton() {
  const categories = useUiCategoryStore((s) => s.categories);
  return (
    <div className="space-y-3" data-region="categories-loading" aria-busy="true">
      <span className="sr-only">Loading categories</span>
      <div className="sf-surface-card rounded p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Categories</h3>
            <p className="mt-0.5 text-xs sf-text-subtle">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}. Select one to set it as the active working category.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="sf-input sf-shimmer w-48"
              style={{ height: '34px' }}
              aria-hidden="true"
            />
            <span
              className="sf-shimmer rounded-md inline-block"
              style={{ width: '64px', height: '34px' }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm sf-nav-item-muted sf-shimmer"
              aria-hidden="true"
            >
              <span className="font-medium text-transparent">{cat}</span>
            </span>
          ))}
        </div>

        {categories.length === 0 && (
          <p className="mt-2 text-sm italic sf-text-subtle">No categories found. Add one above to get started.</p>
        )}
      </div>
    </div>
  );
}
