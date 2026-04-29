import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const HISTORY_KPI_CARDS = [
  { id: 'runs', label: 'Total Runs' },
  { id: 'cost', label: 'Total Cost' },
  { id: 'success', label: 'Crawl Success' },
  { id: 'duration', label: 'Avg Duration' },
  { id: 'queries', label: 'Total Queries' },
  { id: 'hosts', label: 'Unique Hosts' },
] as const;
const HISTORY_RUNS = ['current', 'previous', 'older', 'oldest'] as const;
const HISTORY_ANALYSIS_CARDS = [
  { id: 'funnel', label: 'Funnel' },
  { id: 'domains', label: 'Top Domains' },
  { id: 'queries', label: 'Top Queries' },
] as const;

function KpiCardSkeleton({ card, label }: { readonly card: string; readonly label: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1"
      data-region="product-history-loading-kpi-card"
      data-skeleton-card={card}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[32px] font-bold leading-none tracking-tight">
            <SkeletonBlock className="sf-skel-text-xl" />
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
            {label}
          </div>
        </div>
        <SkeletonBlock className="sf-skel-sparkline" />
      </div>
      <SkeletonBlock className="sf-skel-pill" />
    </div>
  );
}

export function ProductHistoryKpiLoadingSkeleton() {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
      data-testid="product-history-kpi-loading-skeleton"
      data-region="product-history-loading-kpi-grid"
      aria-busy="true"
    >
      {HISTORY_KPI_CARDS.map((card) => (
        <KpiCardSkeleton key={card.id} card={card.id} label={card.label} />
      ))}
    </div>
  );
}

function RunPillSkeleton({ run }: { readonly run: string }) {
  return (
    <span
      className="sf-shimmer flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap sf-surface-elevated border sf-border-soft min-w-[180px] h-[44px]"
      data-region="product-history-loading-run-pill"
      data-skeleton-run={run}
      aria-hidden="true"
    />
  );
}

function AnalysisCardSkeleton({ card, label }: { readonly card: string; readonly label: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-4 text-center"
      data-region="product-history-loading-analysis-card"
      data-skeleton-card={card}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-3">
        {label}
      </div>
      <div className="h-[140px] flex items-center justify-center">
        <SkeletonBlock className="sf-skel-block" />
      </div>
    </div>
  );
}

export function ProductHistoryPanelLoadingSkeleton() {
  return (
    <div
      className="px-6 pb-6 pt-4 space-y-5 flex-1 min-h-0 overflow-y-auto"
      data-testid="product-history-panel-loading-skeleton"
      data-region="product-history-loading-body"
      aria-busy="true"
    >
      <span className="sr-only">Loading run history</span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">
          Select Run
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {HISTORY_RUNS.map((run) => (
            <RunPillSkeleton key={run} run={run} />
          ))}
        </div>
      </div>
      <ProductHistoryKpiLoadingSkeleton />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {HISTORY_ANALYSIS_CARDS.map((card) => (
          <AnalysisCardSkeleton key={card.id} card={card.id} label={card.label} />
        ))}
      </div>
    </div>
  );
}
