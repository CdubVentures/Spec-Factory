import { memo } from 'react';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowRunOutputSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  storageAwsRegion: string;
  storageS3Bucket: string;
}

export const RuntimeFlowRunOutputSection = memo(function RuntimeFlowRunOutputSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  storageAwsRegion,
  storageS3Bucket,
}: RuntimeFlowRunOutputSectionProps) {
  return (
    <>
      <div id={runtimeSubStepDomId('run-output-destinations')} className="scroll-mt-24" />
      <SettingGroupBlock title="Output Destinations">
        <SettingRow label="Output Mode" tip="Output destination mode: local, dual, or s3.">
          <select
            value={runtimeDraft.outputMode}
            onChange={(event) => updateDraft('outputMode', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          >
            <option value="local">local</option>
            <option value="dual">dual</option>
            <option value="s3">s3</option>
          </select>
        </SettingRow>
        <SettingRow label="Local Mode" tip="Run output pipeline in local-mode behavior path.">
          <SettingToggle
            checked={runtimeDraft.localMode}
            onChange={(next) => updateDraft('localMode', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Dry Run" tip="Execute pipeline without persisting final publish artifacts.">
          <SettingToggle
            checked={runtimeDraft.dryRun}
            onChange={(next) => updateDraft('dryRun', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Local Input Root" tip="Root path used for local input fixture ingestion.">
          <input
            type="text"
            value={runtimeDraft.localInputRoot}
            onChange={(event) => updateDraft('localInputRoot', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Local Output Root" tip="Root path where local output artifacts are written.">
          <input
            type="text"
            value={runtimeDraft.localOutputRoot}
            onChange={(event) => updateDraft('localOutputRoot', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Runtime Events Key" tip="Output key/path for runtime events stream artifact.">
          <input
            type="text"
            value={runtimeDraft.runtimeEventsKey}
            onChange={(event) => updateDraft('runtimeEventsKey', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Write Markdown Summary" tip="Emit Markdown summary artifact after run completion.">
          <SettingToggle
            checked={runtimeDraft.writeMarkdownSummary}
            onChange={(next) => updateDraft('writeMarkdownSummary', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="S3 and Cloud Integrations" count={8}>
          <SettingRow label="Mirror To S3" tip="Mirror output artifacts to S3 destination paths.">
            <SettingToggle
              checked={runtimeDraft.mirrorToS3}
              onChange={(next) => updateDraft('mirrorToS3', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Mirror To S3 Input" tip="Mirror local input fixtures to configured S3 input prefix.">
            <SettingToggle
              checked={runtimeDraft.mirrorToS3Input}
              onChange={(next) => updateDraft('mirrorToS3Input', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="S3 Input Prefix" tip="S3 prefix for mirrored input assets.">
            <input
              type="text"
              value={runtimeDraft.s3InputPrefix}
              onChange={(event) => updateDraft('s3InputPrefix', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="S3 Output Prefix" tip="S3 prefix for mirrored output artifacts.">
            <input
              type="text"
              value={runtimeDraft.s3OutputPrefix}
              onChange={(event) => updateDraft('s3OutputPrefix', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="ELO Supabase Anon Key" tip="Anonymous key for optional ELO Supabase integrations.">
            <input
              type="text"
              value={runtimeDraft.eloSupabaseAnonKey}
              onChange={(event) => updateDraft('eloSupabaseAnonKey', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="ELO Supabase Endpoint" tip="Base endpoint for optional ELO Supabase integrations.">
            <input
              type="text"
              value={runtimeDraft.eloSupabaseEndpoint}
              onChange={(event) => updateDraft('eloSupabaseEndpoint', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="AWS Region" tip="AWS region token for S3 and related integrations." description="Configured on Storage tab.">
            <span className="sf-text-label">{storageAwsRegion || runtimeDraft.awsRegion || 'us-east-2'}</span>
          </SettingRow>
          <SettingRow label="S3 Bucket" tip="S3 bucket name used for output/input mirroring." description="Configured on Storage tab.">
            <span className="sf-text-label">{storageS3Bucket || runtimeDraft.s3Bucket || '(not set)'}</span>
          </SettingRow>
        </AdvancedSettingsBlock>
        <SettingRow label="Runtime Control File" tip="Runtime overrides control file path.">
          <input
            type="text"
            value={runtimeDraft.runtimeControlFile}
            onChange={(event) => updateDraft('runtimeControlFile', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
            placeholder="_runtime/control/runtime_overrides.json"
          />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
