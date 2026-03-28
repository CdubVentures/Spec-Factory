import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { RuntimeOpsSummaryResponse, RuntimeOpsBlocker } from '../../types.ts';
import { METRIC_TIPS } from '../../helpers.ts';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { HeroStat } from '../../components/HeroStat.tsx';
import { PipelineFlowStrip } from './PipelineFlowStrip.tsx';

interface ThroughputPoint {
  ts: string;
  docs: number;
  fields: number;
}

interface OverviewTabProps {
  summary: RuntimeOpsSummaryResponse | undefined;
  throughputHistory: ThroughputPoint[];
  runId: string;
  isRunning: boolean;
  onNavigateToWorkers?: (pool: string) => void;
}

// WHY: Status → chip class mapping. Centralised here since it's OverviewTab-only.
const STATUS_CHIP: Record<string, string> = {
  running: 'sf-chip-success',
  completed: 'sf-chip-info',
  failed: 'sf-chip-danger',
  starting: 'sf-chip-info',
};

function StatusChip({ status }: { status: string }) {
  const cls = STATUS_CHIP[status] ?? 'sf-chip-neutral';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {status === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {status}
    </span>
  );
}

function errorRateColor(rate: number): string {
  if (rate <= 0.05) return 'text-[var(--sf-token-state-success-fg)]';
  if (rate <= 0.15) return 'text-[var(--sf-token-state-warning-fg)]';
  return 'text-[var(--sf-token-state-error-fg)]';
}

function BlockerRow({ blocker, maxErrors }: { blocker: RuntimeOpsBlocker; maxErrors: number }) {
  const pct = maxErrors > 0 ? Math.round((blocker.error_count / maxErrors) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex-1 font-mono sf-text-caption sf-text-primary truncate" title={blocker.host}>
        {blocker.host}
      </span>
      <div className="w-24 shrink-0">
        <div className="h-1.5 sf-meter-track rounded-full">
          <div className="h-full rounded-full sf-meter-fill-danger transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="sf-text-nano font-mono sf-status-text-danger w-8 text-right shrink-0">
        {blocker.error_count}
      </span>
    </div>
  );
}

export function OverviewTab({ summary, throughputHistory, runId, isRunning, onNavigateToWorkers }: OverviewTabProps) {
  const scrollRef = usePersistedScroll('scroll:overview');
  const s = summary ?? {
    status: 'unknown', round: 0, total_fetches: 0, total_parses: 0,
    total_llm_calls: 0, error_rate: 0, docs_per_min: 0, fields_per_min: 0, top_blockers: [],
  };

  const errorPct = `${Math.round(s.error_rate * 100)}%`;
  const maxBlockerErrors = s.top_blockers.length > 0 ? s.top_blockers[0].error_count : 0;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">

      {/* ── Hero KPIs ────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-6">
        <HeroStat
          value={s.fields_per_min.toFixed(1)}
          label="Fields / min"
          colorClass="text-[var(--sf-token-accent)]"
        />
        <HeroStat
          value={s.docs_per_min.toFixed(1)}
          label="Docs / min"
          colorClass="text-[var(--sf-token-state-success-fg)]"
        />
        <HeroStat
          value={errorPct}
          label="Error Rate"
          colorClass={errorRateColor(s.error_rate)}
        />
      </div>

      {/* ── Pipeline Flow ────────────────────────────────── */}
      {runId && (
        <PipelineFlowStrip
          runId={runId}
          isRunning={isRunning}
          onStageClick={onNavigateToWorkers}
        />
      )}

      {/* ── Activity Stats ───────────────────────────────── */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5 sf-text-caption sf-text-muted">
          Fetches <span className="font-mono font-semibold sf-text-primary">{s.total_fetches}</span>
        </div>
        <div className="flex items-center gap-1.5 sf-text-caption sf-text-muted">
          Parses <span className="font-mono font-semibold sf-text-primary">{s.total_parses}</span>
        </div>
        <div className="flex items-center gap-1.5 sf-text-caption sf-text-muted">
          LLM Calls <span className="font-mono font-semibold sf-text-primary">{s.total_llm_calls}</span>
        </div>
        {s.round > 0 && (
          <div className="flex items-center gap-1.5 sf-text-caption sf-text-muted">
            Round <span className="font-mono font-semibold sf-text-primary">{s.round}</span>
          </div>
        )}
        <StatusChip status={s.status} />
      </div>

      {/* ── Throughput Trend ──────────────────────────────── */}
      {throughputHistory.length > 1 && (
        <div className="rounded-lg sf-surface-card p-3">
          <div className="sf-text-caption sf-text-muted mb-2">
            Throughput Trend
            <Tip text="Live docs/min and fields/min over time. Shows whether the run is accelerating or stalling." />
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={throughputHistory}>
              <XAxis dataKey="ts" tick={false} />
              <YAxis tick={{ fontSize: 10 }} width={30} />
              <RechartsTooltip
                labelFormatter={() => ''}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
              <Area
                type="monotone"
                dataKey="docs"
                stroke="var(--sf-token-state-success-fg)"
                fill="var(--sf-token-state-success-bg)"
                name="Docs/min"
              />
              <Area
                type="monotone"
                dataKey="fields"
                stroke="var(--sf-token-accent)"
                fill="var(--sf-token-accent-bg, rgba(59,130,246,0.15))"
                name="Fields/min"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Top Blockers ─────────────────────────────────── */}
      {s.top_blockers.length > 0 && (
        <div>
          <h3 className="sf-text-caption font-semibold sf-text-subtle uppercase tracking-wide mb-2">
            Top Blockers
            <Tip text={METRIC_TIPS.top_blockers} />
          </h3>
          <div className="rounded-lg sf-surface-card px-3 py-2 divide-y sf-border-soft">
            {s.top_blockers.map((b) => (
              <BlockerRow key={b.host} blocker={b} maxErrors={maxBlockerErrors} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
