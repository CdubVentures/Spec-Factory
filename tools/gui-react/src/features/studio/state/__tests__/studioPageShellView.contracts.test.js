import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudioPageDerivedState,
} from './helpers/studioPageContractsHarness.js';

test('studio page shell state keeps fallback labels, dots, and summary counts stable', async () => {
  const { deriveStudioPageShellState } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioPageShellState({
      fieldCount: 12,
      compileErrorsCount: 3,
      compileWarningsCount: 4,
      saveStatus: null,
      compileStatus: null,
    }),
    {
      fieldCount: 12,
      compileErrorsCount: 3,
      compileWarningsCount: 4,
      saveStatusLabel: 'All saved',
      saveStatusDot: 'sf-success-bg-500',
      compileStatusLabel: 'Compiled',
      compileStatusDot: 'sf-success-bg-500',
    },
  );

  assert.deepEqual(
    deriveStudioPageShellState({
      fieldCount: 8,
      compileErrorsCount: 0,
      compileWarningsCount: 1,
      saveStatus: {
        label: 'Unsaved',
        dot: 'sf-dot-warning',
        text: 'sf-status-text-warning',
        border: 'sf-state-border-warning-soft',
      },
      compileStatus: {
        label: 'Not compiled',
        dot: 'sf-dot-warning',
        text: 'sf-status-text-warning',
        border: 'sf-state-border-warning-soft',
      },
    }),
    {
      fieldCount: 8,
      compileErrorsCount: 0,
      compileWarningsCount: 1,
      saveStatusLabel: 'Unsaved',
      saveStatusDot: 'sf-dot-warning',
      compileStatusLabel: 'Not compiled',
      compileStatusDot: 'sf-dot-warning',
    },
  );
});

test('studio page view state keeps active-tab, autosave, and store-selection rules stable', async () => {
  const { deriveStudioPageViewState } = await loadStudioPageDerivedState();

  const serverRules = {
    sku: {
      required_level: 'required',
    },
  };
  const serverFieldOrder = ['sku'];
  const editedRules = {
    sku: {
      _edited: true,
      required_level: 'optional',
    },
  };
  const editedFieldOrder = ['sku', 'weight'];

  assert.deepEqual(
    deriveStudioPageViewState({
      activeTab: 'mapping',
      autoSaveAllEnabled: false,
      autoSaveEnabled: true,
      autoSaveMapEnabled: false,
      initialized: false,
      groupsDirty: false,
      serverRules,
      serverFieldOrder,
      editedRules,
      editedFieldOrder,
    }),
    {
      knownValuesTabActive: true,
      effectiveAutoSaveEnabled: true,
      effectiveAutoSaveMapEnabled: false,
      storeRules: serverRules,
      storeFieldOrder: serverFieldOrder,
      hasUnsavedChanges: true,
    },
  );

  assert.deepEqual(
    deriveStudioPageViewState({
      activeTab: 'reports',
      autoSaveAllEnabled: true,
      autoSaveEnabled: false,
      autoSaveMapEnabled: false,
      initialized: true,
      groupsDirty: false,
      serverRules,
      serverFieldOrder,
      editedRules,
      editedFieldOrder,
    }),
    {
      knownValuesTabActive: false,
      effectiveAutoSaveEnabled: true,
      effectiveAutoSaveMapEnabled: true,
      storeRules: editedRules,
      storeFieldOrder: editedFieldOrder,
      hasUnsavedChanges: true,
    },
  );
});

test('hasUnsavedChanges detects group-only changes via groupsDirty flag', async () => {
  const { deriveStudioPageViewState } = await loadStudioPageDerivedState();

  const cleanRules = { dpi: { required_level: 'required' } };
  const fieldOrder = ['__grp::sensor', 'dpi'];

  const dirty = deriveStudioPageViewState({
    activeTab: 'keys',
    autoSaveAllEnabled: false,
    autoSaveEnabled: false,
    autoSaveMapEnabled: false,
    initialized: true,
    groupsDirty: true,
    serverRules: cleanRules,
    serverFieldOrder: fieldOrder,
    editedRules: cleanRules,
    editedFieldOrder: fieldOrder,
  });
  assert.equal(dirty.hasUnsavedChanges, true, 'groupsDirty should flag unsaved');

  const clean = deriveStudioPageViewState({
    activeTab: 'keys',
    autoSaveAllEnabled: false,
    autoSaveEnabled: false,
    autoSaveMapEnabled: false,
    initialized: true,
    groupsDirty: false,
    serverRules: cleanRules,
    serverFieldOrder: fieldOrder,
    editedRules: cleanRules,
    editedFieldOrder: fieldOrder,
  });
  assert.equal(clean.hasUnsavedChanges, false, 'clean state should not be unsaved');
});
