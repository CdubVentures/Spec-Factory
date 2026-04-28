import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const PICKER_COLUMNS = ['brand', 'model', 'variant'] as const;
const PICKER_OPTIONS = Array.from({ length: 4 }, (_value, index) => `option-${index}`);

function DrillColumnSkeleton({ column }: { readonly column: string }) {
  return (
    <section
      className="min-h-[260px] p-3"
      data-region="picker-loading-drill-column"
      data-skeleton-column={column}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <SkeletonBlock className="sf-skel-caption" />
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="space-y-2">
        {PICKER_OPTIONS.map((option) => (
          <button
            key={`${column}-${option}`}
            type="button"
            className="w-full rounded px-3 py-2 text-left sf-surface-elevated border sf-border-soft"
            data-region="picker-loading-option"
            disabled
          >
            <SkeletonBlock className="sf-skel-bar" />
          </button>
        ))}
      </div>
    </section>
  );
}

export function PickerLoadingSkeleton() {
  return (
    <div data-testid="picker-loading-skeleton" aria-busy="true">
      <span className="sr-only">Loading product picker</span>
      <div className="sf-picker-search" data-region="picker-loading-search">
        <div className="sf-picker-search-row">
          <span className="sf-picker-search-icon" aria-hidden="true" />
          <div className="sf-picker-search-input">
            <SkeletonBlock className="sf-skel-bar" />
          </div>
          <kbd className="sf-picker-search-kbd" aria-hidden="true">/</kbd>
        </div>
      </div>
      <div className="sf-picker-drill" data-region="picker-loading-drill">
        {PICKER_COLUMNS.map((column) => (
          <DrillColumnSkeleton key={column} column={column} />
        ))}
      </div>
    </div>
  );
}
