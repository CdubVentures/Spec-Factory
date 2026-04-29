import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

interface StorageProductColumn {
  readonly id: string;
}

const STORAGE_KPI_CARDS = [
  { label: 'Total Runs', accentClass: 'sf-meter-fill' },
  { label: 'Total Size', accentClass: 'sf-meter-fill-success' },
  { label: 'Products', accentClass: 'sf-meter-fill-info' },
  { label: 'Avg Run Size', accentClass: 'sf-meter-fill-warning' },
] as const;

const STORAGE_PRODUCT_COLUMNS: readonly StorageProductColumn[] = [
  { id: 'expand' },
  { id: 'product' },
  { id: 'runs' },
  { id: 'size' },
  { id: 'actions' },
];

const STORAGE_PRODUCT_ROWS = Array.from({ length: 8 }, (_value, index) => `row-${index}`);
const BREAKDOWN_ITEMS = [
  { id: 'html', label: 'html', dot: 'sf-bg-accent' },
  { id: 'screenshots', label: 'screenshots', dot: 'sf-bg-success' },
  { id: 'video', label: 'video', dot: 'sf-bg-info' },
] as const;
const STATUS_ROWS = [
  { id: 'completed', label: 'completed' },
  { id: 'failed', label: 'failed' },
  { id: 'running', label: 'running' },
] as const;

function KpiSkeleton({ label, accentClass }: { readonly label: string; readonly accentClass: string }) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden" data-region="storage-overview-loading-kpi">
      <div className={`h-[3px] ${accentClass}`} />
      <div className="px-4 pt-3.5 pb-3">
        <div className="text-2xl font-extrabold leading-none tracking-tight sf-text-primary">
          <SkeletonBlock className="sf-skel-text-lg" />
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          {label}
        </div>
      </div>
    </div>
  );
}

function BreakdownSkeleton() {
  return (
    <div className="sf-surface-card rounded-lg p-4 flex flex-col gap-3" data-region="storage-overview-loading-breakdown">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle">
        Artifact Breakdown
      </h3>
      <div className="flex flex-col items-center gap-2.5">
        <span
          className="sf-shimmer block w-[110px] h-[110px] rounded-full"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1.5 w-full">
          {BREAKDOWN_ITEMS.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 text-[10px]">
              <span className={`w-2 h-2 rounded-sm shrink-0 ${item.dot}`} />
              <span className="sf-text-muted truncate capitalize">{item.label}</span>
              <span className="ml-auto">
                <SkeletonBlock className="sf-skel-bar-label" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="sf-surface-card rounded-lg p-4 flex flex-col gap-3" data-region="storage-overview-loading-status">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle">
        Run Status
      </h3>
      <div className="space-y-2">
        {STATUS_ROWS.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="text-[10px] sf-text-muted w-[64px] shrink-0 capitalize">{row.label}</span>
            <span className="sf-shimmer flex-1 h-1.5 rounded-full" aria-hidden="true" />
            <span className="w-[28px] text-right shrink-0">
              <SkeletonBlock className="sf-skel-caption" />
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 text-[10px] sf-text-muted mt-auto pt-2 border-t sf-border-soft">
        <span className="flex items-center gap-1">Oldest: <SkeletonBlock className="sf-skel-caption" /></span>
        <span className="flex items-center gap-1">Newest: <SkeletonBlock className="sf-skel-caption" /></span>
      </div>
    </div>
  );
}

export function StorageOverviewSkeleton() {
  return (
    <div className="space-y-3" data-testid="storage-overview-loading-skeleton" aria-busy="true">
      <h2 className="text-lg font-bold sf-text-primary">Storage Overview</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STORAGE_KPI_CARDS.map((card) => (
          <KpiSkeleton key={card.label} label={card.label} accentClass={card.accentClass} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BreakdownSkeleton />
        <StatusSkeleton />
      </div>
    </div>
  );
}

function ProductCellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'expand') {
    return <span className="sf-shimmer inline-block h-4 w-4 rounded-sm" aria-hidden="true" />;
  }
  if (columnId === 'product') {
    return <SkeletonBlock className="sf-skel-bar" />;
  }
  if (columnId === 'runs' || columnId === 'size') {
    return (
      <span className="inline-flex justify-end w-full">
        <SkeletonBlock className="sf-skel-bar-label" />
      </span>
    );
  }
  if (columnId === 'actions') {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
        <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
      </div>
    );
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

export function StorageProductTableSkeleton() {
  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="storage-product-table-loading-skeleton" aria-busy="true">
      <div className="flex items-center gap-3 mb-2">
        <input
          type="text"
          placeholder="Search products..."
          disabled
          className="sf-shimmer sf-input sf-primitive-input sf-table-search-input w-full max-w-xs"
          data-region="storage-product-loading-search"
        />
        <select
          disabled
          className="sf-shimmer sf-input text-xs rounded px-3 py-1.5"
          data-region="storage-product-loading-brand-filter"
        >
          <option>All Brands</option>
        </select>
      </div>
      <div
        className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-280px)]"
        data-region="storage-product-loading-table"
      >
        <table className="min-w-full text-sm table-fixed" aria-hidden="true">
          <thead className="sf-table-head sticky top-0">
            <tr>
              {STORAGE_PRODUCT_COLUMNS.map((column) => (
                <th
                  key={column.id}
                  className={`sf-table-head-cell ${column.id === 'runs' || column.id === 'size' ? 'text-right cursor-pointer select-none' : column.id === 'product' ? 'cursor-pointer select-none' : ''}`}
                  data-skeleton-column={column.id}
                >
                  {column.id === 'actions' || column.id === 'expand' ? null : <SkeletonBlock className="sf-skel-bar-label" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-sf-border-default">
            {STORAGE_PRODUCT_ROWS.map((row) => (
              <tr key={row} className="sf-table-row sf-row-hoverable cursor-pointer" data-skeleton-row={row}>
                {STORAGE_PRODUCT_COLUMNS.map((column) => (
                  <td
                    key={`${row}-${column.id}`}
                    className={`${column.id === 'expand' ? 'px-2 py-2 text-center' : column.id === 'runs' || column.id === 'size' || column.id === 'actions' ? 'px-4 py-2 text-right' : 'px-2 py-2 overflow-hidden'}`}
                    data-skeleton-cell={column.id}
                  >
                    <ProductCellSkeleton columnId={column.id} />
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
