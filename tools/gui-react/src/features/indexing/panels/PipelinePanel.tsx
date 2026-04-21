import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { ProductHistoryPanel } from './ProductHistoryPanel.tsx';
import { ProductHistoryKpiRow } from './ProductHistoryKpiRow.tsx';
import { PipelinePhaseBadges } from './PipelinePhaseBadges.tsx';
import type { LlmKeyGateError } from '../../../hooks/llmKeyGateHelpers.js';

interface PipelinePanelProps {
  collapsed: boolean;
  onToggle: () => void;
  busy: boolean;
  processRunning: boolean;
  runtimeSettingsReady: boolean;
  canRunSingle: boolean;
  onRunIndexLab: () => void;
  llmKeyGateErrors: LlmKeyGateError[];
  stopForceKill: boolean;
  onStopForceKillChange: (value: boolean) => void;
  onStopProcess: (opts: { force: boolean }) => void;
  stopPending: boolean;
  selectedIndexLabRunId: string;
  onClearSelectedRunView: () => void;
  onReplaySelectedRunView: () => void;
  productId: string;
  category: string;
}

export function PipelinePanel({
  collapsed,
  onToggle,
  busy,
  processRunning,
  runtimeSettingsReady,
  canRunSingle,
  onRunIndexLab,
  llmKeyGateErrors,
  stopForceKill,
  onStopForceKillChange,
  onStopProcess,
  stopPending,
  selectedIndexLabRunId,
  onClearSelectedRunView,
  onReplaySelectedRunView,
  productId,
  category,
}: PipelinePanelProps) {
  const hasKeyGateBlock = llmKeyGateErrors.length > 0;
  return (
    <div className="sf-surface-panel p-0" style={{ order: -10 }}>
      <div className={`flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}>
        <button
          onClick={onToggle}
          className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '+' : '-'}
        </button>
        <span className="text-[15px] font-bold sf-text-primary">Pipeline</span>
        <Tip text="Run, stop, and replay IndexLab. Expand the nested Run History to inspect outcomes." />
        <PipelinePhaseBadges />
      </div>
      {!collapsed ? (
        <div className="px-6 pb-4 pt-3 space-y-3">
          {hasKeyGateBlock && (
            <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption">
              <span className="font-semibold">Missing API Keys</span>
              <span> — {llmKeyGateErrors.map((e) => e.label).join(', ')}. Configure keys in the LLM settings tab.</span>
            </div>
          )}
          <button
            onClick={onRunIndexLab}
            disabled={!canRunSingle || busy || processRunning || !runtimeSettingsReady || hasKeyGateBlock}
            className={`w-full px-3 py-2 text-sm rounded sf-primary-button transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed ${
              processRunning
                ? 'translate-y-px shadow-inner'
                : 'shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner'
            }`}
            title={hasKeyGateBlock
              ? 'Run blocked — LLM API keys are missing.'
              : runtimeSettingsReady
                ? 'Run IndexLab for selected product and stream events.'
                : 'Run start is locked until shared pipeline settings finish hydrating.'}
          >
            Run IndexLab
          </button>
          <div className="grid grid-cols-1 md:grid-cols-3 items-start gap-2">
            <div className="space-y-1">
              <button
                onClick={() => onStopProcess({ force: stopForceKill })}
                disabled={stopPending}
                className="w-full h-10 inline-flex items-center justify-center px-3 text-sm rounded sf-danger-button-solid shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
                title={stopForceKill ? 'Force kill process tree if needed.' : 'Graceful stop request.'}
              >
                Stop Process
              </button>
              <label className="inline-flex items-center gap-2 sf-text-label sf-text-muted">
                <input
                  type="checkbox"
                  checked={stopForceKill}
                  onChange={(e) => onStopForceKillChange(e.target.checked)}
                  disabled={stopPending}
                />
                force kill (hard stop)
                <Tip text="When enabled, Stop Process uses forced kill behavior if graceful stop hangs." />
              </label>
            </div>
            <button
              onClick={onClearSelectedRunView}
              disabled={busy || !selectedIndexLabRunId}
              className="w-full h-10 self-start inline-flex items-center justify-center px-3 text-sm rounded sf-icon-button shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Clear only selected run containers from the current view."
            >
              Clear Selected View
            </button>
            <button
              onClick={onReplaySelectedRunView}
              disabled={busy || !selectedIndexLabRunId}
              className="w-full h-10 self-start inline-flex items-center justify-center px-3 text-sm rounded sf-icon-button shadow-sm hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner transition-all duration-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Replay selected run from persisted events/artifacts."
            >
              Replay Selected Run
            </button>
          </div>
          {!runtimeSettingsReady ? (
            <div className="sf-text-label sf-status-text-warning">
              Pipeline settings are loading. Run start is locked until persisted settings hydrate.
            </div>
          ) : null}
          <ProductHistoryKpiRow productId={productId} category={category} />
          <ProductHistoryPanel productId={productId} category={category} />
        </div>
      ) : null}
    </div>
  );
}
