import { memo } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

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
              {/* ── Group 1: Category Authority ── */}
              <div id={runtimeSubStepDomId('automation-helper')} className="scroll-mt-24" />
              <SettingGroupBlock title="Category Authority">
                <MasterSwitchRow label="Category Authority Enabled" tip={`${AUTOMATION_PHASE_TIP}\nLives in: category authority substrate used beside the main runtime.\nWhat this controls: whether category authority data is available to the automation layer.`} hint="Controls all category authority settings below.">
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
              </SettingGroupBlock>

              {/* ── Group 2: Resume ── */}
              <div id={runtimeSubStepDomId('automation-operations')} className="scroll-mt-24" />
              <SettingGroupBlock title="Resume">
                <SettingRow label="Indexing Resume Seed Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: resume bootstrap.\nWhat this controls: the maximum number of seed URLs loaded when resuming prior work.`}>
                  <SettingNumberInput draftKey="indexingResumeSeedLimit" value={runtimeDraft.indexingResumeSeedLimit} bounds={getNumberBounds('indexingResumeSeedLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
                <SettingRow label="Indexing Resume Persist Limit" tip={`${AUTOMATION_PHASE_TIP}\nLives in: resume bootstrap.\nWhat this controls: the maximum number of persisted items loaded while reconstructing resume state.`}>
                  <SettingNumberInput draftKey="indexingResumePersistLimit" value={runtimeDraft.indexingResumePersistLimit} bounds={getNumberBounds('indexingResumePersistLimit')} step={1} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
                </SettingRow>
              </SettingGroupBlock>
                </>
  );
});
