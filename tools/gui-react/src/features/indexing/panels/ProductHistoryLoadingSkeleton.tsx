import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const HISTORY_KPI_CARDS = ['runs', 'cost', 'success', 'duration', 'queries', 'hosts'] as const;
const HISTORY_RUNS = ['current', 'previous', 'older', 'oldest'] as const;
const HISTORY_ANALYSIS_CARDS = ['funnel', 'domains', 'queries'] as const;

function KpiCardSkeleton({ card }: { readonly card: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1"
      data-region="product-history-loading-kpi-card"
      data-skeleton-card={card}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[32px] font-bold leading-none tracking-tight">
            <SkeletonBlock className="sf-skel-title" />
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
            <SkeletonBlock className="sf-skel-caption" />
          </div>
        </div>
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <span className="inline-flex items-center self-start gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 sf-text-muted">
        <SkeletonBlock className="sf-skel-caption" />
      </span>
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
        <KpiCardSkeleton key={card} card={card} />
      ))}
    </div>
  );
}

function RunPillSkeleton({ run }: { readonly run: string }) {
  return (
    <button
      type="button"
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg sf-text-label whitespace-nowrap transition-all sf-surface-elevated border sf-border-soft"
      data-region="product-history-loading-run-pill"
      data-skeleton-run={run}
      disabled
    >
      <span className="h-2.5 w-2.5 rounded-full sf-bg-surface-soft-strong" />
      <SkeletonBlock className="sf-skel-bar" />
      <SkeletonBlock className="sf-skel-caption" />
      <SkeletonBlock className="sf-skel-caption" />
    </button>
  );
}

function AnalysisCardSkeleton({ card }: { readonly card: string }) {
  return (
    <div
      className="sf-surface-elevated rounded-lg p-4 text-center"
      data-region="product-history-loading-analysis-card"
      data-skeleton-card={card}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-3">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="h-[140px] flex items-center justify-center">
        <SkeletonBlock className="sf-skel-bar" />
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
          <AnalysisCardSkeleton key={card} card={card} />
        ))}
      </div>
    </div>
  );
}
