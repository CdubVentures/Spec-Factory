import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function loadStudioPageDerivedState() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPageDerivedState.ts',
    {
      prefix: 'studio-page-derived-state-',
    },
  );
}

async function loadStudioPagePersistence() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/studioPagePersistence.ts',
    {
      prefix: 'studio-page-persistence-',
    },
  );
}

async function loadStudioCompileReportsState() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/state/compileReportsState.ts',
    {
      prefix: 'studio-compile-reports-state-',
    },
  );
}

test('studio page derived state exposes compile guardrail errors and warnings only from array payloads', async () => {
  const { deriveStudioPageRootDerivedState } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name', 'sku'],
      tooltipEntries: {},
      guardrails: {
        errors: ['Missing contract', 'Range mismatch'],
        warnings: ['Enum stale'],
      },
      knownValuesTabActive: false,
      knownValuesIsError: false,
      knownValuesErrorMessage: '',
    }),
    {
      compileErrors: ['Missing contract', 'Range mismatch'],
      compileWarnings: ['Enum stale'],
      tooltipCount: 0,
      tooltipCoverage: 0,
      knownValuesSpecDbNotReady: false,
    },
  );

  assert.deepEqual(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name'],
      tooltipEntries: {},
      guardrails: {
        errors: 'not-an-array',
        warnings: null,
      },
      knownValuesTabActive: false,
      knownValuesIsError: false,
      knownValuesErrorMessage: '',
    }),
    {
      compileErrors: [],
      compileWarnings: [],
      tooltipCount: 0,
      tooltipCoverage: 0,
      knownValuesSpecDbNotReady: false,
    },
  );
});

test('studio page derived state computes tooltip count and rounded coverage from field keys present in the tooltip bank', async () => {
  const { deriveStudioPageRootDerivedState } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name', 'sku', 'weight'],
      tooltipEntries: {
        name: { md: 'Tooltip' },
        sku: { md: 'Tooltip' },
        extra: { md: 'Ignored' },
      },
      knownValuesTabActive: false,
      knownValuesIsError: false,
      knownValuesErrorMessage: '',
    }),
    {
      compileErrors: [],
      compileWarnings: [],
      tooltipCount: 3,
      tooltipCoverage: 67,
      knownValuesSpecDbNotReady: false,
    },
  );

  assert.equal(
    deriveStudioPageRootDerivedState({
      fieldOrder: [],
      tooltipEntries: {
        name: { md: 'Tooltip' },
      },
      knownValuesTabActive: false,
      knownValuesIsError: false,
      knownValuesErrorMessage: '',
    }).tooltipCoverage,
    0,
  );
});

test('studio page derived state flags specdb not ready only for active known-values tabs with a 503 message', async () => {
  const { deriveStudioPageRootDerivedState } = await loadStudioPageDerivedState();

  assert.equal(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name'],
      tooltipEntries: {},
      knownValuesTabActive: true,
      knownValuesIsError: true,
      knownValuesErrorMessage: 'API 503 specdb_not_ready while syncing',
    }).knownValuesSpecDbNotReady,
    true,
  );

  assert.equal(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name'],
      tooltipEntries: {},
      knownValuesTabActive: true,
      knownValuesIsError: true,
      knownValuesErrorMessage: 'API 503 SpecDb not ready for category',
    }).knownValuesSpecDbNotReady,
    true,
  );

  assert.equal(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name'],
      tooltipEntries: {},
      knownValuesTabActive: false,
      knownValuesIsError: true,
      knownValuesErrorMessage: 'API 503 specdb_not_ready while syncing',
    }).knownValuesSpecDbNotReady,
    false,
  );

  assert.equal(
    deriveStudioPageRootDerivedState({
      fieldOrder: ['name'],
      tooltipEntries: {},
      knownValuesTabActive: true,
      knownValuesIsError: true,
      knownValuesErrorMessage: 'API 500 specdb_not_ready while syncing',
    }).knownValuesSpecDbNotReady,
    false,
  );
});

