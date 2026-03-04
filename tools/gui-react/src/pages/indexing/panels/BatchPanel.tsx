import { Tip } from '../../../components/common/Tip';

interface BatchProduct {
  productId: string;
  status: string;
  retries: number;
  error: string | null;
}

interface BatchSnapshot {
  batchId: string;
  category: string;
  status: string;
  total: number;
  pending: number;
  running: number;
  done: number;
  failed: number;
  skipped: number;
  createdAt: string;
  updatedAt: string;
}

interface BatchDetail {
  batchId: string;
  category: string;
  status: string;
  products: BatchProduct[];
  createdAt: string;
  updatedAt: string;
}

interface BatchPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  batches: BatchSnapshot[];
  activeBatch: BatchDetail | null | undefined;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'sf-chip-neutral',
  running: 'sf-chip-info',
  paused: 'sf-chip-warning',
  completed: 'sf-chip-success',
  cancelled: 'sf-chip-danger',
  done: 'sf-chip-success',
  failed: 'sf-chip-danger',
  skipped: 'sf-chip-warning',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 sf-text-caption font-medium ${STATUS_COLORS[status] || STATUS_COLORS.pending}`}>
      {status}
    </span>
  );
}

export function BatchPanel({
  collapsed,
  onToggle,
  batches,
  activeBatch,
}: BatchPanelProps) {
  const totalProducts = batches.reduce((s, b) => s + b.total, 0);
  const doneProducts = batches.reduce((s, b) => s + b.done, 0);

  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 60 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Batch Automation</span>
          <Tip text="Multi-product batch runs with state machine, priority ordering, and retry policy. Learning from earlier products benefits later ones." />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs sf-text-muted">
          {batches.length} batches | {doneProducts}/{totalProducts} products
        </div>
      </div>
      {!collapsed && (
        <div className="space-y-3">
          {batches.length === 0 && (
            <div className="text-xs sf-text-muted italic py-4 text-center">
              No batches created yet.
            </div>
          )}
          {batches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs sf-table-shell">
                <thead>
                  <tr className="sf-table-head border-b sf-border-soft">
                    <th className="sf-table-head-cell">Batch</th>
                    <th className="sf-table-head-cell">Category</th>
                    <th className="sf-table-head-cell">Status</th>
                    <th className="sf-table-head-cell">Progress</th>
                    <th className="sf-table-head-cell">Pending</th>
                    <th className="sf-table-head-cell">Done</th>
                    <th className="sf-table-head-cell">Failed</th>
                    <th className="sf-table-head-cell">Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.batchId} className="sf-table-row border-b sf-border-soft">
                      <td className="py-1 pr-3 font-mono sf-text-primary">{b.batchId}</td>
                      <td className="py-1 pr-3 sf-text-muted">{b.category}</td>
                      <td className="py-1 pr-3"><StatusBadge status={b.status} /></td>
                      <td className="py-1 pr-3">
                        <div className="flex items-center gap-1">
                          <div
                            className="w-16 h-2 overflow-hidden"
                            style={{
                              borderRadius: 'var(--sf-radius-sm)',
                              background: 'rgb(var(--sf-color-border-default-rgb) / 0.7)',
                            }}
                          >
                            <div
                              className="h-full"
                              style={{
                                width: `${b.total > 0 ? Math.round((b.done / b.total) * 100) : 0}%`,
                                borderRadius: 'var(--sf-radius-sm)',
                                background: 'var(--sf-state-success-fg)',
                              }}
                            />
                          </div>
                          <span className="sf-text-muted">{b.done}/{b.total}</span>
                        </div>
                      </td>
                      <td className="py-1 pr-3 sf-text-muted">{b.pending}</td>
                      <td className="py-1 pr-3 sf-status-text-success">{b.done}</td>
                      <td className="py-1 pr-3 sf-status-text-danger">{b.failed}</td>
                      <td className="py-1 pr-3 sf-status-text-warning">{b.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {activeBatch && activeBatch.products.length > 0 && (
            <div>
              <div className="text-xs font-semibold sf-text-primary mb-1">
                Active: {activeBatch.batchId} - {activeBatch.category}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs sf-table-shell">
                  <thead>
                    <tr className="sf-table-head border-b sf-border-soft">
                      <th className="sf-table-head-cell">Product</th>
                      <th className="sf-table-head-cell">Status</th>
                      <th className="sf-table-head-cell">Retries</th>
                      <th className="sf-table-head-cell">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeBatch.products.map((p) => (
                      <tr key={p.productId} className="sf-table-row border-b sf-border-soft">
                        <td className="py-1 pr-3 font-mono sf-text-primary">{p.productId}</td>
                        <td className="py-1 pr-3"><StatusBadge status={p.status} /></td>
                        <td className="py-1 pr-3 sf-text-muted">{p.retries}</td>
                        <td className="py-1 pr-3 sf-status-text-danger max-w-[200px] truncate" title={p.error || ''}>
                          {p.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
