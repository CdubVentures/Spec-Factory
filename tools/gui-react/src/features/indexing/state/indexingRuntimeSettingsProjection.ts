import type {
  RuntimeOcrBackend,
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
  fetchConcurrency: string;
  perHostMinDelayMs: string;
  dynamicCrawleeEnabled: boolean;
  dynamicFetchRetryBudget: string;
  dynamicFetchRetryBackoffMs: string;
  scannedPdfOcrEnabled: boolean;
  scannedPdfOcrPromoteCandidates: boolean;
  scannedPdfOcrBackend: RuntimeOcrBackend;
  scannedPdfOcrMaxPages: string;
  scannedPdfOcrMaxPairs: string;
  scannedPdfOcrMinCharsPerPage: string;
  scannedPdfOcrMinLinesPerPage: string;
  scannedPdfOcrMinConfidence: string;
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
    fetchConcurrency: toDisplayString(runtimeDraft.fetchConcurrency),
    perHostMinDelayMs: toDisplayString(runtimeDraft.perHostMinDelayMs),
    dynamicCrawleeEnabled: runtimeDraft.dynamicCrawleeEnabled,
    dynamicFetchRetryBudget: toDisplayString(runtimeDraft.dynamicFetchRetryBudget),
    dynamicFetchRetryBackoffMs: toDisplayString(runtimeDraft.dynamicFetchRetryBackoffMs),
    scannedPdfOcrEnabled: runtimeDraft.scannedPdfOcrEnabled,
    scannedPdfOcrPromoteCandidates: runtimeDraft.scannedPdfOcrPromoteCandidates,
    scannedPdfOcrBackend: runtimeDraft.scannedPdfOcrBackend,
    scannedPdfOcrMaxPages: toDisplayString(runtimeDraft.scannedPdfOcrMaxPages),
    scannedPdfOcrMaxPairs: toDisplayString(runtimeDraft.scannedPdfOcrMaxPairs),
    scannedPdfOcrMinCharsPerPage: toDisplayString(runtimeDraft.scannedPdfOcrMinCharsPerPage),
    scannedPdfOcrMinLinesPerPage: toDisplayString(runtimeDraft.scannedPdfOcrMinLinesPerPage),
    scannedPdfOcrMinConfidence: toDisplayString(runtimeDraft.scannedPdfOcrMinConfidence),
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
