interface RuntimeFlowHeaderControlsProps {
  runtimeSettingsReady: boolean;
  runtimeSettingsSaving: boolean;
  runtimeAutoSaveEnabled?: boolean;
  runtimeAutoSaveDelaySeconds: string;
  onSaveNow: () => void;
  onToggleRuntimeAutoSaveEnabled?: () => void;
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
  // WHY: When onToggleRuntimeAutoSaveEnabled is absent the caller has hard-wired
  // autosave (e.g. LlmConfigPage). Treat autosave as always-on for Save button state.
  const showToggle = typeof onToggleRuntimeAutoSaveEnabled === 'function';
  const effectiveAutoSave = showToggle ? Boolean(runtimeAutoSaveEnabled) : true;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={onSaveNow}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving}
        className={`rounded px-3 py-1.5 sf-text-label disabled:opacity-50 ${
          effectiveAutoSave
            ? 'sf-icon-button'
            : 'sf-primary-button'
        }`}
      >
        {runtimeSettingsSaving ? 'Saving...' : effectiveAutoSave ? 'Save Now' : 'Save'}
      </button>
      {showToggle && (
        <button
          onClick={onToggleRuntimeAutoSaveEnabled}
          disabled={!runtimeSettingsReady}
          className={`rounded px-3 py-1.5 sf-text-label ${
            effectiveAutoSave
              ? 'sf-primary-button'
              : 'sf-action-button'
          }`}
          title={`When enabled, runtime settings are Auto-Saved ${runtimeAutoSaveDelaySeconds} seconds after each edit.`}
        >
          {effectiveAutoSave ? 'Auto-Save On' : 'Auto-Save Off'}
        </button>
      )}
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
