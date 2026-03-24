import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadSettingsStatusModule() {
  const esbuild = await import('esbuild');
  const entryPath = path.resolve(
    __dirname,
    '../../../../../../..',
    'tools',
    'gui-react',
    'src',
    'shared',
    'ui',
    'feedback',
    'settingsStatus.ts',
  );
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    loader: { '.ts': 'ts' },
  });
  const code = result.outputFiles[0].text;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-status-contract-'));
  const tmpFile = path.join(tmpDir, 'settingsStatus.mjs');
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    return await import(`file://${tmpFile.replace(/\\/g, '/')}?v=${Date.now()}-${Math.random()}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

test('indexed runtime and convergence status text keeps error and partial ahead of dirty labels', async () => {
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
      saveMessage: 'Convergence applied with warnings.',
      dirty: true,
      dirtyLabel: 'Unsaved',
      failureLabel: 'Failed to save convergence settings.',
      successLabel: 'All Changes Saved.',
    }),
    'Convergence applied with warnings.',
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

test('storage and llm status helpers distinguish autosave-pending dirty state from clean state', async () => {
  const {
    resolveStorageSettingsStatusText,
    resolveLlmSettingsStatusText,
  } = await loadSettingsStatusModule();

  assert.equal(
    resolveStorageSettingsStatusText({
      isSaving: false,
      statusKind: '',
      statusText: '',
      storageSettingsReady: true,
      dirty: true,
      autoSaveEnabled: true,
    }),
    'Unsaved changes queued for auto save.',
  );

  assert.equal(
    resolveStorageSettingsStatusText({
      isSaving: false,
      statusKind: 'ok',
      statusText: '',
      storageSettingsReady: true,
      dirty: false,
      autoSaveEnabled: false,
    }),
    'Storage settings saved.',
  );

  assert.equal(
    resolveLlmSettingsStatusText({
      isSaving: false,
      saveState: 'partial',
      saveMessage: 'Saved with rejected routes.',
      llmHydrated: true,
      dirty: true,
      autoSaveEnabled: true,
      lastSavedAt: '12:34',
    }),
    'Saved with rejected routes. Last save: 12:34',
  );

  assert.equal(
    resolveLlmSettingsStatusText({
      isSaving: false,
      saveState: 'idle',
      saveMessage: '',
      llmHydrated: true,
      dirty: true,
      autoSaveEnabled: true,
    }),
    'Unsaved (Auto-Save Pending).',
  );
});

test('pipeline and source strategy status helpers keep persistence outcomes ahead of generic idle labels', async () => {
  const {
    resolvePipelineConvergenceStatusText,
    resolvePipelineConvergenceStatusClass,
    resolveSourceStrategyStatus,
  } = await loadSettingsStatusModule();

  assert.equal(
    resolvePipelineConvergenceStatusText({
      isSaving: false,
      saveState: 'error',
      saveMessage: 'Convergence save failed.',
      dirty: true,
    }),
    'Convergence save failed.',
  );

  assert.equal(
    resolvePipelineConvergenceStatusClass({
      isSaving: false,
      saveState: 'partial',
      dirty: true,
    }),
    'sf-status-text-warning',
  );

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
