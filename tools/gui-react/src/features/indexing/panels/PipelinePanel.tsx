import { IndexingPanelHeader } from '../../../shared/ui/finder/index.ts';
import { ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
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
  keyGateLoading: boolean;
  onStopProcess: () => void;
  stopPending: boolean;
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
  keyGateLoading,
  onStopProcess,
  stopPending,
  productId,
  category,
}: PipelinePanelProps) {
  const hasKeyGateBlock = !keyGateLoading && llmKeyGateErrors.length > 0;
  // WHY: when LLM config / Serper credit haven't resolved yet, treat as
  // "maybe missing" to keep Run disabled — but don't flash the red banner.
  const runBlocked = !canRunSingle || busy || processRunning || !runtimeSettingsReady || hasKeyGateBlock || keyGateLoading;
  return (
    <div className="sf-surface-panel p-0" style={{ order: -10 }} data-panel="pipeline">
      <IndexingPanelHeader
        panel="pipeline"
        icon="▶"
        collapsed={collapsed}
        onToggle={onToggle}
        title="Pipeline"
        tip="Run and stop IndexLab. Expand the nested Run History to inspect outcomes."
        isRunning={processRunning}
        modelStrip={<PipelinePhaseBadges />}
        onRun={onRunIndexLab}
        runLabel="Run IndexLab"
        runDisabled={runBlocked}
        onStop={onStopProcess}
        stopLabel="Stop"
        stopPending={stopPending}
        defaultButtonWidth={ACTION_BUTTON_WIDTH.pipelineHeader}
      />
      {!collapsed ? (
        <div className="px-6 pb-4 pt-3 space-y-3">
          {keyGateLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 sf-text-caption sf-text-muted">
              <Spinner className="h-3 w-3" />
              <span>Checking API keys…</span>
            </div>
          ) : hasKeyGateBlock ? (
            <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption">
              <span className="font-semibold">Missing API Keys</span>
              <span> — {llmKeyGateErrors.map((e) => e.label).join(', ')}. Configure keys in the LLM settings tab.</span>
            </div>
          ) : null}
          {!runtimeSettingsReady ? (
            <div className="flex items-center gap-2 px-3 py-2 sf-text-caption sf-text-muted">
              <Spinner className="h-3 w-3" />
              <span>Loading pipeline settings…</span>
            </div>
          ) : null}
          <ProductHistoryKpiRow productId={productId} category={category} />
          <ProductHistoryPanel productId={productId} category={category} />
        </div>
      ) : null}
    </div>
  );
}
