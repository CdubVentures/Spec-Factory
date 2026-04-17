import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadSettingsStatusModule() {
  return loadBundledModule(
    'tools/gui-react/src/shared/ui/feedback/settingsStatus.ts',
    { prefix: 'settings-status-contract-' },
  );
}

test('indexed runtime status text keeps error and partial ahead of dirty labels', async () => {
  const { resolveIndexedSettingsStatusText } = await loadSettingsStatusModule();

  assert.equal(
    resolveIndexedSettingsStatusText({
      isSaving: false,
      isLocked: false,
      saveState: 'error',
      saveMessage: 'Runtime save failed.',
      dirty: true,
      autoSaveEnabled: true,
      dirtyLabel: 'Unsaved',
      dirtyAutoSaveLabel: 'Unsaved (Auto-Save Pending)',
      failureLabel: 'Failed to save runtime settings.',
      successLabel: 'All Changes Saved.',
    }),
    'Runtime save failed.',
  );

  assert.equal(
    resolveIndexedSettingsStatusText({
      isSaving: false,
      saveState: 'partial',
      saveMessage: 'Settings applied with warnings.',
      dirty: true,
      dirtyLabel: 'Unsaved',
      failureLabel: 'Failed to save settings.',
      successLabel: 'All Changes Saved.',
    }),
    'Settings applied with warnings.',
  );

  assert.equal(
    resolveIndexedSettingsStatusText({
      isSaving: false,
      isLocked: true,
      loadingLabel: 'loading persisted runtime settings...',
      saveState: 'idle',
      saveMessage: '',
      dirty: false,
      autoSaveEnabled: false,
      dirtyLabel: 'Unsaved',
      dirtyAutoSaveLabel: 'Unsaved (Auto-Save Pending)',
      failureLabel: 'Failed to save runtime settings.',
      successLabel: 'All Changes Saved.',
    }),
    'loading persisted runtime settings...',
  );

  assert.equal(
    resolveIndexedSettingsStatusText({
      isSaving: false,
      saveState: 'idle',
      saveMessage: '',
      dirty: true,
      autoSaveEnabled: true,
      dirtyLabel: 'Unsaved',
      dirtyAutoSaveLabel: 'Unsaved (Auto-Save Pending)',
      failureLabel: 'Failed to save runtime settings.',
      successLabel: 'All Changes Saved.',
    }),
    'Unsaved (Auto-Save Pending)',
  );
});

test('source strategy status helpers keep persistence outcomes ahead of generic idle labels', async () => {
  const {
    resolveSourceStrategyStatus,
  } = await loadSettingsStatusModule();

  assert.deepEqual(
    resolveSourceStrategyStatus({
      isSaving: false,
      saveState: { kind: 'ok', message: 'Source strategy updated.' },
    }),
    {
      className: 'sf-status-text-muted sf-text-label font-semibold',
      text: 'Source strategy updated.',
    },
  );
});

test('studio save status helper prioritizes saving and errors ahead of unsaved or autosave-idle labels', async () => {
  const { resolveStudioSaveStatus } = await loadSettingsStatusModule();

  assert.deepEqual(
    resolveStudioSaveStatus({
      isSaving: true,
      isError: false,
      initialized: true,
      hasUnsavedChanges: true,
      autoSaveEnabled: true,
      autoSaveStatus: 'idle',
    }),
    {
      label: 'Saving...',
      dot: 'sf-dot-neutral',
      text: 'sf-text-muted',
      border: 'sf-state-border-neutral-soft',
    },
  );

  assert.deepEqual(
    resolveStudioSaveStatus({
      isSaving: false,
      isError: true,
      errorMessage: 'Save failed badly',
      initialized: true,
      hasUnsavedChanges: true,
      autoSaveEnabled: true,
      autoSaveStatus: 'idle',
    }),
    {
      label: 'Save failed badly',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    },
  );

  assert.deepEqual(
    resolveStudioSaveStatus({
      isSaving: false,
      isError: false,
      initialized: true,
      hasUnsavedChanges: true,
      autoSaveEnabled: true,
      autoSaveStatus: 'idle',
    }),
    {
      label: 'Unsaved (Auto-Save Pending)',
      dot: 'sf-dot-warning',
      text: 'sf-status-text-warning',
      border: 'sf-state-border-warning-soft',
    },
  );
});
