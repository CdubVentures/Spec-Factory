import type { DownstreamSystem } from '../workbench/systemMapping.ts';

export function buildNextConsumerOverrides(
  currentConsumers: Record<string, Record<string, boolean>> | undefined,
  fieldPath: string,
  system: DownstreamSystem,
  enabled: boolean,
): Record<string, Record<string, boolean>> | undefined {
  const nextConsumers = { ...(currentConsumers || {}) };
  const fieldOverrides = { ...(nextConsumers[fieldPath] || {}) };

  if (enabled) {
    delete fieldOverrides[system];
  } else {
    fieldOverrides[system] = false;
  }

  if (Object.keys(fieldOverrides).length === 0) {
    delete nextConsumers[fieldPath];
  } else {
    nextConsumers[fieldPath] = fieldOverrides;
  }

  return Object.keys(nextConsumers).length > 0 ? nextConsumers : undefined;
}

export function shouldFlushStudioDocsOnUnmount({
  autoSaveEnabled,
  initialized,
  hydrated,
  authorityConflictVersion,
  isPending,
  nextFingerprint,
  lastSavedFingerprint,
}: {
  autoSaveEnabled: boolean;
  initialized: boolean;
  hydrated: boolean;
  authorityConflictVersion: string | number | boolean | null | undefined;
  isPending: boolean;
  nextFingerprint: string;
  lastSavedFingerprint: string;
}) {
  if (!autoSaveEnabled || !initialized || !hydrated || authorityConflictVersion || isPending) {
    return false;
  }
  if (!nextFingerprint) return false;
  return nextFingerprint !== lastSavedFingerprint;
}

export function shouldFlushStudioMapOnUnmount({
  autoSaveMapEnabled,
  mapHydrated,
  saving,
  nextFingerprint,
  lastSavedFingerprint,
}: {
  autoSaveMapEnabled: boolean;
  mapHydrated: boolean;
  saving: boolean;
  nextFingerprint: string;
  lastSavedFingerprint: string;
}) {
  if (!autoSaveMapEnabled || !mapHydrated || saving) {
    return false;
  }
  if (!nextFingerprint) return false;
  return nextFingerprint !== lastSavedFingerprint;
}

const STUDIO_DEFERRED_CONTRACT_LOCKED_FIELDS = new Set([
  'contract.unknown_token',
  'contract.rounding.mode',
  'contract.unknown_reason_required',
]);

export function isStudioContractFieldDeferredLocked(fieldPath: string) {
  return STUDIO_DEFERRED_CONTRACT_LOCKED_FIELDS.has(String(fieldPath || '').trim());
}
