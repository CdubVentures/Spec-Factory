import { SkeletonBlock } from '../../shared/ui/feedback/SkeletonBlock.tsx';

const APP_SHELL_METRICS = ['primary', 'secondary', 'tertiary', 'quaternary'] as const;
const APP_SHELL_COLUMNS = ['item', 'status', 'updated', 'owner', 'actions'] as const;
const APP_SHELL_ROWS = Array.from({ length: 8 }, (_value, index) => `row-${index}`);

function MetricCardSkeleton({ metric }: { readonly metric: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4 shadow-sm" data-region="app-shell-loading-metric-card" data-skeleton-card={metric}>
      <div className="sf-text-caption sf-status-text-muted uppercase tracking-wide">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="mt-2">
        <SkeletonBlock className="sf-skel-title" />
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
      <div className="sf-input sf-primitive-input flex-[0_1_360px] min-w-[220px] px-3 py-2">
        <SkeletonBlock className="sf-skel-bar" />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="sf-icon-button rounded px-3 py-1.5" disabled>
          <SkeletonBlock className="sf-skel-caption" />
        </button>
        <button type="button" className="sf-primary-button rounded px-3 py-1.5" disabled>
          <SkeletonBlock className="sf-skel-caption" />
        </button>
      </div>
    </div>
  );
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
                <SkeletonBlock className="sf-skel-bar" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sf-border-default">
          {APP_SHELL_ROWS.map((row) => (
            <tr key={row} className="sf-table-row" data-skeleton-row={row}>
              {APP_SHELL_COLUMNS.map((column) => (
                <td key={`${row}-${column}`} className="px-2 py-1.5" data-skeleton-cell={column}>
                  <SkeletonBlock className="sf-skel-bar" />
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
          <MetricCardSkeleton key={metric} metric={metric} />
        ))}
      </div>
      <ToolbarSkeleton />
      <TableSkeleton />
    </div>
  );
}
