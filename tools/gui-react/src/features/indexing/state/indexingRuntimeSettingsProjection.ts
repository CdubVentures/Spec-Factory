import type {
  RuntimeSettingDefaults,
} from '../../../stores/settingsManifest';
import {
  collectRuntimeFlowDraftPayload,
  normalizeRuntimeDraft,
  readRuntimeSettingsNumericBaseline,
  type RuntimeDraft,
  type RuntimeModelTokenDefaultsResolver,
  type RuntimeSettings,
  type RuntimeSettingsNumericBaseline,
} from '../../pipeline-settings';

export interface Phase05RuntimeSettings {
  perHostMinDelayMs: string;
}

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

function toDisplayString(value: number) {
  return String(value);
}

export function buildIndexingRuntimeDraft({
  runtimeSettings,
  runtimeBootstrap,
}: BuildIndexingRuntimeDraftInput): RuntimeDraft {
  return normalizeRuntimeDraft(runtimeSettings, runtimeBootstrap);
}

export function buildIndexingPhase05RuntimeSettings(
  runtimeDraft: RuntimeDraft,
): Phase05RuntimeSettings {
  return {
    perHostMinDelayMs: toDisplayString(runtimeDraft.perHostMinDelayMs),
  };
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