test('studio page compile status keeps running, errors, stale, and compiled precedence stable', async () => {
  const { deriveStudioCompileStatus } = await loadStudioPageDerivedState();

  const runningStatus = deriveStudioCompileStatus({
    mutationPending: true,
    mutationIsError: false,
    compileProcessRunning: false,
    compileProcessFailed: false,
  });
  assert.equal(runningStatus?.label.startsWith('Compiling'), true);
  assert.deepEqual(
    {
      dot: runningStatus?.dot,
      text: runningStatus?.text,
      border: runningStatus?.border,
    },
    {
      dot: 'sf-dot-neutral',
      text: 'sf-text-muted',
      border: 'sf-state-border-neutral-soft',
    },
  );

  assert.deepEqual(
    deriveStudioCompileStatus({
      mutationPending: false,
      mutationIsError: true,
      mutationErrorMessage: 'Compile failure message should truncate after thirty six chars',
      compileProcessRunning: false,
      compileProcessFailed: false,
    }),
    {
      label: 'Compile failure message should trunc',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    },
  );

  assert.deepEqual(
    deriveStudioCompileStatus({
      mutationPending: false,
      mutationIsError: false,
      compileProcessRunning: false,
      compileProcessFailed: true,
      processExitCode: 7,
    }),
    {
      label: 'Compile failed (7)',
      dot: 'sf-danger-bg-soft0',
      text: 'sf-status-text-danger',
      border: 'sf-state-border-danger-soft',
    },
  );

  assert.deepEqual(
    deriveStudioCompileStatus({
      mutationPending: false,
      mutationIsError: false,
      compileProcessRunning: false,
      compileProcessFailed: false,
      compileStale: true,
    }),
    {
      label: 'Not compiled',
      dot: 'sf-dot-warning',
      text: 'sf-status-text-warning',
      border: 'sf-state-border-warning-soft',
    },
  );

  assert.deepEqual(
    deriveStudioCompileStatus({
      mutationPending: false,
      mutationIsError: false,
      compileProcessRunning: false,
      compileProcessFailed: false,
      compileStale: false,
    }),
    {
      label: 'Compiled',
      dot: 'sf-success-bg-500',
      text: 'sf-status-text-success',
      border: 'sf-state-border-success-soft',
    },
  );

  assert.equal(
    deriveStudioCompileStatus({
      mutationPending: false,
      mutationIsError: false,
      compileProcessRunning: false,
      compileProcessFailed: false,
    }),
    null,
  );
});

test('studio page process state keeps compile and validate routing semantics stable', async () => {
  const { deriveStudioPageProcessState } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioPageProcessState({
      processCommand: 'category-compile --category keyboards',
      processRunning: true,
      processExitCode: null,
      compilePending: false,
      validatePending: false,
    }),
    {
      isCompileProcessCommand: true,
      isValidateProcessCommand: false,
      compileProcessRunning: true,
      compileProcessFailed: false,
      reportsTabRunning: true,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      processCommand: 'validate-rules --category keyboards',
      processRunning: true,
      processExitCode: null,
      compilePending: false,
      validatePending: false,
    }),
    {
      isCompileProcessCommand: false,
      isValidateProcessCommand: true,
      compileProcessRunning: false,
      compileProcessFailed: false,
      reportsTabRunning: true,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      processCommand: 'compile-rules --category keyboards',
      processRunning: false,
      processExitCode: 9,
      compilePending: false,
      validatePending: false,
    }),
    {
      isCompileProcessCommand: true,
      isValidateProcessCommand: false,
      compileProcessRunning: false,
      compileProcessFailed: true,
      reportsTabRunning: false,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      processCommand: 'sync-snapshots',
      processRunning: false,
      processExitCode: 0,
      compilePending: true,
      validatePending: false,
    }),
    {
      isCompileProcessCommand: false,
      isValidateProcessCommand: false,
      compileProcessRunning: false,
      compileProcessFailed: false,
      reportsTabRunning: true,
    },
  );
});

