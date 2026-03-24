import type {
  RuntimeSettingDefaults,
} from '../../../stores/settingsManifest.ts';
import {
  collectRuntimeFlowDraftPayload,
  normalizeRuntimeDraft,
  readRuntimeSettingsNumericBaseline,
  type RuntimeDraft,
  type RuntimeModelTokenDefaultsResolver,
  type RuntimeSettings,
  type RuntimeSettingsNumericBaseline,
} from '../../pipeline-settings/index.ts';

export interface Phase05RuntimeSettings {}

interface BuildIndexingRuntimeDraftInput {
  runtimeSettings: RuntimeSettings | undefined;
  runtimeBootstrap: RuntimeSettingDefaults;
}

interface BuildIndexingRuntimeSettingsProjectionInput
  extends BuildIndexingRuntimeDraftInput {
  runtimeManifestDefaults: RuntimeDraft;
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver;
}

interface IndexingRuntimeSettingsProjection {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsPayload: RuntimeSettings;
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  phase05RuntimeSettings: Phase05RuntimeSettings;
}

export function buildIndexingRuntimeDraft({
  runtimeSettings,
  runtimeBootstrap,
}: BuildIndexingRuntimeDraftInput): RuntimeDraft {
  return normalizeRuntimeDraft(runtimeSettings, runtimeBootstrap);
}

export function buildIndexingPhase05RuntimeSettings(
  _runtimeDraft: RuntimeDraft,
): Phase05RuntimeSettings {
  return {};
}

export function buildIndexingRuntimeSettingsProjection({
  runtimeSettings,
  runtimeBootstrap,
  runtimeManifestDefaults,
  resolveModelTokenDefaults,
}: BuildIndexingRuntimeSettingsProjectionInput): IndexingRuntimeSettingsProjection {
  const runtimeDraft = buildIndexingRuntimeDraft({
    runtimeSettings,
    runtimeBootstrap,
  });
  const runtimeSettingsPayload = collectRuntimeFlowDraftPayload({
    nextRuntimeDraft: runtimeDraft,
    runtimeManifestDefaults,
    resolveModelTokenDefaults,
  });
  const runtimeSettingsBaseline = readRuntimeSettingsNumericBaseline(
    runtimeSettingsPayload,
    readRuntimeSettingsNumericBaseline(runtimeBootstrap),
  );

  return {
    runtimeDraft,
    runtimeSettingsPayload,
    runtimeSettingsBaseline,
    phase05RuntimeSettings: buildIndexingPhase05RuntimeSettings(runtimeDraft),
  };
}
