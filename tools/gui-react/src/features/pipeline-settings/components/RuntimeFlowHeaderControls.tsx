interface RuntimeFlowHeaderControlsProps {
  runtimeSettingsReady: boolean;
  runtimeSettingsSaving: boolean;
  runtimeAutoSaveEnabled: boolean;
  runtimeAutoSaveDelaySeconds: string;
  onSaveNow: () => void;
  onToggleRuntimeAutoSaveEnabled: () => void;
  onResetToDefaults: () => void;
}

export function RuntimeFlowHeaderControls({
  runtimeSettingsReady,
  runtimeSettingsSaving,
  runtimeAutoSaveEnabled,
  runtimeAutoSaveDelaySeconds,
  onSaveNow,
  onToggleRuntimeAutoSaveEnabled,
  onResetToDefaults,
}: RuntimeFlowHeaderControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onSaveNow}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving || runtimeAutoSaveEnabled}
        className={`rounded px-3 py-1.5 sf-text-label disabled:opacity-50 ${
          runtimeAutoSaveEnabled
            ? 'sf-icon-button'
            : 'sf-primary-button'
        }`}
      >
        {runtimeSettingsSaving ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={onToggleRuntimeAutoSaveEnabled}
        disabled={!runtimeSettingsReady}
        className={`rounded px-3 py-1.5 sf-text-label ${
          runtimeAutoSaveEnabled
            ? 'sf-primary-button'
            : 'sf-action-button'
        }`}
        title={`When enabled, runtime settings are Auto-Saved ${runtimeAutoSaveDelaySeconds} seconds after each edit.`}
      >
        {runtimeAutoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'}
      </button>
      <button
        onClick={onResetToDefaults}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving}
        className="rounded sf-danger-button px-3 py-1.5 sf-text-label disabled:opacity-50"
        title="Reset all runtime settings to default values."
      >
        Reset
      </button>
    </div>
  );
}
