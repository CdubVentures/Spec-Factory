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
        <SkeletonBlock className="sf-skel-bar-label" />
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="space-y-2">
        {PICKER_OPTIONS.map((option) => (
          <span
            key={`${column}-${option}`}
            className="sf-shimmer block w-full h-9 rounded sf-surface-elevated border sf-border-soft"
            data-region="picker-loading-option"
            data-skeleton-option={option}
            aria-hidden="true"
          />
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
          <div className="sf-picker-search-input sf-shimmer h-9 w-full" aria-hidden="true" />
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
