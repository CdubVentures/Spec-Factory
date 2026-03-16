interface RuntimeFlowStatusInput {
  runtimeSettingsSaving: boolean;
  runtimeSettingsReady: boolean;
  runtimeSaveState: 'idle' | 'saving' | 'ok' | 'error' | 'partial';
  runtimeSaveMessage: string;
  runtimeDirty: boolean;
  runtimeAutoSaveEnabled: boolean;
  runtimeAutoSaveDelaySeconds: string;
}

interface RuntimeFlowStatusResult {
  runtimeStatusClass: string;
  runtimeStatusText: string;
}

export function deriveRuntimeFlowStatus({
  runtimeSettingsSaving,
  runtimeSettingsReady,
  runtimeSaveState,
  runtimeSaveMessage,
  runtimeDirty,
  runtimeAutoSaveEnabled,
  runtimeAutoSaveDelaySeconds,
}: RuntimeFlowStatusInput): RuntimeFlowStatusResult {
  const runtimeStatusClass = runtimeSettingsSaving
    ? 'sf-status-text-info'
    : !runtimeSettingsReady
      ? 'sf-status-text-warning'
      : runtimeSaveState === 'error'
        ? 'sf-status-text-danger'
        : runtimeSaveState === 'partial'
          ? 'sf-status-text-warning'
          : runtimeDirty
            ? 'sf-status-text-warning'
            : 'sf-status-text-muted';

  const runtimeStatusText = runtimeSettingsSaving
    ? 'Saving runtime settings...'
    : !runtimeSettingsReady
      ? 'Loading persisted runtime settings...'
      : runtimeSaveState === 'error'
        ? (runtimeSaveMessage || 'Runtime settings save failed.')
        : runtimeSaveState === 'partial'
          ? runtimeSaveMessage
          : runtimeDirty
            ? (runtimeAutoSaveEnabled
              ? `Unsaved changes queued for auto save (${runtimeAutoSaveDelaySeconds}s).`
              : 'Unsaved changes.')
            : runtimeSaveState === 'ok'
              ? (runtimeSaveMessage || 'All changes saved.')
              : 'All changes saved.';

  return {
    runtimeStatusClass,
    runtimeStatusText,
  };
}
