import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import type { RuntimeOpsSummaryResponse, RuntimeOpsBlocker } from '../../types';
import { statusBadgeClass, METRIC_TIPS } from '../../helpers';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { PipelineFlowStrip } from './PipelineFlowStrip';

interface ThroughputPoint {
  ts: string;
  docs: number;
  fields: number;
}

interface OverviewTabProps {
  summary: RuntimeOpsSummaryResponse | undefined;
  selectedBlocker: RuntimeOpsBlocker | null;
  onSelectBlocker: (b: RuntimeOpsBlocker | null) => void;
  throughputHistory: ThroughputPoint[];
  runId: string;
  isRunning: boolean;
  onNavigateToWorkers?: (pool: string) => void;
}

function HealthCard({ label, value, sub, tip }: { label: string; value: string | number; sub?: string; tip?: string }) {
  return (
    <div className="rounded-lg sf-surface-card p-3">
      <div className="sf-text-caption sf-text-muted mb-1">{label}{tip && <Tip text={tip} />}</div>
      <div className="text-xl font-semibold sf-text-primary">{value}</div>
      {sub && <div className="sf-text-caption sf-text-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

export function OverviewTab({ summary, selectedBlocker, onSelectBlocker, throughputHistory, runId, isRunning, onNavigateToWorkers }: OverviewTabProps) {
  const s = summary ?? {
    status: 'unknown', total_fetches: 0, total_parses: 0,
    total_llm_calls: 0, error_rate: 0, docs_per_min: 0, fields_per_min: 0, top_blockers: [],
  };

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {runId && (
          <PipelineFlowStrip
            runId={runId}
            isRunning={isRunning}
            onStageClick={onNavigateToWorkers}
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <HealthCard label="Status" value={s.status} tip={METRIC_TIPS.status} />
          <HealthCard label="Fetches" value={s.total_fetches} tip={METRIC_TIPS.fetches} />
          <HealthCard label="Parses" value={s.total_parses} tip={METRIC_TIPS.parses} />
          <HealthCard label="LLM Calls" value={s.total_llm_calls} tip={METRIC_TIPS.llm_calls} />
          <HealthCard label="Error Rate" value={`${Math.round(s.error_rate * 100)}%`} tip={METRIC_TIPS.error_rate} />
          <HealthCard label="Docs/min" value={s.docs_per_min.toFixed(1)} tip={METRIC_TIPS.docs_per_min} />
          <HealthCard label="Fields/min" value={s.fields_per_min.toFixed(1)} tip={METRIC_TIPS.fields_per_min} />
        </div>

        {throughputHistory.length > 1 && (
          <div className="rounded-lg sf-surface-card p-3">
            <div className="sf-text-caption sf-text-muted mb-2">
              Throughput Trend<Tip text="Live docs/min and fields/min over time. Shows whether the run is accelerating or stalling." />
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={throughputHistory}>
                <XAxis dataKey="ts" tick={false} />
                <YAxis tick={{ fontSize: 10 }} width={30} />
                <RechartsTooltip labelFormatter={() => ''} />
                <Area type="monotone" dataKey="docs" stroke="#3b82f6" fill="#3b82f680" name="Docs/min" />
                <Area type="monotone" dataKey="fields" stroke="#10b981" fill="#10b98180" name="Fields/min" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {s.top_blockers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold sf-text-primary mb-2">
              Top Blockers<Tip text={METRIC_TIPS.top_blockers} />
            </h3>
            <div className="space-y-1">
              {s.top_blockers.map((b) => (
                <button
                  key={b.host}
                  type="button"
                  onClick={() => onSelectBlocker(selectedBlocker?.host === b.host ? null : b)}
                  className={`w-full text-left flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                    selectedBlocker?.host === b.host
                      ? 'sf-callout-danger'
                      : 'sf-row-hoverable border border-transparent'
                  }`}
                >
                  <span className="sf-text-primary font-mono sf-text-caption truncate">{b.host}</span>
                  <span className={`ml-2 shrink-0 text-xs px-2 py-0.5 rounded ${statusBadgeClass('failed')}`}>
                    {b.error_count} errors
                  </span>
                </button>
              ))}
            </div>
            <p className="sf-text-caption sf-text-muted mt-2 italic">
              These domains are producing the most errors. Consider checking if they require JavaScript rendering
              (switch to Playwright mode) or if they are rate-limiting requests (apply longer cooldowns).
            </p>
          </div>
        )}
      </div>

      {selectedBlocker && (
        <div className="w-80 shrink-0 border-l sf-border-default overflow-y-auto p-4">
          <h3 className="text-sm font-semibold sf-text-primary mb-2">
            Blocker Details
          </h3>
          <div className="space-y-2 sf-text-caption">
            <div>
              <span className="sf-text-muted">Host:</span>
              <span className="ml-2 font-mono sf-text-primary">{selectedBlocker.host}</span>
            </div>
            <div>
              <span className="sf-text-muted">Errors:</span>
              <span className="ml-2 font-mono sf-status-text-danger">{selectedBlocker.error_count}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
