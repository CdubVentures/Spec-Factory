import { SkeletonBlock } from '../../../shared/ui/feedback/SkeletonBlock.tsx';

const KPI_CARDS = [
  { id: 'fields', label: 'Fields / min', accent: 'sf-meter-fill' },
  { id: 'docs', label: 'Docs / min', accent: 'sf-meter-fill-success' },
  { id: 'fetches', label: 'Total Fetches', accent: 'sf-meter-fill-info' },
  { id: 'llm', label: 'LLM Calls', accent: 'sf-meter-fill-warning' },
  { id: 'errors', label: 'Error Rate', accent: 'sf-meter-fill-danger' },
  { id: 'cost', label: 'LLM Cost', accent: 'sf-meter-fill-confirm' },
] as const;
const FLOW_STEPS = [
  { id: 'search', label: 'Search' },
  { id: 'fetch', label: 'Fetch' },
  { id: 'parse', label: 'Parse' },
  { id: 'extract', label: 'Extract' },
  { id: 'review', label: 'Review' },
] as const;
const COST_ROWS = ['total', 'input', 'output'] as const;
const LOWER_CARDS = [
  { id: 'blockers', label: 'Top Blockers' },
  { id: 'crawl', label: 'Crawl Response' },
] as const;
const LOWER_ROWS = Array.from({ length: 4 }, (_value, index) => `lower-row-${index}`);

function StatusChipSkeleton() {
  return (
    <span
      className="sf-shimmer inline-flex h-7 w-[120px] rounded-md"
      data-region="runtime-ops-loading-status-chip"
      aria-hidden="true"
    />
  );
}

function KpiCardSkeleton({ card, label, accent }: { readonly card: string; readonly label: string; readonly accent: string }) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden" data-region="runtime-ops-loading-kpi-card" data-skeleton-card={card}>
      <div className={`h-[3px] ${accent}`} />
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-end justify-between gap-2">
          <div className="text-2xl font-extrabold leading-none tracking-tight">
            <SkeletonBlock className="sf-skel-text-lg" />
          </div>
          <span className="sf-shimmer inline-block h-6 w-16 rounded-sm" aria-hidden="true" />
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          {label}
        </div>
      </div>
    </div>
  );
}

function FlowStepSkeleton({ step, label, isLast }: { readonly step: string; readonly label: string; readonly isLast: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-1" data-region="runtime-ops-loading-flow-step" data-skeleton-step={step}>
      <button
        type="button"
        className="flex-1 rounded-lg sf-surface-elevated p-2.5 text-center sf-row-hoverable transition-colors"
        disabled
      >
        <div className="text-[11px] font-semibold mb-1.5 sf-text-muted uppercase tracking-wide">
          {label}
        </div>
        <div className="text-xl font-bold flex items-center justify-center">
          <SkeletonBlock className="sf-skel-text-lg" />
        </div>
        <div className="mt-1 flex justify-center">
          <SkeletonBlock className="sf-skel-caption" />
        </div>
      </button>
      {!isLast && <div className="w-4 h-px sf-meter-track rounded-full" />}
    </div>
  );
}

function PipelineFlowSkeleton() {
  return (
    <div className="rounded-lg sf-surface-card p-3" data-region="runtime-ops-loading-flow">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-2">
        Pipeline Flow
      </div>
      <div className="flex items-center justify-between gap-2">
        {FLOW_STEPS.map((step, index) => (
          <FlowStepSkeleton
            key={step.id}
            step={step.id}
            label={step.label}
            isLast={index === FLOW_STEPS.length - 1}
          />
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
      <div className="h-[180px]">
        <SkeletonBlock className="sf-skel-block" />
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
      <div className="text-2xl font-extrabold leading-none tracking-tight mb-3">
        <SkeletonBlock className="sf-skel-text-lg" />
      </div>
      <div className="space-y-2">
        {COST_ROWS.map((row) => (
          <div key={row} className="flex items-center justify-between gap-3" data-skeleton-cost-row={row}>
            <SkeletonBlock className="sf-skel-bar-label" />
            <SkeletonBlock className="sf-skel-caption" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LowerCardSkeleton({ card, label }: { readonly card: string; readonly label: string }) {
  return (
    <div className="sf-surface-card rounded-lg p-4" data-region="runtime-ops-loading-lower-card" data-skeleton-card={card}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
        {label}
      </div>
      <div className="space-y-2.5">
        {LOWER_ROWS.map((rowId) => (
          <div key={`${card}-${rowId}`} className="flex items-center gap-2" data-skeleton-row={`${card}-${rowId}`}>
            <span className="sf-shimmer inline-block h-4 w-4 rounded-full shrink-0" aria-hidden="true" />
            <span className="sf-shimmer block h-3.5 flex-1 rounded-sm" aria-hidden="true" />
            <span className="sf-shimmer inline-block h-3.5 w-12 rounded-sm shrink-0" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RuntimeOpsLoadingSkeleton() {
  return (
    <div
      className="flex-1 overflow-y-auto p-5 space-y-5"
      data-testid="runtime-ops-loading-skeleton"
      data-region="runtime-ops-loading-overview"
      aria-busy="true"
    >
      <span className="sr-only">Loading runtime operations</span>

      <div className="flex items-center gap-4">
        <StatusChipSkeleton />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_CARDS.map((card) => (
          <KpiCardSkeleton key={card.id} card={card.id} label={card.label} accent={card.accent} />
        ))}
      </div>

      <PipelineFlowSkeleton />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ThroughputSkeleton />
        <CostCardSkeleton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {LOWER_CARDS.map((card) => (
          <LowerCardSkeleton key={card.id} card={card.id} label={card.label} />
        ))}
      </div>
    </div>
  );
}
