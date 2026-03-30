export type SaveStateKind = 'idle' | 'ok' | 'partial' | 'error';
export type SourceStrategySaveKind = 'idle' | 'ok' | 'error';
export type StudioAutoSaveStatus = 'idle' | 'saved';

export interface SourceStrategySaveState {
  kind: SourceStrategySaveKind;
  message: string;
}

export interface StudioSaveStatusPresentation {
  label: string;
  dot: string;
  text: string;
  border: string;
}

interface IndexedSettingsStatusTextOptions {
  isSaving: boolean;
  isLocked?: boolean;
  loadingLabel?: string;
  saveState: SaveStateKind;
  saveMessage: string;
  dirty: boolean;
  autoSaveEnabled?: boolean;
  dirtyLabel: string;
  dirtyAutoSaveLabel?: string;
  failureLabel: string;
  successLabel: string;
}

export function resolveIndexedSettingsStatusText({
  isSaving,
  isLocked = false,
  loadingLabel = '',
  saveState,
  saveMessage,
  dirty,
  autoSaveEnabled = false,
  dirtyLabel,
  dirtyAutoSaveLabel = dirtyLabel,
  failureLabel,
  successLabel,
}: IndexedSettingsStatusTextOptions): string {
  if (isSaving) return 'Saving...';
  if (isLocked && loadingLabel) return loadingLabel;
  if (saveState === 'error') return saveMessage || failureLabel;
  if (saveState === 'partial') return saveMessage;
  if (dirty) return autoSaveEnabled ? dirtyAutoSaveLabel : dirtyLabel;
  if (saveState === 'ok') return saveMessage || successLabel;
  return successLabel;
}

export function resolveLlmSettingsStatusText({
  isSaving,
  saveState,
  saveMessage,
  llmHydrated,
  dirty,
  autoSaveEnabled,
  lastSavedAt = '',
}: {
  isSaving: boolean;
  saveState: SaveStateKind;
  saveMessage: string;
  llmHydrated: boolean;
  dirty: boolean;
  autoSaveEnabled: boolean;
  lastSavedAt?: string | null;
}): string {
  const base = isSaving
    ? 'Saving...'
    : saveState === 'error' || saveState === 'partial'
      ? saveMessage
      : !llmHydrated
        ? 'Loading persisted LLM settings...'
        : dirty
          ? (autoSaveEnabled ? 'Unsaved (Auto-Save Pending).' : 'Unsaved changes.')
          : 'All changes saved.';
  return lastSavedAt ? `${base} Last save: ${lastSavedAt}` : base;
}

export function resolveSourceStrategyStatus({
  isSaving,
  saveState,
}: {
  isSaving: boolean;
  saveState: SourceStrategySaveState;
}): { className: string; text: string } | null {
  if (isSaving) {
    return {
      className: 'sf-status-text-info sf-text-label font-semibold',
      text: 'Updating...',
    };
  }
  if (saveState.kind === 'error') {
    return {
      className: 'sf-status-text-danger sf-text-label font-semibold',
      text: saveState.message,
    };
  }
  if (saveState.kind === 'ok') {
    return {
      className: 'sf-status-text-muted sf-text-label font-semibold',
      text: saveState.message,
    };
  }
  return null;
}

export function resolveStudioSaveStatus({
  isSaving,
  isError,
  errorMessage,
  initialized,
  hasUnsavedChanges,
  autoSaveEnabled,
  autoSaveStatus,
}: {
  isSaving: boolean;
  isError: boolean;
  errorMessage?: string;
  initialized: boolean;
  hasUnsavedChanges: boolean;
  autoSaveEnabled: boolean;
  autoSaveStatus: StudioAutoSaveStatus;
}): StudioSaveStatusPresentation | null {
  if (isSaving) {
    return {
      label: 'Saving...',
      dot: 'sf-dot-neutral',
      text: 'sf-text-muted',
      border: 'sf-state-border-neutral-soft',
    };
  }
  if (isError) {
    return {
      label: errorMessage || 'Save failed',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    };
  }
  if (!initialized) {
    return null;
  }
  if (hasUnsavedChanges) {
    return {
      label: autoSaveEnabled ? 'Unsaved (Auto-Save Pending)' : 'Unsaved',
      dot: 'sf-dot-warning',
      text: 'sf-status-text-warning',
      border: 'sf-state-border-warning-soft',
    };
  }
  if (autoSaveEnabled) {
    return {
      label: autoSaveStatus === 'saved' ? 'Auto-Saved' : 'Up to date',
      dot: 'sf-success-bg-500',
      text: 'sf-status-text-success',
      border: 'sf-state-border-success-soft',
    };
  }
  return {
    label: 'All saved',
    dot: 'sf-success-bg-500',
    text: 'sf-status-text-success',
    border: 'sf-state-border-success-soft',
  };
}
