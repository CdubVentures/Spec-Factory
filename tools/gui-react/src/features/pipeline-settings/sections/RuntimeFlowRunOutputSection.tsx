import { memo } from 'react';
import type { RuntimeDraft, NumberBound } from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, SettingGroupBlock, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const OUTPUT_PHASE_TIP =
  'Phase coverage: Stage 13 Validation To Output plus durable artifact persistence across the full run.';

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
  storageAwsRegion,
  storageS3Bucket,
}: RuntimeFlowRunOutputSectionProps) {
  return (
    <>
      <div id={runtimeSubStepDomId('run-output-destinations')} className="scroll-mt-24" />
      <SettingGroupBlock title="Output Destinations">
        <SettingRow label="Output Mode" tip={`${OUTPUT_PHASE_TIP}\nLives in: final export routing.\nWhat this controls: whether run artifacts are written locally, mirrored to both destinations, or sent only to S3 paths.`}>
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
        <SettingRow label="Local Mode" tip={`${OUTPUT_PHASE_TIP}\nLives in: runtime export behavior switches.\nWhat this controls: whether the run uses the local-mode output behavior path instead of cloud-oriented assumptions.`}>
          <SettingToggle
            checked={runtimeDraft.localMode}
            onChange={(next) => updateDraft('localMode', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Dry Run" tip={`${OUTPUT_PHASE_TIP}\nLives in: final artifact persistence gates.\nWhat this controls: whether the runtime executes the pipeline but skips persisting publish-grade final outputs.`}>
          <SettingToggle
            checked={runtimeDraft.dryRun}
            onChange={(next) => updateDraft('dryRun', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Local Input Root" tip={`${OUTPUT_PHASE_TIP}\nLives in: local fixture and input resolution.\nWhat this controls: the root path used when the runtime reads local input fixtures or mirrored assets.`}>
          <input
            type="text"
            value={runtimeDraft.localInputRoot}
            onChange={(event) => updateDraft('localInputRoot', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Local Output Root" tip={`${OUTPUT_PHASE_TIP}\nLives in: local export destination resolution.\nWhat this controls: the root directory where local run outputs, analysis artifacts, and latest snapshots are written.`}>
          <input
            type="text"
            value={runtimeDraft.localOutputRoot}
            onChange={(event) => updateDraft('localOutputRoot', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Runtime Events Key" tip={`${OUTPUT_PHASE_TIP}\nLives in: runtime event-stream export.\nWhat this controls: the output key or path used for the runtime events artifact.`}>
          <input
            type="text"
            value={runtimeDraft.runtimeEventsKey}
            onChange={(event) => updateDraft('runtimeEventsKey', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Write Markdown Summary" tip={`${OUTPUT_PHASE_TIP}\nLives in: summary artifact generation after completion.\nWhat this controls: whether a Markdown summary is emitted when the run finishes.`}>
          <SettingToggle
            checked={runtimeDraft.writeMarkdownSummary}
            onChange={(next) => updateDraft('writeMarkdownSummary', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Runtime Control File" tip={`${OUTPUT_PHASE_TIP}\nLives in: runtime override loading before and during execution.\nWhat this controls: the control file path used for runtime override inputs.`}>
          <input
            type="text"
            value={runtimeDraft.runtimeControlFile}
            onChange={(event) => updateDraft('runtimeControlFile', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
            placeholder="_runtime/control/runtime_overrides.json"
          />
        </SettingRow>
        <AdvancedSettingsBlock title="S3 and Cloud Integrations" count={8}>
          <SettingRow label="Mirror To S3" tip={`${OUTPUT_PHASE_TIP}\nLives in: post-run artifact mirroring.\nWhat this controls: whether output artifacts are copied to the configured S3 destination paths.`}>
            <SettingToggle
              checked={runtimeDraft.mirrorToS3}
              onChange={(next) => updateDraft('mirrorToS3', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="Mirror To S3 Input" tip={`${OUTPUT_PHASE_TIP}\nLives in: input fixture mirroring.\nWhat this controls: whether locally sourced input fixtures are mirrored to the configured S3 input prefix.`}>
            <SettingToggle
              checked={runtimeDraft.mirrorToS3Input}
              onChange={(next) => updateDraft('mirrorToS3Input', next)}
              disabled={!runtimeSettingsReady}
            />
          </SettingRow>
          <SettingRow label="S3 Input Prefix" tip={`${OUTPUT_PHASE_TIP}\nLives in: S3 input destination resolution.\nWhat this controls: the prefix used when mirrored input assets are written to S3.`}>
            <input
              type="text"
              value={runtimeDraft.s3InputPrefix}
              onChange={(event) => updateDraft('s3InputPrefix', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="S3 Output Prefix" tip={`${OUTPUT_PHASE_TIP}\nLives in: S3 output destination resolution.\nWhat this controls: the prefix used when output artifacts are mirrored to S3.`}>
            <input
              type="text"
              value={runtimeDraft.s3OutputPrefix}
              onChange={(event) => updateDraft('s3OutputPrefix', event.target.value)}
              disabled={!runtimeSettingsReady}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="AWS Region" tip={`${OUTPUT_PHASE_TIP}\nLives in: shared storage configuration.\nWhat this controls: the AWS region token used for S3 and related integrations.`} description="Configured on Storage tab.">
            <span className="sf-text-label">{storageAwsRegion || runtimeDraft.awsRegion || 'us-east-2'}</span>
          </SettingRow>
          <SettingRow label="S3 Bucket" tip={`${OUTPUT_PHASE_TIP}\nLives in: shared storage configuration.\nWhat this controls: the bucket name used for input and output mirroring.`} description="Configured on Storage tab.">
            <span className="sf-text-label">{storageS3Bucket || runtimeDraft.s3Bucket || '(not set)'}</span>
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>
    </>
  );
});
