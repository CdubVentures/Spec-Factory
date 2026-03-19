import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, FlowOptionPanel, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const OBSERVABILITY_PHASE_TIP =
  'Phase coverage: cross-cutting across stages 01-13.';

interface RuntimeFlowObservabilitySectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  traceControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderDisabledHint: (message: string) => ReactNode;
}

export const RuntimeFlowObservabilitySection = memo(function RuntimeFlowObservabilitySection({
  runtimeDraft,
  runtimeSettingsReady,
  traceControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowObservabilitySectionProps) {
  return (
    <div className="space-y-3">
      <FlowOptionPanel
        title="Observability"
        subtitle="Runtime trace, event diagnostics, and screencast controls."
      >
        <div id={runtimeSubStepDomId('observability-trace-core')} className="scroll-mt-24" />
        <SettingGroupBlock title="Trace Configuration">
          <MasterSwitchRow label="Runtime Trace Enabled" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: runtime event and trace emission used by Runtime Ops.\nWhat this controls: whether the runtime records trace packets and emits the trace stream at all.`} hint="Controls trace ring, LLM payload, and screencast settings below">
            <SettingToggle
              checked={runtimeDraft.runtimeTraceEnabled}
              onChange={(next) => updateDraft('runtimeTraceEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <SettingRow
            label="Fetch Trace Ring Size"
            tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: in-memory trace buffering for fetch work.\nWhat this controls: how many fetch events are retained in memory before older ones roll off.`}
            disabled={traceControlsLocked}
          >
            <SettingNumberInput draftKey="runtimeTraceFetchRing" value={runtimeDraft.runtimeTraceFetchRing} bounds={getNumberBounds('runtimeTraceFetchRing')} step={1} disabled={!runtimeSettingsReady || traceControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="LLM Trace Ring Size"
            tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: in-memory trace buffering for LLM work.\nWhat this controls: how many LLM events are retained in memory before older ones roll off.`}
            disabled={traceControlsLocked}
          >
            <SettingNumberInput draftKey="runtimeTraceLlmRing" value={runtimeDraft.runtimeTraceLlmRing} bounds={getNumberBounds('runtimeTraceLlmRing')} step={1} disabled={!runtimeSettingsReady || traceControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Trace LLM Payloads"
            tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: LLM trace payload capture.\nWhat this controls: whether prompt and response previews are attached to runtime trace events for LLM calls.`}
            disabled={traceControlsLocked}
          >
            <SettingToggle
              checked={runtimeDraft.runtimeTraceLlmPayloads}
              onChange={(next) => updateDraft('runtimeTraceLlmPayloads', next)}
              disabled={!runtimeSettingsReady || traceControlsLocked}
            />
          </SettingRow>
          <SettingRow label="Events NDJSON Write" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: event-stream persistence.\nWhat this controls: whether runtime events are written to an NDJSON artifact on disk.`}>
            <SettingToggle
              checked={runtimeDraft.eventsJsonWrite}
              onChange={(next) => updateDraft('eventsJsonWrite', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
        </SettingGroupBlock>
        {traceControlsLocked ? renderDisabledHint('Trace ring and payload controls are disabled because Runtime Trace is OFF.') : null}


        <div id={runtimeSubStepDomId('observability-trace-video')} className="scroll-mt-24" />
        <SettingGroupBlock title="Video Capture">
          <MasterSwitchRow label="Runtime Screencast Enabled" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: Runtime Ops live browser instrumentation.\nWhat this controls: whether browser-backed fetch work can publish screencast frames for operators.`} hint="Controls screencast quality settings below">
            <SettingToggle
              checked={runtimeDraft.runtimeScreencastEnabled}
              onChange={(next) => updateDraft('runtimeScreencastEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <AdvancedSettingsBlock title="Screencast Quality" count={4}>
            <SettingRow label="Runtime Screencast FPS" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: screencast encoder timing.\nWhat this controls: the target frame rate for emitted screencast frames.`} disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastFps" value={runtimeDraft.runtimeScreencastFps} bounds={getNumberBounds('runtimeScreencastFps')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Quality" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: screencast encoding.\nWhat this controls: the JPEG quality used for screencast frames.`} disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastQuality" value={runtimeDraft.runtimeScreencastQuality} bounds={getNumberBounds('runtimeScreencastQuality')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Max Width" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: screencast frame sizing.\nWhat this controls: the maximum width allowed for screencast frames.`} disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastMaxWidth" value={runtimeDraft.runtimeScreencastMaxWidth} bounds={getNumberBounds('runtimeScreencastMaxWidth')} step={10} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Max Height" tip={`${OBSERVABILITY_PHASE_TIP}\nLives in: screencast frame sizing.\nWhat this controls: the maximum height allowed for screencast frames.`} disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastMaxHeight" value={runtimeDraft.runtimeScreencastMaxHeight} bounds={getNumberBounds('runtimeScreencastMaxHeight')} step={10} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </AdvancedSettingsBlock>
        </SettingGroupBlock>
      </FlowOptionPanel>
    </div>
  );
});
