import { Tip } from '../../../components/common/Tip';

interface LaneStats {
  name: string;
  concurrency: number;
  active: number;
  queued: number;
  completed: number;
  failed: number;
  budget_rejected: number;
  paused: boolean;
}

interface WorkerPanelProps {
  collapsed: boolean;
  onToggle: () => void;
  laneSnapshot: Record<string, LaneStats> | null | undefined;
  budgetSnapshot: {
    urls: number;
    queries: number;
    llm_calls: number;
    high_tier_calls: number;
    cost_usd: number;
    elapsed_ms: number;
    high_tier_utilization_pct: number;
    budgets: Record<string, number>;
  } | null | undefined;
}

const LANE_LABELS: Record<string, string> = {
  search: 'Search',
  fetch: 'Fetch',
  parse: 'Parse',
  llm: 'LLM',
};

function laneBarColor(name: string): string {
  if (name === 'search') return 'var(--sf-state-info-fg)';
  if (name === 'fetch') return 'var(--sf-state-success-fg)';
  if (name === 'parse') return 'var(--sf-state-warning-fg)';
  if (name === 'llm') return 'rgb(var(--sf-color-accent-rgb))';
  return 'rgb(var(--sf-color-text-muted-rgb))';
}

export function WorkerPanel({
  collapsed,
  onToggle,
  laneSnapshot,
  budgetSnapshot,
}: WorkerPanelProps) {
  const lanes = laneSnapshot ? Object.values(laneSnapshot) : [];
  const totalCompleted = lanes.reduce((s, l) => s + l.completed, 0);
  const totalActive = lanes.reduce((s, l) => s + l.active, 0);

  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 58 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center text-sm font-semibold sf-text-primary">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 mr-1 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span>Worker Lanes</span>
          <Tip text="Per-lane worker queues with independent concurrency, budget enforcement, and pause/resume controls." />
        </div>
        <div className="ml-auto flex items-center gap-2 sf-text-caption sf-text-muted">
          {totalActive} active | {totalCompleted} completed
        </div>
      </div>
      {!collapsed && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {lanes.map((lane) => (
              <div
                key={lane.name}
                className="sf-surface-elevated p-2 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="sf-text-caption font-semibold sf-text-primary">
                    {LANE_LABELS[lane.name] || lane.name}
                  </span>
                  {lane.paused && (
                    <span className="sf-text-caption px-1 py-0.5 rounded sf-chip-warning font-medium">
                      PAUSED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-1 h-2 rounded sf-surface-panel overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${lane.concurrency > 0 ? Math.round((lane.active / lane.concurrency) * 100) : 0}%`,
                        backgroundColor: laneBarColor(lane.name),
                      }}
                    />
                  </div>
                  <span className="sf-text-caption sf-text-muted">
                    {lane.active}/{lane.concurrency}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 sf-text-caption sf-text-muted">
                  <span>Q:{lane.queued}</span>
                  <span>Done:{lane.completed}</span>
                  <span>Fail:{lane.failed}</span>
                  {lane.budget_rejected > 0 && (
                    <span className="sf-status-text-danger">Budget:{lane.budget_rejected}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {budgetSnapshot && (
            <div className="sf-surface-elevated p-2">
              <div className="sf-text-caption font-semibold sf-text-primary mb-1">Budget</div>
              <div className="flex flex-wrap gap-3 sf-text-caption sf-text-muted">
                <span>URLs: {budgetSnapshot.urls}/{budgetSnapshot.budgets?.max_urls_per_product ?? '-'}</span>
                <span>Queries: {budgetSnapshot.queries}/{budgetSnapshot.budgets?.max_queries_per_product ?? '-'}</span>
                <span>LLM: {budgetSnapshot.llm_calls}/{budgetSnapshot.budgets?.max_llm_calls_per_product ?? '-'}</span>
                <span>Cost: ${budgetSnapshot.cost_usd.toFixed(3)}/{budgetSnapshot.budgets?.max_cost_per_product_usd ?? '-'}</span>
                <span>HT: {budgetSnapshot.high_tier_utilization_pct}%</span>
                <span>Elapsed: {Math.round(budgetSnapshot.elapsed_ms / 1000)}s</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
