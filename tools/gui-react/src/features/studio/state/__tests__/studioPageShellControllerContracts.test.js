import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPageShellControllerModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPageShellController.ts',
    {
      prefix: 'studio-page-shell-controller-',
    },
  );
}

function createBaseInput(overrides = {}) {
  return {
    category: 'mouse',
    isLoading: false,
    activeTab: 'keys',
    autoSaveAllEnabled: false,
    selectedKey: 'dpi',
    opsState: {
      compileRunning: true,
      validateRunning: false,
      compileError: null,
      validateError: null,
      anyStudioOpRunning: true,
    },
    processStatus: {
      running: true,
      command: 'compile-rules',
      exitCode: null,
    },
    rules: {
      dpi: {
        _edited: true,
      },
    },
    fieldOrder: ['dpi'],
    wbMap: {},
    tooltipEntries: {
      dpi: { md: 'Tooltip' },
    },
    tooltipFiles: ['tooltips.md'],
    guardrails: {
      errors: ['Missing contract'],
      warnings: ['Enum stale'],
    },
    compileStale: true,
    artifacts: [{ name: 'compile-report.json' }],
    knownValuesSource: {
      fields: {
        dpi: ['8000'],
      },
    },
    knownValuesIsError: true,
    knownValuesErrorMessage: 'API 503 specdb_not_ready while syncing',
    knownValuesTabActive: true,
    componentDb: {},
    componentSources: [],
    fieldRulesInitialized: true,
    authorityConflictVersion: 'auth-v2',
    authorityConflictDetectedAt: '2026-03-11T12:00:00.000Z',
    autoSaveStatus: 'saved',
    effectiveAutoSaveEnabled: true,
    effectiveAutoSaveMapEnabled: false,
    hasUnsavedChanges: true,
    saveMapMutState: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    },
    saveStudioDocsMutState: {
      isPending: false,
      isSuccess: true,
      isError: false,
      error: null,
    },
    compileMutState: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    },
    validateRulesMutState: {
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    },
    enumConsistencyMutState: {
      isPending: false,
    },
    setAutoSaveMapEnabled() {},
    setSelectedKey() {},
    saveFromStore() {},
    setAutoSaveEnabled() {},
    runEnumConsistency() {
      return Promise.resolve({ ok: true });
    },
    runCompileFromStudio() {},
    runValidate() {},
    ...overrides,
  };
}

test('studio page shell controller keeps category guard ahead of loading state', async () => {
  const {
    buildStudioPageShellControllerState,
    STUDIO_CATEGORY_GUARD_MESSAGE,
  } = await loadStudioPageShellControllerModule();

  assert.deepEqual(
    buildStudioPageShellControllerState(
      createBaseInput({
        category: 'all',
        isLoading: true,
      }),
    ),
    {
      kind: 'category_guard',
      message: STUDIO_CATEGORY_GUARD_MESSAGE,
    },
  );
});

test('studio page shell controller returns loading state for category-scoped fetches', async () => {
  const { buildStudioPageShellControllerState } =
    await loadStudioPageShellControllerModule();

  assert.deepEqual(
    buildStudioPageShellControllerState(
      createBaseInput({
        isLoading: true,
        processStatus: {
          running: false,
          command: '',
          exitCode: null,
        },
      }),
    ),
    {
      kind: 'loading',
    },
  );
});

test('studio page shell controller preserves ready-state shell wiring and active panel props', async () => {
  const { buildStudioPageShellControllerState } =
    await loadStudioPageShellControllerModule();

  const result = buildStudioPageShellControllerState(createBaseInput());
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') {
    throw new Error('expected ready state');
  }

  assert.deepEqual(result.shellState, {
    category: 'mouse',
    reportsTabRunning: true,
    fieldCount: 1,
    compileErrorsCount: 1,
    compileWarningsCount: 1,
    authorityConflictVersion: 'auth-v2',
    authorityConflictDetectedAt: '2026-03-11T12:00:00.000Z',
    saveStatusLabel: 'Unsaved (Auto-Save Pending)',
    saveStatusDot: 'sf-dot-warning',
    savePending: false,
    autoSaveAllEnabled: false,
    compileStatusLabel: 'Compiling…',
    compileStatusDot: 'sf-dot-neutral',
    compilePending: false,
    compileProcessRunning: true,
    processRunning: true,
  });

  assert.equal(result.activePanelProps.knownValuesSpecDbNotReady, true);
  assert.equal(result.activePanelProps.mappingTabProps.tooltipCoverage, 100);
  assert.deepEqual(result.activePanelProps.keyNavigatorTabProps.enumLists, [
    {
      field: 'dpi',
      values: ['8000'],
    },
  ]);
  assert.equal(
    result.activePanelProps.keyNavigatorTabProps.selectedKey,
    'dpi',
  );
  assert.deepEqual(result.activePanelProps.reportsTabProps.compileErrors, [
    'Missing contract',
  ]);
  assert.deepEqual(result.activePanelProps.reportsTabProps.compileWarnings, [
    'Enum stale',
  ]);
});
