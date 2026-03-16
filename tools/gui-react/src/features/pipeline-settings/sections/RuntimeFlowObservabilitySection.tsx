import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, FlowOptionPanel, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

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
        title="Observability and Trace"
        subtitle="Runtime trace and audit-stream controls for event visibility."
      >
        <div id={runtimeSubStepDomId('observability-trace-core')} className="scroll-mt-24" />
        <SettingGroupBlock title="Trace Configuration">
          <MasterSwitchRow label="Runtime Trace Enabled" tip="Master toggle for runtime trace capture and trace stream emission." hint="Controls trace ring, LLM payload, and screencast settings below">
            <SettingToggle
              checked={runtimeDraft.runtimeTraceEnabled}
              onChange={(next) => updateDraft('runtimeTraceEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <SettingRow
            label="Fetch Trace Ring Size"
            tip="In-memory ring size for fetch events."
            disabled={traceControlsLocked}
          >
            <SettingNumberInput draftKey="runtimeTraceFetchRing" value={runtimeDraft.runtimeTraceFetchRing} bounds={getNumberBounds('runtimeTraceFetchRing')} step={1} disabled={!runtimeSettingsReady || traceControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="LLM Trace Ring Size"
            tip="In-memory ring size for LLM trace events."
            disabled={traceControlsLocked}
          >
            <SettingNumberInput draftKey="runtimeTraceLlmRing" value={runtimeDraft.runtimeTraceLlmRing} bounds={getNumberBounds('runtimeTraceLlmRing')} step={1} disabled={!runtimeSettingsReady || traceControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Trace LLM Payloads"
            tip="Capture LLM prompt/response payload previews in runtime trace events."
            disabled={traceControlsLocked}
          >
            <SettingToggle
              checked={runtimeDraft.runtimeTraceLlmPayloads}
              onChange={(next) => updateDraft('runtimeTraceLlmPayloads', next)}
              disabled={!runtimeSettingsReady || traceControlsLocked}
            />
          </SettingRow>
          <SettingRow label="Events NDJSON Write" tip="Write runtime events to NDJSON stream output.">
            <SettingToggle
              checked={runtimeDraft.eventsJsonWrite}
              onChange={(next) => updateDraft('eventsJsonWrite', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
        </SettingGroupBlock>
        {traceControlsLocked ? renderDisabledHint('Trace ring and payload controls are disabled because Runtime Trace is OFF.') : null}

        <div id={runtimeSubStepDomId('observability-trace-daemon')} className="scroll-mt-24" />
        <SettingGroupBlock title="Daemon Operations">
          <SettingRow label="Daemon Concurrency" tip="Concurrent product runs for daemon mode.">
            <SettingNumberInput draftKey="daemonConcurrency" value={runtimeDraft.daemonConcurrency} bounds={getNumberBounds('daemonConcurrency')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Daemon Graceful Shutdown Timeout (ms)" tip="Grace period before daemon force-stop.">
            <SettingNumberInput draftKey="daemonGracefulShutdownTimeoutMs" value={runtimeDraft.daemonGracefulShutdownTimeoutMs} bounds={getNumberBounds('daemonGracefulShutdownTimeoutMs')} step={1000} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <AdvancedSettingsBlock title="Resume & Validation" count={5}>
            <SettingRow label="Indexing Resume Seed Limit" tip="Maximum seed URLs loaded during resume.">
              <SettingNumberInput draftKey="indexingResumeSeedLimit" value={runtimeDraft.indexingResumeSeedLimit} bounds={getNumberBounds('indexingResumeSeedLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Indexing Resume Persist Limit" tip="Maximum persisted items loaded during resume.">
              <SettingNumberInput draftKey="indexingResumePersistLimit" value={runtimeDraft.indexingResumePersistLimit} bounds={getNumberBounds('indexingResumePersistLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Indexing Schema Validation Enabled" tip="Enable schema packet validation for indexing payloads.">
              <SettingToggle
                checked={runtimeDraft.indexingSchemaPacketsValidationEnabled}
                onChange={(next) => updateDraft('indexingSchemaPacketsValidationEnabled', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Indexing Schema Validation Strict" tip="Fail hard on schema validation errors when enabled.">
              <SettingToggle
                checked={runtimeDraft.indexingSchemaPacketsValidationStrict}
                onChange={(next) => updateDraft('indexingSchemaPacketsValidationStrict', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Re-Crawl Stale After (days)" tip="Re-crawl source URLs after this staleness window.">
              <SettingNumberInput draftKey="reCrawlStaleAfterDays" value={runtimeDraft.reCrawlStaleAfterDays} bounds={getNumberBounds('reCrawlStaleAfterDays')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </AdvancedSettingsBlock>
          <AdvancedSettingsBlock title="Import Watcher" count={2}>
            <SettingRow label="Imports Root" tip="Root directory monitored by daemon import watcher.">
              <input
                type="text"
                value={runtimeDraft.importsRoot}
                onChange={(event) => updateDraft('importsRoot', event.target.value)}
                disabled={!runtimeSettingsReady}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow label="Imports Poll Seconds" tip="Polling interval for daemon import watcher.">
              <SettingNumberInput draftKey="importsPollSeconds" value={runtimeDraft.importsPollSeconds} bounds={getNumberBounds('importsPollSeconds')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </AdvancedSettingsBlock>
        </SettingGroupBlock>

        <div id={runtimeSubStepDomId('observability-trace-outputs')} className="scroll-mt-24" />
        <SettingGroupBlock title="Data Streams">
          <SettingRow label="Authority Snapshot Enabled" tip="Emit authority snapshot payloads for cross-surface settings propagation diagnostics.">
            <SettingToggle
              checked={runtimeDraft.authoritySnapshotEnabled}
              onChange={(next) => updateDraft('authoritySnapshotEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <AdvancedSettingsBlock title="Dual-Write Toggles" count={6}>
            <SettingRow label="Queue JSON Write" tip="Dual-write queue data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.queueJsonWrite}
                onChange={(next) => updateDraft('queueJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Billing JSON Write" tip="Dual-write billing data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.billingJsonWrite}
                onChange={(next) => updateDraft('billingJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Intel JSON Write" tip="Dual-write discovery intel data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.intelJsonWrite}
                onChange={(next) => updateDraft('intelJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Corpus JSON Write" tip="Dual-write corpus/evidence data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.corpusJsonWrite}
                onChange={(next) => updateDraft('corpusJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Learning JSON Write" tip="Dual-write learning store data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.learningJsonWrite}
                onChange={(next) => updateDraft('learningJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
            <SettingRow label="Cache JSON Write" tip="Dual-write cache data to JSON for migration safety.">
              <SettingToggle
                checked={runtimeDraft.cacheJsonWrite}
                onChange={(next) => updateDraft('cacheJsonWrite', next)}
                disabled={!runtimeSettingsReady}
              />
            </SettingRow>
          </AdvancedSettingsBlock>
        </SettingGroupBlock>

        <SettingGroupBlock title="Video Capture">
          <MasterSwitchRow label="Runtime Screencast Enabled" tip="Enable live browser screencast frame streaming for Runtime Ops." hint="Controls screencast quality settings below">
            <SettingToggle
              checked={runtimeDraft.runtimeScreencastEnabled}
              onChange={(next) => updateDraft('runtimeScreencastEnabled', next)}
              disabled={!runtimeSettingsReady}
            />
          </MasterSwitchRow>
          <AdvancedSettingsBlock title="Screencast Quality" count={4}>
            <SettingRow label="Runtime Screencast FPS" tip="Target screencast frame rate (frames per second)." disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastFps" value={runtimeDraft.runtimeScreencastFps} bounds={getNumberBounds('runtimeScreencastFps')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Quality" tip="JPEG quality for screencast frames." disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastQuality" value={runtimeDraft.runtimeScreencastQuality} bounds={getNumberBounds('runtimeScreencastQuality')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Max Width" tip="Maximum screencast frame width in pixels." disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastMaxWidth" value={runtimeDraft.runtimeScreencastMaxWidth} bounds={getNumberBounds('runtimeScreencastMaxWidth')} step={10} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
            <SettingRow label="Runtime Screencast Max Height" tip="Maximum screencast frame height in pixels." disabled={!runtimeDraft.runtimeScreencastEnabled}>
              <SettingNumberInput draftKey="runtimeScreencastMaxHeight" value={runtimeDraft.runtimeScreencastMaxHeight} bounds={getNumberBounds('runtimeScreencastMaxHeight')} step={10} disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled} className={inputCls} onNumberChange={onNumberChange} />
            </SettingRow>
          </AdvancedSettingsBlock>
        </SettingGroupBlock>
      </FlowOptionPanel>
    </div>
  );
});
