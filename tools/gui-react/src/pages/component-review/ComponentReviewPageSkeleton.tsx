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
const metricLabels = ['Components', 'Avg Confidence', 'Flags'] as const;
const placeholderTabs = ['Switches', 'Sensors', 'Encoders', 'Cables', 'Enum Lists'] as const;
const componentColumns: readonly ComponentReviewColumn[] = [
  { id: 'name' },
  { id: 'maker' },
  { id: 'origin' },
  { id: 'aliases' },
  { id: 'linked_products' },
  { id: 'flags' },
  { id: 'ai' },
];
const componentRows = Array.from({ length: 8 }, (_value, index) => `component-${index}`);
const enumFields = Array.from({ length: 8 }, (_value, index) => `field-${index}`);
const enumValues = Array.from({ length: 10 }, (_value, index) => `value-${index}`);

function MetricCardSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm" data-region="component-review-loading-metric-card">
      <p className="text-xs sf-status-text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        <SkeletonBlock className="sf-skel-caption" />
      </p>
    </div>
  );
}

function PageShellSkeleton({ category }: ComponentReviewPageSkeletonProps) {
  return (
    <div className="space-y-3" data-region="component-review-loading-page">
      <div className="flex items-center justify-end" data-region="component-review-loading-debug-row">
        <button type="button" className="px-2.5 py-1 rounded sf-text-label font-medium border transition-colors sf-icon-button" disabled>
          Debug LP+ID OFF
        </button>
      </div>

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
              <span className="ml-1.5 sf-text-nano sf-chip-neutral rounded-full px-1.5 py-0.5">
                <SkeletonBlock className="sf-skel-caption" />
              </span>
            )}
          </button>
        ))}
      </div>

      <ComponentReviewContentSkeleton mode="components" />
      <span className="sr-only">Loading component review for {category}</span>
    </div>
  );
}

function ComponentReviewPanelSkeleton() {
  return (
    <div className="mb-3" data-region="component-review-loading-panel">
      <div className="px-3 py-2 sf-surface-elevated flex items-center justify-between rounded">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Component Review</span>
          <span className="px-2 py-0.5 rounded-full sf-text-nano font-medium sf-chip-accent">
            <SkeletonBlock className="sf-skel-caption" />
          </span>
          <span className="px-2 py-0.5 rounded-full sf-text-nano font-medium sf-chip-warning">
            <SkeletonBlock className="sf-skel-caption" />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="px-2 py-1 sf-text-nano font-medium rounded sf-run-ai-button disabled:opacity-50" disabled>
            Run AI Review All
          </button>
          <button type="button" className="px-2 py-1 sf-text-nano font-medium rounded sf-icon-button" disabled>
            Show Details
          </button>
        </div>
      </div>
    </div>
  );
}

function ComponentTableSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 min-w-0" data-region="component-review-loading-component-grid">
      <input type="text" placeholder="Search..." className="sf-input sf-primitive-input sf-table-search-input mb-2 w-full max-w-xs" disabled />
      <div className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]" data-region="component-review-loading-table">
        <table className="min-w-full text-sm table-fixed" aria-hidden="true">
          <thead className="sf-table-head sticky top-0">
            <tr>
              {componentColumns.map((column) => (
                <th key={column.id} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column.id}>
                  <SkeletonBlock className="sf-skel-caption" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {componentRows.map((row) => (
              <tr key={row} className="sf-table-row cursor-pointer" data-skeleton-row={row}>
                {componentColumns.map((column) => (
                  <td key={`${row}-${column.id}`} className="px-2 py-1.5 whitespace-nowrap overflow-hidden">
                    <SkeletonBlock className="sf-skel-bar" />
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
    <>
      <ComponentReviewPanelSkeleton />
      <ComponentTableSkeleton />
    </>
  );
}

function EnumFieldSkeleton({ row }: { readonly row: string }) {
  return (
    <button
      type="button"
      className="w-full px-2 py-1.5 flex items-center justify-between gap-2 rounded sf-nav-item sf-text-muted"
      data-region="component-review-loading-enum-field"
      data-skeleton-row={row}
      disabled
    >
      <SkeletonBlock className="sf-skel-caption" />
      <span className="sf-text-nano sf-text-muted"><SkeletonBlock className="sf-skel-caption" /></span>
    </button>
  );
}

function EnumValueSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="w-full px-3 py-1 flex items-center gap-2 rounded" data-region="component-review-loading-enum-value" data-skeleton-row={row}>
      <SkeletonBlock className="sf-skel-bar" />
      <span className="px-1.5 py-0.5 rounded sf-text-nano font-medium sf-run-ai-button flex-shrink-0">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
    </div>
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
          <p className="text-xs font-medium sf-text-muted"><SkeletonBlock className="sf-skel-caption" /></p>
          <button type="button" className="px-2 py-0.5 sf-run-ai-button sf-text-nano rounded disabled:opacity-50" disabled>
            Run AI Review
          </button>
        </div>
        <div className="p-1 space-y-0.5">
          {enumValues.map((row) => (
            <EnumValueSkeleton key={row} row={row} />
          ))}
        </div>
        <div className="sticky bottom-0 sf-surface-elevated border-t sf-border-default p-2">
          <div className="flex gap-2">
            <input type="text" className="flex-1 sf-drawer-input text-sm" placeholder="Add new value..." disabled />
            <button type="button" className="px-3 py-1 text-sm sf-primary-button rounded disabled:opacity-50" disabled>
              Add
            </button>
          </div>
        </div>
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
