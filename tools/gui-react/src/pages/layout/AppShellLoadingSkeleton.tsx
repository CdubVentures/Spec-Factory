import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';

const APP_SHELL_METRICS = [
  { id: 'primary', label: 'Total' },
  { id: 'secondary', label: 'Active' },
  { id: 'tertiary', label: 'Coverage' },
  { id: 'quaternary', label: 'Updated' },
] as const;
const APP_SHELL_COLUMNS = ['item', 'status', 'updated', 'owner', 'actions'] as const;
const APP_SHELL_ROWS = Array.from({ length: 8 }, (_value, index) => `row-${index}`);

function MetricCardSkeleton({ metric, label }: { readonly metric: string; readonly label: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm" data-region="app-shell-loading-metric-card" data-skeleton-card={metric}>
      <div className="sf-text-caption sf-status-text-muted uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2">
        <SkeletonBlock className="sf-skel-text-lg" />
      </div>
    </div>
  );
}

function ToolbarSkeleton() {
  return (
    <div
      className="sf-surface-elevated rounded-lg border sf-border-default px-3 py-2 flex items-center gap-3 flex-wrap"
      data-region="app-shell-loading-toolbar"
    >
      <div className="sf-input sf-primitive-input flex-[0_1_360px] min-w-[220px] h-9 sf-shimmer" aria-hidden="true" />
      <div className="ml-auto flex items-center gap-2">
        <span className="sf-shimmer inline-block sf-icon-button rounded h-9 w-24" aria-hidden="true" />
        <span className="sf-shimmer inline-block sf-primary-button rounded h-9 w-28" aria-hidden="true" />
      </div>
    </div>
  );
}

function CellSkeleton({ columnId }: { readonly columnId: string }) {
  if (columnId === 'item') {
    return (
      <span
        className="sf-shimmer block h-3.5 w-full rounded-sm"
        aria-hidden="true"
      />
    );
  }
  if (columnId === 'status') {
    return <span className="sf-shimmer inline-block h-5 w-14 rounded-md" aria-hidden="true" />;
  }
  if (columnId === 'updated') {
    return <SkeletonBlock className="sf-skel-bar-label" />;
  }
  if (columnId === 'owner') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="sf-shimmer inline-block h-5 w-5 rounded-full shrink-0" aria-hidden="true" />
        <SkeletonBlock className="sf-skel-bar-label" />
      </div>
    );
  }
  if (columnId === 'actions') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
        <span className="sf-shimmer inline-block h-7 w-7 rounded shrink-0" aria-hidden="true" />
      </div>
    );
  }
  return <SkeletonBlock className="sf-skel-bar" />;
}

function TableSkeleton() {
  return (
    <div
      className="sf-table-shell sf-primitive-table-shell overflow-auto max-h-[calc(100vh-340px)]"
      data-region="app-shell-loading-table"
    >
      <table className="min-w-full text-sm table-fixed" aria-hidden="true">
        <thead className="sf-table-head sticky top-0">
          <tr>
            {APP_SHELL_COLUMNS.map((column) => (
              <th key={column} className="sf-table-head-cell cursor-pointer select-none" data-skeleton-column={column}>
                <SkeletonBlock className="sf-skel-bar-label" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sf-border-default">
          {APP_SHELL_ROWS.map((row) => (
            <tr key={row} className="sf-table-row" data-skeleton-row={row}>
              {APP_SHELL_COLUMNS.map((column) => (
                <td key={`${row}-${column}`} className={column === 'actions' ? 'px-2 py-1.5 text-right' : 'px-2 py-1.5'} data-skeleton-cell={column}>
                  <CellSkeleton columnId={column} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AppShellLoadingSkeleton() {
  return (
    <div
      className="space-y-3 sf-text-primary"
      data-testid="app-shell-loading-skeleton"
      data-region="app-shell-loading-page"
      aria-busy="true"
    >
      <span className="sr-only">Loading application settings</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {APP_SHELL_METRICS.map((metric) => (
          <MetricCardSkeleton key={metric.id} metric={metric.id} label={metric.label} />
        ))}
      </div>
      <ToolbarSkeleton />
      <TableSkeleton />
    </div>
  );
}
