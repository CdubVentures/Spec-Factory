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
