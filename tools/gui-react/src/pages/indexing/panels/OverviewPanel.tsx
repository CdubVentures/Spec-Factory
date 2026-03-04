import { Tip } from '../../../components/common/Tip';
import { usePersistedToggle } from '../../../stores/collapseStore';
import {
  ActivityGauge,
  formatNumber,
  formatDateTime,
  formatDuration,
  llmPhaseLabel,
  llmPhaseBadgeClasses,
  panelStateChipClasses,
  prettyJsonText,
  isJsonText,
} from '../helpers';
import type { PanelStateToken } from '../types';

interface PendingLlmRow {
  key: string;
  reason: string;
  model: string;
  provider: string;
  routeRole: string;
  pending: number;
  firstStartedAtMs: number;
}

interface LlmTracePartial {
  purpose?: string | null;
  model?: string | null;
  ts?: string | null;
  response_preview?: string | null;
}

interface PipelineStep {
  label: string;
  state: PanelStateToken;
}

interface OverviewPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
  embedded?: boolean;
  category: string;
  processStateLabel: string;
  processStatus: { pid?: number; command?: string; exitCode?: number | null } | null | undefined;
  processRunning: boolean;
  selectedIndexLabRun: { started_at?: string } | null;
  selectedRunLiveDuration: string;
  runtimeActivity: { currentPerMin: number; peakPerMin: number };
  llmActivity: { currentPerMin: number; peakPerMin: number };
  pendingLlmTotal: number;
  pendingLlmPeak: number;
  pendingLlmRows: PendingLlmRow[];
  activityNowMs: number;
  activePendingLlm: PendingLlmRow | null;
  pendingPromptPretty: string;
  pendingPromptPhase: string;
  pendingPromptIsJson: boolean;
  lastReceivedResponseTrace: LlmTracePartial | null;
  lastReceivedResponseEvent: LlmTracePartial | null;
  lastReceivedResponsePretty: string;
  lastReceivedPhase: string;
  lastReceivedResponseIsJson: boolean;
  pipelineSteps: PipelineStep[];
}