test('studio page enum lists prefer specdb enum lists and fall back to known field values', async () => {
  const { deriveStudioEnumListsWithValues } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioEnumListsWithValues({
      enum_lists: [
        { field: 'zeta', normalize: 'identity', values: ['B'] },
        { field: 'alpha', values: ['A', 7] },
        { field: '', values: ['ignored'] },
      ],
      fields: {
        fallback: ['unused'],
      },
    }),
    [
      { field: 'alpha', normalize: 'lower_trim', values: ['A', '7'] },
      { field: 'zeta', normalize: 'identity', values: ['B'] },
    ],
  );

  assert.deepEqual(
    deriveStudioEnumListsWithValues({
      fields: {
        zeta: ['B'],
        alpha: ['A', 7],
      },
    }),
    [
      { field: 'alpha', normalize: 'lower_trim', values: ['A', '7'] },
      { field: 'zeta', normalize: 'lower_trim', values: ['B'] },
    ],
  );

  assert.deepEqual(deriveStudioEnumListsWithValues(undefined), []);
});

test('studio page field rows preserve field order and resolve labels through the provided formatter', async () => {
  const { deriveStudioFieldRows } = await loadStudioPageDerivedState();

  assert.deepEqual(
    deriveStudioFieldRows({
      fieldOrder: ['sku', 'weight'],
      rules: {
        sku: {
          group: 'identity',
          required_level: 'required',
          enum_name: 'SkuEnum',
          contract: {
            type: 'string',
          },
        },
        weight: {
          contract: {
            type: 'number',
            unit: 'g',
          },
        },
      },
      resolveLabel: (key) => `Label:${key}`,
    }),
    [
      {
        key: 'sku',
        label: 'Label:sku',
        group: 'identity',
        type: 'string',
        required: 'required',
        unit: '',
        enumName: 'SkuEnum',
      },
      {
        key: 'weight',
        label: 'Label:weight',
        group: '',
        type: 'number',
        required: '',
        unit: 'g',
        enumName: '',
      },
    ],
  );
});

test('studio page persistence strips transient edited flags without mutating the source rules', async () => {
  const { stripEditedFlagFromRules } = await loadStudioPagePersistence();

  const sourceRules = {
    sku: {
      _edited: true,
      required_level: 'required',
      ui: {
        label: 'SKU',
      },
    },
  };

  const stripped = stripEditedFlagFromRules(sourceRules);

  assert.deepEqual(stripped, {
    sku: {
      required_level: 'required',
      ui: {
        label: 'SKU',
      },
    },
  });
  assert.equal(Object.prototype.hasOwnProperty.call(sourceRules.sku, '_edited'), true);
});

test('studio page persistence builds a rename-aware autosave payload from the field-rules snapshot', async () => {
  const { buildStudioPersistMap } = await loadStudioPagePersistence();

  const payload = buildStudioPersistMap({
    baseMap: {
      version: 2,
      selected_keys: ['legacy_key'],
      field_overrides: {
        legacy_key: {
          enum_name: 'LegacyEnum',
        },
      },
      manual_enum_values: {
        legacy_key: ['Legacy'],
      },
      enum_lists: [
        {
          field: 'legacy_key',
          values: ['Legacy'],
        },
      ],
      data_lists: [
        {
          field: 'legacy_key',
          normalize: 'csv',
        },
      ],
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              {
                field_key: 'legacy_key',
              },
            ],
          },
        },
      ],
    },
    snapshot: {
      fieldOrder: ['__grp::identity', 'legacy_key', 'fresh_key'],
      rules: {
        legacy_key: {
          _edited: true,
          required_level: 'required',
        },
        fresh_key: {
          _edited: true,
          required_level: 'optional',
        },
      },
      renames: {
        legacy_key: 'modern_key',
      },
    },
  });

  assert.deepEqual(payload.selected_keys, ['modern_key', 'fresh_key']);
  assert.deepEqual(payload.field_overrides, {
    modern_key: {
      required_level: 'required',
    },
    fresh_key: {
      required_level: 'optional',
    },
  });
  assert.deepEqual(payload.manual_enum_values, {
    modern_key: ['Legacy'],
  });
  assert.deepEqual(payload.enum_lists, [
    {
      field: 'modern_key',
      values: ['Legacy'],
    },
  ]);
  assert.deepEqual(payload.data_lists, [
    {
      field: 'modern_key',
      normalize: 'csv',
    },
  ]);
  assert.deepEqual(payload.component_sources, [
    {
      component_type: 'sensor',
      roles: {
        properties: [
          {
            field_key: 'modern_key',
          },
        ],
      },
    },
  ]);
});

