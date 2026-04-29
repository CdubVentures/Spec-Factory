import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';

interface ComponentReviewPageSkeletonProps {
  readonly category: string;
}

interface ComponentReviewContentSkeletonProps {
  readonly mode: ComponentReviewContentSkeletonMode;
}

interface ComponentReviewColumn {
  readonly id: string;
}

export type ComponentReviewContentSkeletonMode = 'components' | 'enums';

const baseTabCls = 'px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer rounded sf-nav-item';
const inactiveTabCls = 'sf-text-muted';
const metricLabels = ['Components'] as const;
const placeholderTabs = ['Switches', 'Sensors', 'Encoders', 'Cables', 'Enum Lists'] as const;
const componentColumns: readonly ComponentReviewColumn[] = [
  { id: 'name' },
  { id: 'maker' },
  { id: 'aliases' },
  { id: 'links' },
];
const componentRows = Array.from({ length: 8 }, (_value, index) => `component-${index}`);
const enumFields = Array.from({ length: 8 }, (_value, index) => `field-${index}`);
const enumValues = Array.from({ length: 10 }, (_value, index) => `value-${index}`);

function MetricCardSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm" data-region="component-review-loading-metric-card">
      <p className="text-xs sf-status-text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        <span className="sf-shimmer inline-block h-6 w-16 rounded-sm" aria-hidden="true" />
      </p>
    </div>
  );
}

function PageShellSkeleton({ category }: ComponentReviewPageSkeletonProps) {
  return (
    <div className="space-y-3" data-region="component-review-loading-page">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3" data-region="component-review-loading-metrics">
        {metricLabels.map((label) => (
          <MetricCardSkeleton key={label} label={label} />
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto" data-region="component-review-loading-tabs">
        {placeholderTabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={`${baseTabCls} ${index === 0 ? 'sf-nav-item-active' : inactiveTabCls}`}
            data-region="component-review-loading-tab"
            disabled
          >
            {tab}
            {index < placeholderTabs.length - 1 && (
              <span
                className="sf-shimmer ml-1.5 inline-block h-4 w-6 rounded-full"
                aria-hidden="true"
              />
            )}
          </button>
        ))}
      </div>

      <ComponentReviewContentSkeleton mode="components" />
      <span className="sr-only">Loading component review for {category}</span>
    </div>
  );
}

function ComponentCellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'name') {
    return (
      <span
        className="sf-shimmer block h-3.5 w-full rounded-sm"
        aria-hidden="true"
      />
    );
  }
  if (columnId === 'maker') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'aliases') {
    return (
      <div className="flex flex-wrap gap-1">
        <span className="sf-shimmer inline-block h-5 w-12 rounded-full" aria-hidden="true" />
        <span className="sf-shimmer inline-block h-5 w-10 rounded-full" aria-hidden="true" />
      </div>
    );
  }
  if (columnId === 'links') {
    return <span className="sf-shimmer inline-block h-5 w-16 rounded-md" aria-hidden="true" />;
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function ComponentTableSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-w-0" data-region="component-review-loading-component-grid">
      <input
        type="text"
        placeholder="Search..."
        className="sf-input sf-primitive-input sf-table-search-input mb-2 w-full max-w-xs sf-shimmer"
        disabled
      />
      <div className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]" data-region="component-review-loading-table">
        <table className="min-w-full text-sm table-fixed" aria-hidden="true">
          <thead className="sf-table-head sticky top-0">
            <tr>
              {componentColumns.map((column) => (
                <th key={column.id} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column.id}>
                  <SkeletonBlock className="sf-skel-bar-label" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {componentRows.map((row) => (
              <tr key={row} className="sf-table-row cursor-pointer" data-skeleton-row={row}>
                {componentColumns.map((column) => (
                  <td key={`${row}-${column.id}`} className="px-2 py-1.5 whitespace-nowrap overflow-hidden">
                    <ComponentCellSkeleton columnId={column.id} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComponentTabSkeleton() {
  return (
    <ComponentTableSkeleton />
  );
}

function EnumFieldSkeleton({ row }: { readonly row: string }) {
  return (
    <div
      className="w-full px-2 py-1.5 flex items-center justify-between gap-2 rounded sf-nav-item sf-text-muted"
      data-region="component-review-loading-enum-field"
      data-skeleton-row={row}
    >
      <span
        className="sf-shimmer block h-3.5 flex-1 rounded-sm"
        aria-hidden="true"
      />
      <span className="sf-shimmer inline-block h-4 w-6 rounded-full shrink-0" aria-hidden="true" />
    </div>
  );
}

function EnumValueSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="w-full px-3 py-1 flex items-center gap-2 rounded" data-region="component-review-loading-enum-value" data-skeleton-row={row}>
      <span
        className="sf-shimmer block h-3.5 w-full rounded-sm"
        aria-hidden="true"
      />
    </div>
  );
}

function EnumValueGroupSkeleton({ title, offset = 0 }: { readonly title: string; readonly offset?: number }) {
  return (
    <section className="p-2 space-y-1">
      <div className="px-1 py-1 flex items-center justify-between">
        <h3 className="text-xs font-medium sf-text-muted">{title}</h3>
        <span className="sf-shimmer inline-block h-4 w-8 rounded-full" aria-hidden="true" />
      </div>
      <div className="space-y-0.5">
        {enumValues.slice(offset, offset + 5).map((row) => (
          <EnumValueSkeleton key={`${title}-${row}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function EnumTabSkeleton() {
  return (
    <div className="grid grid-cols-[220px,1fr] gap-3 min-h-[400px]" data-region="component-review-loading-enum-grid">
      <div className="border sf-border-default rounded-lg overflow-y-auto max-h-[calc(100vh-320px)]" data-region="component-review-loading-enum-fields">
        <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default">
          <p className="text-xs font-medium sf-text-muted">Fields</p>
        </div>
        <div className="p-1 space-y-0.5">
          {enumFields.map((row) => (
            <EnumFieldSkeleton key={row} row={row} />
          ))}
        </div>
      </div>

      <div className="border sf-border-default rounded-lg overflow-y-auto max-h-[calc(100vh-320px)] min-w-0" data-region="component-review-loading-enum-values">
        <div className="sticky top-0 sf-surface-elevated px-3 py-2 border-b sf-border-default flex items-center justify-between">
          <p className="text-xs font-medium sf-text-muted">
            <SkeletonBlock className="sf-skel-bar-label" />
          </p>
        </div>
        <EnumValueGroupSkeleton title="Manual values" />
        <EnumValueGroupSkeleton title="Discovered values" offset={5} />
      </div>
    </div>
  );
}

export function ComponentReviewContentSkeleton({ mode }: ComponentReviewContentSkeletonProps) {
  if (mode === 'enums') return <EnumTabSkeleton />;
  return <ComponentTabSkeleton />;
}

export function ComponentReviewPageSkeleton({ category }: ComponentReviewPageSkeletonProps) {
  return (
    <div data-testid="component-review-loading-skeleton" aria-busy="true">
      <PageShellSkeleton category={category} />
    </div>
  );
}
