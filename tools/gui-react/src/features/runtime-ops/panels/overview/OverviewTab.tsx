import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ThroughputAreaChart } from './ThroughputAreaChart.tsx';
import { api } from '../../../../api/client.ts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { RuntimeOpsSummaryResponse, RuntimeOpsMetricsRailData, LlmWorkerResponse } from '../../types.ts';
import { METRIC_TIPS, getRefetchInterval } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { Sparkline } from '../../components/Sparkline.tsx';
import { fmtCost } from '../workers/llmDashboardHelpers.ts';
import { PipelineFlowStrip } from './PipelineFlowStrip.tsx';
import { TopBlockersCard } from './TopBlockersCard.tsx';
import { LlmCostSummaryCard } from './LlmCostSummaryCard.tsx';
import { CrawlResponseCard } from './CrawlResponseCard.tsx';

/* ── Types ────────────────────────────────────────────────────── */

interface ThroughputPoint {
  ts: string;
  docs: number;
  fields: number;
}

interface OverviewTabProps {
  summary: RuntimeOpsSummaryResponse | undefined;
  metrics: RuntimeOpsMetricsRailData | undefined;
  throughputHistory: ThroughputPoint[];
  runId: string;
  isRunning: boolean;
  onNavigateToWorkers?: (pool: string) => void;
}

/* ── Status Chip ──────────────────────────────────────────────── */

const STATUS_CHIP: Record<string, string> = {
  running: 'sf-chip-success',
  completed: 'sf-chip-info',
  failed: 'sf-chip-danger',
  starting: 'sf-chip-info',
};

function StatusChip({ status }: { status: string }) {
  const cls = STATUS_CHIP[status] ?? 'sf-chip-neutral';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${cls}`}>
      {status === 'running' && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      )}
      {status}
    </span>
  );
}

/* ── KPI Card ─────────────────────────────────────────────────── */

interface KpiCardProps {
  value: string | number;
  label: string;
  accentClass?: string;
  colorClass?: string;
  tip?: string;
  sparklineValues?: number[];
}

function KpiCard({ value, label, accentClass = 'sf-meter-fill', colorClass, tip, sparklineValues }: KpiCardProps) {
  return (
    <div className="sf-surface-card rounded-lg overflow-hidden">
      <div className={`h-[3px] ${accentClass}`} />
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-end justify-between gap-2">
          <div className={`text-2xl font-extrabold leading-none tracking-tight ${colorClass ?? 'sf-text-primary'}`}>
            {value}
          </div>
          {sparklineValues && sparklineValues.length >= 2 && (
            <Sparkline values={sparklineValues} width={64} height={24} />
          )}
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
          {label}
          {tip && <Tip text={tip} />}
        </div>
      </div>
    </div>
  );
}

/* ── Error rate threshold color ───────────────────────────────── */

function errorRateColor(rate: number): string {
  if (rate <= 0.05) return 'text-[var(--sf-token-state-success-fg)]';
  if (rate <= 0.15) return 'text-[var(--sf-token-state-warning-fg)]';
  return 'text-[var(--sf-token-state-error-fg)]';
}

/* ── Main Component ───────────────────────────────────────────── */

export function OverviewTab({
  summary,
  metrics,
  throughputHistory,
  runId,
  isRunning,
  onNavigateToWorkers,
}: OverviewTabProps) {
  const scrollRef = usePersistedScroll('scroll:overview');

  // WHY: LLM cost data — shared queryKey with LlmWorkerPanel for auto-deduplication.
  const { data: llmDashboard } = useQuery({
    queryKey: ['runtime-ops', runId, 'llm-dashboard'],
    queryFn: () => api.get<LlmWorkerResponse>(`/indexlab/run/${runId}/runtime/llm-dashboard`),
    enabled: Boolean(runId),
    refetchInterval: getRefetchInterval(isRunning, false, 5000, 15000),
  });

  const s = summary ?? {
    status: 'unknown', round: 0, total_fetches: 0, total_parses: 0,
    total_llm_calls: 0, error_rate: 0, docs_per_min: 0, fields_per_min: 0, top_blockers: [],
  };

  const errorPct = `${Math.round(s.error_rate * 100)}%`;
  const fieldsSparkline = useMemo(() => throughputHistory.map((p) => p.fields), [throughputHistory]);
  const docsSparkline = useMemo(() => throughputHistory.map((p) => p.docs), [throughputHistory]);
  const llmCostLabel = llmDashboard?.summary ? fmtCost(llmDashboard.summary.total_cost_usd) : '-';

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">

      {/* ── Row 1: Status + KPI Cards ──────────────────── */}
      <div className="flex items-center gap-4">
        <StatusChip status={s.status} />
        {s.round > 0 && (
          <span className="text-xs sf-text-muted">
            Round <span className="font-mono font-semibold sf-text-primary">{s.round}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          value={s.fields_per_min.toFixed(1)}
          label="Fields / min"
          accentClass="sf-meter-fill"
          tip={METRIC_TIPS.fields_per_min}
          sparklineValues={fieldsSparkline}
        />
        <KpiCard
          value={s.docs_per_min.toFixed(1)}
          label="Docs / min"
          accentClass="sf-meter-fill-success"
          tip={METRIC_TIPS.docs_per_min}
          sparklineValues={docsSparkline}
        />
        <KpiCard
          value={String(s.total_fetches)}
          label="Fetches"
          accentClass="sf-meter-fill-success"
          tip={METRIC_TIPS.fetches}
        />
        <KpiCard
          value={String(s.total_llm_calls)}
          label="LLM Calls"
          accentClass="sf-meter-fill-warning"
          tip={METRIC_TIPS.llm_calls}
        />
        <KpiCard
          value={errorPct}
          label="Error Rate"
          accentClass="sf-meter-fill-danger"
          colorClass={errorRateColor(s.error_rate)}
          tip={METRIC_TIPS.error_rate}
        />
        <KpiCard
          value={llmCostLabel}
          label="LLM Cost"
          accentClass="sf-meter-fill-warning"
          tip="Total LLM spend for this run across all models and call types."
        />
      </div>

      {/* ── Row 2: Pipeline Flow ───────────────────────── */}
      {runId && (
        <PipelineFlowStrip runId={runId} isRunning={isRunning} onStageClick={onNavigateToWorkers} />
      )}

      {/* ── Row 3: Throughput + LLM Cost ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 sf-surface-card rounded-lg p-4">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle mb-3">
            Throughput Trend
            <Tip text="Live docs/min and fields/min over time. Shows whether the run is accelerating or stalling." />
          </div>
          {throughputHistory.length > 1 ? (
            <ThroughputAreaChart throughputHistory={throughputHistory} />
          ) : (
            <div className="h-[180px] flex items-center justify-center sf-text-subtle text-xs">
              Accumulating throughput data...
            </div>
          )}
        </div>

        <LlmCostSummaryCard summary={llmDashboard?.summary} />
      </div>

      {/* ── Row 4: Blockers + Crawl Response ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopBlockersCard blockers={s.top_blockers} />
        <CrawlResponseCard engine={metrics?.crawl_engine} />
      </div>
    </div>
  );
}
