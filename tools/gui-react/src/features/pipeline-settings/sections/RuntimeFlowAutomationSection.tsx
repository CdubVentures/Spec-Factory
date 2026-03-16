import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

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
              {/* ── Group 2: Drift Detection ── */}
              <div id={runtimeSubStepDomId('automation-drift')} className="scroll-mt-24" />
              <SettingGroupBlock title="Drift Detection">
                <MasterSwitchRow label="Drift Detection Enabled" tip="Enable drift scanner background pass." hint="Controls drift scanning and auto-republish settings below.">
                  <SettingToggle
                    checked={runtimeDraft.driftDetectionEnabled}
                    onChange={(next) => updateDraft('driftDetectionEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Drift Poll Seconds" tip="Seconds between drift scan polling cycles.">
                  <SettingNumberInput draftKey="driftPollSeconds" value={runtimeDraft.driftPollSeconds} bounds={getNumberBounds('driftPollSeconds')} step={60} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <SettingRow label="Drift Scan Max Products" tip="Maximum products scanned per drift cycle.">
                  <SettingNumberInput draftKey="driftScanMaxProducts" value={runtimeDraft.driftScanMaxProducts} bounds={getNumberBounds('driftScanMaxProducts')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Drift Settings" count={2}>
                  <SettingRow label="Drift Auto Republish" tip="Automatically republish on drift detections.">
                    <SettingToggle
                      checked={runtimeDraft.driftAutoRepublish}
                      onChange={(next) => updateDraft('driftAutoRepublish', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                  <SettingRow label="Re-Crawl Stale After (days)" tip="Days before stale URLs are automatically re-crawled.">
                    <SettingNumberInput draftKey="reCrawlStaleAfterDays" value={runtimeDraft.reCrawlStaleAfterDays} bounds={getNumberBounds('reCrawlStaleAfterDays')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>

              {/* ── Group 4: Self-Improvement ── */}
              <div id={runtimeSubStepDomId('automation-learning')} className="scroll-mt-24" />
              <SettingGroupBlock title="Self-Improvement">
                <MasterSwitchRow label="Self Improve Enabled" tip="Enable post-run hypothesis improvement and follow-up logic." hint="Controls learning confidence, hypothesis, and endpoint signal settings below.">
                  <SettingToggle
                    checked={runtimeDraft.selfImproveEnabled}
                    onChange={(next) => updateDraft('selfImproveEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Batch Strategy" tip="Field-batching strategy token used by advanced runtime logic.">
                  <input
                    type="text"
                    value={runtimeDraft.batchStrategy}
                    onChange={(event) => updateDraft('batchStrategy', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Learning Settings" count={7}>
                  <SettingRow label="Field Reward Half-Life (days)" tip="Reward-decay half-life for field selection strategy.">
                    <SettingNumberInput draftKey="fieldRewardHalfLifeDays" value={runtimeDraft.fieldRewardHalfLifeDays} bounds={getNumberBounds('fieldRewardHalfLifeDays')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Max Hypothesis Items" tip="Maximum hypothesis rows considered during self-improve.">
                    <SettingNumberInput draftKey="maxHypothesisItems" value={runtimeDraft.maxHypothesisItems} bounds={getNumberBounds('maxHypothesisItems')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Hypothesis Auto Followup Rounds" tip="Number of automatic follow-up rounds for hypothesis exploration.">
                    <SettingNumberInput draftKey="hypothesisAutoFollowupRounds" value={runtimeDraft.hypothesisAutoFollowupRounds} bounds={getNumberBounds('hypothesisAutoFollowupRounds')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Hypothesis Followup URLs / Round" tip="URL budget consumed in each hypothesis follow-up round.">
                    <SettingNumberInput draftKey="hypothesisFollowupUrlsPerRound" value={runtimeDraft.hypothesisFollowupUrlsPerRound} bounds={getNumberBounds('hypothesisFollowupUrlsPerRound')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Signal Limit" tip="Maximum endpoint signals retained per page scan.">
                    <SettingNumberInput draftKey="endpointSignalLimit" value={runtimeDraft.endpointSignalLimit} bounds={getNumberBounds('endpointSignalLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Suggestion Limit" tip="Maximum endpoint suggestions promoted from signal analysis.">
                    <SettingNumberInput draftKey="endpointSuggestionLimit" value={runtimeDraft.endpointSuggestionLimit} bounds={getNumberBounds('endpointSuggestionLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Endpoint Network Scan Limit" tip="Maximum network responses inspected while mining endpoint signals.">
                    <SettingNumberInput draftKey="endpointNetworkScanLimit" value={runtimeDraft.endpointNetworkScanLimit} bounds={getNumberBounds('endpointNetworkScanLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>

              {/* ── Group 5: Helper Runtime ── */}
              <div id={runtimeSubStepDomId('automation-helper')} className="scroll-mt-24" />
              <SettingGroupBlock title="Helper Runtime">
                <MasterSwitchRow label="Helper Files Enabled" tip="Enable helper-files runtime substrate." hint="Controls all helper file runtime settings below.">
                  <SettingToggle
                    checked={runtimeDraft.categoryAuthorityEnabled}
                    onChange={(next) => updateDraft('categoryAuthorityEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </MasterSwitchRow>
                <SettingRow label="Helper Files Master Toggle" tip="Master toggle for helper-files runtime substrate.">
                  <SettingToggle
                    checked={runtimeDraft.helperFilesEnabled}
                    onChange={(next) => updateDraft('helperFilesEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Files Root" tip="Root directory path for helper files." disabled={!runtimeDraft.helperFilesEnabled}>
                  <input
                    type="text"
                    value={runtimeDraft.helperFilesRoot}
                    onChange={(event) => updateDraft('helperFilesRoot', event.target.value)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.helperFilesEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Category Authority Root" tip="Root directory for category authority data files." disabled={!runtimeDraft.helperFilesEnabled}>
                  <input
                    type="text"
                    value={runtimeDraft.categoryAuthorityRoot}
                    onChange={(event) => updateDraft('categoryAuthorityRoot', event.target.value)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.helperFilesEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Helper Supportive Enabled" tip="Enable supportive helper evidence mode.">
                  <SettingToggle
                    checked={runtimeDraft.helperSupportiveEnabled}
                    onChange={(next) => updateDraft('helperSupportiveEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <AdvancedSettingsBlock title="Advanced Helper Settings" count={6}>
                  <SettingRow label="Indexing Helper Files" tip="Enable helper-files integration within indexing pipeline runs.">
                    <SettingToggle
                      checked={runtimeDraft.indexingHelperFilesEnabled}
                      onChange={(next) => updateDraft('indexingHelperFilesEnabled', next)}
                      disabled={!runtimeSettingsReady || !runtimeDraft.helperFilesEnabled}
                    />
                  </SettingRow>
                  <SettingRow label="Helper Supportive Fill Missing" tip="Allow helper supportive mode to fill missing values.">
                    <SettingToggle
                      checked={runtimeDraft.helperSupportiveFillMissing}
                      onChange={(next) => updateDraft('helperSupportiveFillMissing', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                  <SettingRow label="Helper Supportive Max Sources" tip="Maximum supportive helper sources admitted per field.">
                    <SettingNumberInput draftKey="helperSupportiveMaxSources" value={runtimeDraft.helperSupportiveMaxSources} bounds={getNumberBounds('helperSupportiveMaxSources')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Helper Auto Seed Targets" tip="Auto-seed helper targets into runtime queue.">
                    <SettingToggle
                      checked={runtimeDraft.helperAutoSeedTargets}
                      onChange={(next) => updateDraft('helperAutoSeedTargets', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                  <SettingRow label="Helper Active Sync Limit" tip="Active helper synchronization cap per cycle.">
                    <SettingNumberInput draftKey="helperActiveSyncLimit" value={runtimeDraft.helperActiveSyncLimit} bounds={getNumberBounds('helperActiveSyncLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                  </SettingRow>
                  <SettingRow label="Indexing Helper Files Enabled" tip="Enable indexing helper-file assist path.">
                    <SettingToggle
                      checked={runtimeDraft.indexingCategoryAuthorityEnabled}
                      onChange={(next) => updateDraft('indexingCategoryAuthorityEnabled', next)}
                      disabled={!runtimeSettingsReady}
                    />
                  </SettingRow>
                </AdvancedSettingsBlock>
              </SettingGroupBlock>
                </>
  );
});