test('studio page persistence keeps autosave attempt gating stable for force and duplicate fingerprints', async () => {
  const { shouldPersistStudioDocsAttempt } = await loadStudioPagePersistence();

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'next-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    true,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'saved-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    false,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: false,
      nextFingerprint: 'attempt-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'attempt-docs',
    }),
    false,
  );

  assert.equal(
    shouldPersistStudioDocsAttempt({
      force: true,
      nextFingerprint: 'saved-docs',
      lastSavedFingerprint: 'saved-docs',
      lastAttemptFingerprint: 'saved-docs',
    }),
    true,
  );
});

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

test('studio compile reports state keeps running, failed, and completion badges stable', async () => {
  const { deriveCompileReportsViewState } = await loadStudioCompileReportsState();

  assert.deepEqual(
    deriveCompileReportsViewState({
      processCommand: 'compile-rules --category keyboards',
      processRunning: true,
      processExitCode: null,
      processStartedAt: '',
      compilePending: false,
      compileIsError: false,
      validatePending: false,
      validateIsError: false,
      artifacts: [],
      progressTick: 4,
      nowMs: 2_000,
    }),
    {
      compileProcessRunning: true,
      validateProcessRunning: false,
      anyProcessRunning: true,
      progressActive: true,
      compileBadgeLabel: 'Compile running',
      compileBadgeClass: 'sf-callout sf-callout-info',
      validateBadgeLabel: 'Validation idle',
      validateBadgeClass:
        'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle',
      artifactProgressLabel: 'Artifacts 1 of 10',
      artifactProgressPercent: 10,
    },
  );

  assert.deepEqual(
    deriveCompileReportsViewState({
      processCommand: 'category-compile --category keyboards',
      processRunning: false,
      processExitCode: 7,
      processStartedAt: '',
      compilePending: false,
      compileIsError: false,
      validatePending: false,
      validateIsError: false,
      artifacts: [],
      progressTick: 0,
      nowMs: 0,
    }),
    {
      compileProcessRunning: false,
      validateProcessRunning: false,
      anyProcessRunning: false,
      progressActive: false,
      compileBadgeLabel: 'Compile failed (7)',
      compileBadgeClass: 'sf-callout sf-callout-danger',
      validateBadgeLabel: 'Validation idle',
      validateBadgeClass:
        'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle',
      artifactProgressLabel: 'Artifacts 0 of 10',
      artifactProgressPercent: 0,
    },
  );

  assert.deepEqual(
    deriveCompileReportsViewState({
      processCommand: 'validate-rules --category keyboards',
      processRunning: false,
      processExitCode: 0,
      processStartedAt: '',
      compilePending: false,
      compileIsError: false,
      validatePending: false,
      validateIsError: false,
      artifacts: [],
      progressTick: 0,
      nowMs: 0,
    }),
    {
      compileProcessRunning: false,
      validateProcessRunning: false,
      anyProcessRunning: false,
      progressActive: false,
      compileBadgeLabel: 'Compile idle',
      compileBadgeClass:
        'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle',
      validateBadgeLabel: 'Validation complete',
      validateBadgeClass: 'sf-callout sf-callout-success',
      artifactProgressLabel: 'Artifacts 0 of 10',
      artifactProgressPercent: 0,
    },
  );
});
