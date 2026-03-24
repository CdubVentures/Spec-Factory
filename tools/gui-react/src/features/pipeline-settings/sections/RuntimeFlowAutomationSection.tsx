import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const AUTOMATION_PHASE_TIP =
  'Phase coverage: background control plane around the main 01-13 run lifecycle, not a single in-run stage.';

interface RuntimeFlowAutomationSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
}

export const RuntimeFlowAutomationSection = memo(function RuntimeFlowAutomationSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
}: RuntimeFlowAutomationSectionProps) {
  return (
                <>
              {/* ── Group 1: Drift Detection ── */}
              <div id={runtimeSubStepDomId('automation-drift')} className="scroll-mt-24" />
              <SettingGroupBlock title="Drift Detection">
                <MasterSwitchRow label="Drift Detection Enabled" tip={`${AUTOMATION_PHASE_TIP}\nLives in: post-run drift monitoring.\nWhat this controls: whether the background drift scanner is allowed to look for stale or changed products outside the active run.`} hint="Controls drift scanning and auto-republish settings below.">
                  <SettingToggle
                    checked={runtimeDraft.driftDetectionEnabled}
                    onChange={(next) => updateDraft('driftDetectionEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Drift Poll Seconds" tip={`${AUTOMATION_PHASE_TIP}\nLives in: drift scanner scheduling.\nWhat this controls: the polling interval between drift detection cycles.`}>
                  <SettingNumberInput draftKey="driftPollSeconds" value={runtimeDraft.driftPollSeconds} bounds={getNumberBounds('driftPollSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <SettingRow label="Drift Scan Max Products" tip={`${AUTOMATION_PHASE_TIP}\nLives in: drift scanner batch sizing.\nWhat this controls: how many products a single drift cycle may inspect.`}>
                  <SettingNumberInput draftKey="driftScanMaxProducts" value={runtimeDraft.driftScanMaxProducts} bounds={getNumberBounds('driftScanMaxProducts')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Drift Settings" count={2}>
                  <SettingRow label="Drift Auto Republish" tip={`${AUTOMATION_PHASE_TIP}\nLives in: drift remediation policy.\nWhat this controls: whether a qualifying drift detection can trigger automatic republish behavior.`}>
                    <SettingToggle
                      checked={runtimeDraft.driftAutoRepublish}
                      onChange={(next) => updateDraft('driftAutoRepublish', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                  <SettingRow label="Re-Crawl Stale After (days)" tip={`${AUTOMATION_PHASE_TIP}\nLives in: stale-source maintenance policy.\nWhat this controls: how many days a source may age before automation treats it as stale and eligible for recrawl.`}>
                    <SettingNumberInput draftKey="reCrawlStaleAfterDays" value={runtimeDraft.reCrawlStaleAfterDays} bounds={getNumberBounds('reCrawlStaleAfterDays')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>

              {/* ── Group 2: Self-Improvement ── */}
              <div id={runtimeSubStepDomId('automation-learning')} className="scroll-mt-24" />
              <SettingGroupBlock title="Self-Improvement">
                <MasterSwitchRow label="Self Improve Enabled" tip={`${AUTOMATION_PHASE_TIP}\nLives in: post-run learning and follow-up generation.\nWhat this controls: whether the self-improvement loop may create hypotheses, follow-ups, and learning updates after runs complete.`} hint="Controls learning confidence, hypothesis, and endpoint signal settings below.">
                  <SettingToggle
                    checked={runtimeDraft.selfImproveEnabled}
                    onChange={(next) => updateDraft('selfImproveEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Batch Strategy" tip={`${AUTOMATION_PHASE_TIP}\nLives in: advanced learning/runtime orchestration.\nWhat this controls: the batching strategy token used by higher-level automation logic.`}>
                  <input
                    type="text"
                    value={runtimeDraft.batchStrategy}
                    onChange={(event) => updateDraft('batchStrategy', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Learning Settings" count={5}>
                  <SettingRow label="Field Reward Half-Life (days)" tip={`${AUTOMATION_PHASE_TIP}\nLives in: learning reward decay.\nWhat this controls: how quickly historical field rewards lose influence over time.`}>
                    <SettingNumberInput draftKey="fieldRewardHalfLifeDays" value={runtimeDraft.fieldRewardHalfLifeDays} bounds={getNumberBounds('fieldRewardHalfLifeDays')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Max Hypothesis Items" tip={`${AUTOMATION_PHASE_TIP}\nLives in: hypothesis queue sizing.\nWhat this controls: the maximum number of hypothesis rows self-improve will consider in one pass.`}>
                    <SettingNumberInput draftKey="maxHypothesisItems" value={runtimeDraft.maxHypothesisItems} bounds={getNumberBounds('maxHypothesisItems')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Signal Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: endpoint mining and signal retention.\nWhat this controls: how many endpoint signals a page scan may keep.`}>
                    <SettingNumberInput draftKey="endpointSignalLimit" value={runtimeDraft.endpointSignalLimit} bounds={getNumberBounds('endpointSignalLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Suggestion Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: endpoint suggestion promotion.\nWhat this controls: how many endpoint suggestions may be promoted from the retained signals.`}>
                    <SettingNumberInput draftKey="endpointSuggestionLimit" value={runtimeDraft.endpointSuggestionLimit} bounds={getNumberBounds('endpointSuggestionLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Network Scan Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: endpoint signal scanning.\nWhat this controls: the cap on network responses inspected while mining endpoint signals.`}>
                    <SettingNumberInput draftKey="endpointNetworkScanLimit" value={runtimeDraft.endpointNetworkScanLimit} bounds={getNumberBounds('endpointNetworkScanLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>

              {/* ── Group 3: Helper Runtime ── */}
              <div id={runtimeSubStepDomId('automation-helper')} className="scroll-mt-24" />
              <SettingGroupBlock title="Helper Runtime">
                <MasterSwitchRow label="Category Authority Enabled" tip={`${AUTOMATION_PHASE_TIP}\nLives in: helper and authority-file substrate used beside the main runtime.\nWhat this controls: whether category authority data and helper files are available to the automation layer.`} hint="Controls all helper file runtime settings below.">
                  <SettingToggle
                    checked={runtimeDraft.categoryAuthorityEnabled}
                    onChange={(next) => updateDraft('categoryAuthorityEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Category Authority Root" tip={`${AUTOMATION_PHASE_TIP}\nLives in: category authority file resolution.\nWhat this controls: the root directory for category authority data files.`}>
                  <input
                    type="text"
                    value={runtimeDraft.categoryAuthorityRoot}
                    onChange={(event) => updateDraft('categoryAuthorityRoot', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Helper Settings" count={1}>
                  <SettingRow label="Helper Supportive Fill Missing" tip={`${AUTOMATION_PHASE_TIP}\nLives in: helper supportive-fill policy.\nWhat this controls: whether helper logic may fill missing values when running in supportive mode.`}>
                    <SettingToggle
                      checked={runtimeDraft.helperSupportiveFillMissing}
                      onChange={(next) => updateDraft('helperSupportiveFillMissing', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>

              {/* ── Group 4: Operations (daemon, resume, imports) ── */}
              <div id={runtimeSubStepDomId('automation-operations')} className="scroll-mt-24" />
              <SettingGroupBlock title="Operations">
                <SettingRow label="Daemon Concurrency" tip={`${AUTOMATION_PHASE_TIP}\nLives in: daemon orchestration.\nWhat this controls: how many product runs daemon mode may execute concurrently.`}>
                  <SettingNumberInput draftKey="daemonConcurrency" value={runtimeDraft.daemonConcurrency} bounds={getNumberBounds('daemonConcurrency')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <AdvancedSettingsBlock title="Resume" count={2}>
                  <SettingRow label="Indexing Resume Seed Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: daemon and resume bootstrap.\nWhat this controls: the maximum number of seed URLs loaded when resuming prior work.`}>
                    <SettingNumberInput draftKey="indexingResumeSeedLimit" value={runtimeDraft.indexingResumeSeedLimit} bounds={getNumberBounds('indexingResumeSeedLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Indexing Resume Persist Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: daemon and resume bootstrap.\nWhat this controls: the maximum number of persisted items loaded while reconstructing resume state.`}>
                    <SettingNumberInput draftKey="indexingResumePersistLimit" value={runtimeDraft.indexingResumePersistLimit} bounds={getNumberBounds('indexingResumePersistLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
                <AdvancedSettingsBlock title="Import Watcher" count={2}>
                  <SettingRow label="Imports Root" tip={`${AUTOMATION_PHASE_TIP}\nLives in: daemon import watcher.\nWhat this controls: the directory monitored for inbound imports.`}>
                    <input
                      type="text"
                      value={runtimeDraft.importsRoot}
                      onChange={(event) => updateDraft('importsRoot', event.target.value)}
                      disabled={!runtimeSettingsReady}
                      className={inputCls}
                    />
                  </SettingRow>
                  <SettingRow label="Imports Poll Seconds" tip={`${AUTOMATION_PHASE_TIP}\nLives in: daemon import watcher scheduling.\nWhat this controls: how often the import watcher polls for new work.`}>
                    <SettingNumberInput draftKey="importsPollSeconds" value={runtimeDraft.importsPollSeconds} bounds={getNumberBounds('importsPollSeconds')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>
                </>
  );
});
