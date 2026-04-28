import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

interface ReviewPageSkeletonProps {
  readonly drawerOpen: boolean;
}

const KPI_ROWS = Array.from({ length: 6 }, (_value, index) => `kpi-${index}`);
const PRODUCT_COLUMNS = Array.from({ length: 6 }, (_value, index) => `product-${index}`);
const FIELD_ROWS = Array.from({ length: 10 }, (_value, index) => `field-${index}`);
const DRAWER_SECTIONS = ['current', 'override', 'candidates', 'variants'] as const;

function KpiCardSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-3" data-region="review-loading-kpi-card" data-skeleton-row={row}>
      <div className="text-xs sf-status-text-muted uppercase tracking-wide">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="mt-2 text-lg font-semibold">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="sf-review-dashboard-strip rounded-lg p-4 space-y-3" data-region="review-loading-dashboard">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_ROWS.map((row) => (
          <KpiCardSkeleton key={row} row={row} />
        ))}
      </div>
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div className="sf-review-toolbar sf-review-brand-filter-bar flex items-center gap-1.5 py-1 px-1 rounded overflow-x-auto" data-region="review-loading-toolbar">
      <select className="shrink-0 w-auto px-2 py-0.5 rounded sf-select text-[10px]" disabled>
        <option>Sort: Brand</option>
      </select>
      <div className="sf-review-brand-filter-separator w-px h-4 shrink-0" />
      <div className="flex items-center gap-1.5">
        {['all', 'tracked', 'custom'].map((chip, index) => (
          <button
            key={chip}
            type="button"
            className={`px-2 py-0.5 rounded sf-text-label font-medium ${index === 0 ? 'sf-chip-info' : 'sf-icon-button'}`}
            disabled
          >
            <SkeletonBlock className="sf-skel-caption" />
          </button>
        ))}
      </div>
      {['confidence', 'coverage', 'run'].map((filter) => (
        <div key={filter} className="flex items-center gap-1.5 rounded sf-surface-elevated border sf-border-default px-1.5 py-0.5">
          <span className="sf-text-nano sf-text-muted uppercase">{filter}</span>
          <button type="button" className="px-2 py-0.5 rounded sf-chip-neutral sf-text-nano" disabled>
            <SkeletonBlock className="sf-skel-caption" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ProductHeaderSkeleton({ column }: { readonly column: string }) {
  return (
    <div
      className="sf-review-matrix-product-header px-1.5 py-1 text-center flex flex-col justify-center"
      data-region="review-loading-product-header"
      data-skeleton-column={column}
    >
      <SkeletonBlock className="sf-skel-caption" />
      <div className="mt-1 flex justify-center gap-1">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
    </div>
  );
}

function FieldRowSkeleton({ row }: { readonly row: string }) {
  return (
    <div className="flex w-full sf-review-matrix-row" data-region="review-loading-field-row" data-skeleton-row={row}>
      <div className="shrink-0 flex items-center gap-1 sf-review-matrix-field-cell px-2 sticky left-0 z-[5]">
        <span className="sf-text-micro sf-text-subtle uppercase w-14 truncate">
          <SkeletonBlock className="sf-skel-caption" />
        </span>
        <div className="sf-review-matrix-field-menu-root">
          <button type="button" className="sf-review-matrix-field-button" disabled>
            <span className="sf-review-matrix-field-label"><SkeletonBlock className="sf-skel-caption" /></span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-6 flex-1">
        {PRODUCT_COLUMNS.map((column) => (
          <div
            key={`${row}-${column}`}
            className="flex items-center sf-review-matrix-cell cursor-pointer"
            data-region="review-loading-cell"
            data-skeleton-column={column}
          >
            <div className="px-1 w-full">
              <SkeletonBlock className="sf-skel-bar" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="sf-table-shell rounded-lg overflow-hidden" data-region="review-loading-matrix">
      <div className="overflow-auto sf-grid-pannable h-[calc(100vh-340px)]">
        <div className="min-w-[1210px]">
          <div className="flex sf-table-head sticky top-0 z-20">
            <div className="shrink-0 sf-review-matrix-field-header px-2 py-1 sf-text-caption font-semibold uppercase flex items-center sticky left-0 z-30">
              Field
            </div>
            <div className="grid grid-cols-6 flex-1">
              {PRODUCT_COLUMNS.map((column) => (
                <ProductHeaderSkeleton key={column} column={column} />
              ))}
            </div>
          </div>
          <div>
            {FIELD_ROWS.map((row) => (
              <FieldRowSkeleton key={row} row={row} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <aside className="sf-surface-elevated rounded-lg border sf-border-default overflow-hidden" data-region="review-loading-drawer">
      <div className="px-3 py-2 border-b sf-border-default flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold"><SkeletonBlock className="sf-skel-caption" /></h3>
          <p className="text-xs sf-text-muted mt-1"><SkeletonBlock className="sf-skel-caption" /></p>
        </div>
        <button type="button" className="sf-icon-button px-2 py-1 text-xs" disabled>Close</button>
      </div>
      <div className="p-3 space-y-3">
        {DRAWER_SECTIONS.map((section) => (
          <div key={section} className="rounded border sf-border-default sf-surface-card p-3 space-y-2" data-region="review-loading-drawer-section">
            <SkeletonBlock className="sf-skel-caption" />
            <SkeletonBlock className="sf-skel-bar" />
            <SkeletonBlock className="sf-skel-bar" />
          </div>
        ))}
      </div>
    </aside>
  );
}

export function ReviewPageSkeleton({ drawerOpen }: ReviewPageSkeletonProps) {
  return (
    <div className="space-y-2" data-testid="review-page-loading-skeleton" data-region="review-loading-page" aria-busy="true">
      <DashboardSkeleton />
      <ToolbarSkeleton />
      <div className={`grid ${drawerOpen ? 'grid-cols-[1fr,420px]' : 'grid-cols-1'} gap-3`} data-region="review-loading-content-grid">
        <MatrixSkeleton />
        {drawerOpen && <DrawerSkeleton />}
      </div>
      <span className="sr-only">Loading review grid</span>
    </div>
  );
}
