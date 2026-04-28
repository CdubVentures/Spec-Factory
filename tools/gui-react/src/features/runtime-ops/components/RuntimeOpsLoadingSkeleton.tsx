import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const KPI_CARDS = ['fields', 'docs', 'fetches', 'llm', 'errors', 'cost'] as const;
const FLOW_STEPS = ['search', 'fetch', 'parse', 'extract', 'review'] as const;
const LOWER_CARDS = ['blockers', 'crawl'] as const;

function KpiCardSkeleton({ card }: { readonly card: string }) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden" data-region="runtime-ops-loading-kpi-card" data-skeleton-card={card}>
      <div className="h-[3px] sf-meter-fill" />
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-end justify-between gap-2">
          <div className="text-2xl font-extrabold leading-none tracking-tight sf-text-primary">
            <SkeletonBlock className="sf-skel-caption" />
          </div>
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          <SkeletonBlock className="sf-skel-caption" />
        </div>
      </div>
    </div>
  );
}

function PipelineFlowSkeleton() {
  return (
    <div className="rounded-lg sf-surface-card p-3" data-region="runtime-ops-loading-flow">
      <div className="sf-text-caption sf-text-muted mb-2">Pipeline Flow</div>
      <div className="flex items-center justify-between gap-2">
        {FLOW_STEPS.map((step, index) => (
          <div key={step} className="flex items-center gap-2 flex-1" data-region="runtime-ops-loading-flow-step">
            {index > 0 && (
              <div className="flex items-center">
                <div className="w-6 h-px sf-meter-track rounded-full" />
              </div>
            )}
            <button type="button" className="flex-1 rounded-lg sf-surface-elevated p-2 text-center sf-row-hoverable transition-colors" disabled>
              <div className="text-xs font-medium px-2 py-0.5 rounded inline-block mb-1 sf-chip-neutral">
                <SkeletonBlock className="sf-skel-caption" />
              </div>
              <div className="text-xl font-bold sf-text-subtle">
                <SkeletonBlock className="sf-skel-caption" />
              </div>
              <div className="flex justify-center gap-2 sf-text-caption sf-text-muted mt-0.5">
                <span><SkeletonBlock className="sf-skel-caption" /></span>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThroughputSkeleton() {
  return (
    <div className="lg:col-span-2 sf-surface-card rounded-lg p-4" data-region="runtime-ops-loading-throughput">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
        Throughput Trend
      </div>
      <div className="h-[180px] flex items-center justify-center sf-text-subtle text-xs">
        <SkeletonBlock className="sf-skel-bar" />
      </div>
    </div>
  );
}

function CostCardSkeleton() {
  return (
    <div className="sf-surface-card rounded-lg p-4" data-region="runtime-ops-loading-cost">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
        LLM Cost
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
      </div>
    </div>
  );
}

function LowerCardSkeleton({ card }: { readonly card: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4" data-region="runtime-ops-loading-lower-card" data-skeleton-card={card}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
        <SkeletonBlock className="sf-skel-caption" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
        <SkeletonBlock className="sf-skel-bar" />
      </div>
    </div>
  );
}

export function RuntimeOpsLoadingSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="runtime-ops-loading-skeleton" data-region="runtime-ops-loading-overview" aria-busy="true">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold sf-chip-neutral">
          <SkeletonBlock className="sf-skel-caption" />
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map((card) => (
          <KpiCardSkeleton key={card} card={card} />
        ))}
      </div>

      <PipelineFlowSkeleton />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ThroughputSkeleton />
        <CostCardSkeleton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {LOWER_CARDS.map((card) => (
          <LowerCardSkeleton key={card} card={card} />
        ))}
      </div>

      <span className="sr-only">Loading runtime operations</span>
    </div>
  );
}