export function OverviewPanel({
  collapsed = false,
  onToggle,
  embedded = false,
  category,
  processStateLabel,
  processStatus,
  processRunning,
  selectedIndexLabRun,
  selectedRunLiveDuration,
  runtimeActivity,
  llmActivity,
  pendingLlmTotal,
  pendingLlmPeak,
  pendingLlmRows,
  activityNowMs,
  activePendingLlm,
  pendingPromptPretty,
  pendingPromptPhase,
  pendingPromptIsJson,
  lastReceivedResponseTrace,
  lastReceivedResponseEvent,
  lastReceivedResponsePretty,
  lastReceivedPhase,
  lastReceivedResponseIsJson,
  pipelineSteps,
}: OverviewPanelProps) {
  const [pendingPromptCollapsed, togglePendingPrompt] = usePersistedToggle('indexing:overview:pendingPrompt', true);
  const [lastResponseCollapsed, toggleLastResponse] = usePersistedToggle('indexing:overview:lastResponse', true);
  const body = (
    <div className={embedded ? 'space-y-2' : 'mt-3 space-y-2'}>
      <ActivityGauge
        label="overall run activity"
        currentPerMin={runtimeActivity.currentPerMin}
        peakPerMin={runtimeActivity.peakPerMin}
        active={processRunning}
      />
      <ActivityGauge
        label="llm call activity"
        currentPerMin={llmActivity.currentPerMin}
        peakPerMin={llmActivity.peakPerMin}
        active={processRunning || pendingLlmTotal > 0}
        tooltip="Live LLM call lifecycle events (started/completed/failed) per minute."
      />
      <div className="sf-surface-elevated px-2 py-2">
        <div className="flex items-center justify-between gap-2 sf-text-caption">
          <div className="flex items-center sf-text-subtle">
            pending llm calls
            <Tip text="Current in-flight LLM calls grouped by purpose + model. Bars shrink to zero when calls complete." />
          </div>
          <div className={`font-semibold ${pendingLlmTotal > 0 ? 'sf-status-text-success' : 'sf-text-muted'}`}>
            {formatNumber(pendingLlmTotal)}
          </div>
        </div>
        {pendingLlmRows.length === 0 ? (
          <div className="mt-1 sf-text-label sf-text-muted">
            no llm calls pending
          </div>
        ) : (
          <div className="mt-2 space-y-1.5">
            {pendingLlmRows.slice(0, 8).map((row) => {
              const widthPct = Math.max(8, Math.min(100, (Number(row.pending || 0) / Math.max(1, pendingLlmPeak)) * 100));
              const sinceMs = row.firstStartedAtMs > 0 ? Math.max(0, activityNowMs - row.firstStartedAtMs) : 0;
              return (
                <div key={`pending-llm:${row.key}`} className="sf-surface-elevated px-2 py-1">
                  <div className="flex items-center justify-between gap-2 sf-text-label">
                    <div className="truncate sf-text-subtle" title={`${row.reason} | ${row.model}`}>
                      {row.reason} | {row.model}
                    </div>
                    <div className="font-semibold sf-status-text-success">
                      {formatNumber(Number(row.pending || 0))}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 sf-text-caption sf-text-muted">
                    <span className="truncate" title={`${row.provider} | ${row.routeRole || 'n/a'}`}>
                      {row.provider} | role {row.routeRole || 'n/a'}
                    </span>
                    <span>{sinceMs > 0 ? `pending ${formatDuration(sinceMs)}` : 'pending'}</span>
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded overflow-hidden"
                    style={{
                      backgroundColor: 'rgb(var(--sf-color-border-default-rgb) / 0.7)',
                    }}
                  >
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: 'var(--sf-state-success-fg)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sf-text-caption">
        <div className={`px-2 py-2 ${activePendingLlm ? 'sf-callout sf-callout-success' : 'sf-callout sf-callout-neutral'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className={`font-semibold ${activePendingLlm ? 'sf-status-text-success' : 'sf-text-primary'}`}>
                Pending LLM Prompt
              </div>
              <span className={`px-1.5 py-0.5 rounded sf-text-caption ${llmPhaseBadgeClasses(pendingPromptPhase)}`}>
                {llmPhaseLabel(pendingPromptPhase)}
              </span>
              {pendingPromptIsJson ? (
                <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-success">
                  JSON
                </span>
              ) : null}
            </div>
            <button
              onClick={() => togglePendingPrompt()}
              className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
              title={pendingPromptCollapsed ? 'Open panel' : 'Close panel'}
            >
              {pendingPromptCollapsed ? '+' : '-'}
            </button>
          </div>
          <div className="mt-1 sf-text-label sf-text-muted">
            {activePendingLlm
              ? `${activePendingLlm.reason} | ${activePendingLlm.model} | role ${activePendingLlm.routeRole || 'n/a'} | pending ${formatNumber(Number(activePendingLlm.pending || 0))}`
              : 'no pending prompt'}
          </div>
          {!pendingPromptCollapsed ? (
            <pre className="mt-2 whitespace-pre-wrap break-words sf-text-label max-h-56 overflow-y-auto sf-pre-block">
              {activePendingLlm
                ? (pendingPromptPretty || '(prompt preview not available yet for the active call)')
                : '(no pending llm prompt)'}
            </pre>
          ) : null}
        </div>
        <div className="sf-surface-elevated px-2 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <div className="font-semibold sf-text-primary">
                Last Received Response
              </div>
              <span className={`px-1.5 py-0.5 rounded sf-text-caption ${llmPhaseBadgeClasses(lastReceivedPhase)}`}>
                {llmPhaseLabel(lastReceivedPhase)}
              </span>
              {lastReceivedResponseIsJson ? (
                <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-success">
                  JSON
                </span>
              ) : null}
            </div>
            <button
              onClick={() => toggleLastResponse()}
              className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
              title={lastResponseCollapsed ? 'Open panel' : 'Close panel'}
            >
              {lastResponseCollapsed ? '+' : '-'}
            </button>
          </div>
          <div className="mt-1 sf-text-label sf-text-muted">
            {lastReceivedResponseTrace
              ? `${String(lastReceivedResponseTrace.purpose || 'unknown')} | ${String(lastReceivedResponseTrace.model || 'unknown')} | ${formatDateTime(lastReceivedResponseTrace.ts || null)}`
              : lastReceivedResponseEvent
                ? `${String(lastReceivedResponseEvent.purpose || 'unknown')} | ${String(lastReceivedResponseEvent.model || 'unknown')} | ${formatDateTime(lastReceivedResponseEvent.ts || null)}`
                : 'no response received yet'}
          </div>
          {!lastResponseCollapsed ? (
            <pre className="mt-2 whitespace-pre-wrap break-words sf-text-label max-h-56 overflow-y-auto sf-pre-block">
              {lastReceivedResponsePretty || '(no response trace yet)'}
            </pre>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 sf-text-caption">
        {pipelineSteps.map((step) => (
          <div key={`pipeline-step:${step.label}`} className="sf-surface-elevated px-2 py-1 flex items-center justify-between gap-2">
            <span className="sf-text-subtle truncate" title={step.label}>{step.label}</span>
            <span className={`px-1.5 py-0.5 rounded ${panelStateChipClasses(step.state)}`}>
              {step.state}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  if (embedded) {
    return body;
  }

  return (
    <div className="sf-surface-panel p-4" style={{ order: 10 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-6 h-6 text-xs sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <div>
            <h2 className="text-lg font-semibold sf-text-primary">Indexing Lab</h2>
            {!collapsed ? (
              <p className="text-sm sf-text-muted">
                One click run path. Run IndexLab executes search -&gt; fetch -&gt; parse -&gt; index -&gt; NeedSet/Phase 02/Phase 03 automatically for <span className="font-mono">{category}</span>.
              </p>
            ) : null}
          </div>
        </div>
        <div className="sf-text-caption sf-text-muted">
          process {processStateLabel}
          {processStatus?.pid ? ` | pid ${processStatus.pid}` : ''}
          {processStatus?.command ? ` | ${processStatus.command}` : ''}
          {!processRunning && processStatus?.exitCode !== null && processStatus?.exitCode !== undefined ? ` | exit ${processStatus.exitCode}` : ''}
          {selectedIndexLabRun?.started_at ? ` | runtime ${selectedRunLiveDuration}` : ''}
        </div>
      </div>
      {!collapsed ? body : null}
    </div>
  );
}
