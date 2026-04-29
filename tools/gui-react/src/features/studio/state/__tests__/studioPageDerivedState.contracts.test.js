import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudioPageDerivedState,
} from './helpers/studioPageContractsHarness.js';

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
      compileRunning: true,
      validateRunning: false,
      compileError: null,
      compilePending: false,
      validatePending: false,
    }),
    {
      compileProcessRunning: true,
      compileProcessFailed: false,
      reportsTabRunning: true,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      compileRunning: false,
      validateRunning: true,
      compileError: null,
      compilePending: false,
      validatePending: false,
    }),
    {
      compileProcessRunning: false,
      compileProcessFailed: false,
      reportsTabRunning: true,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      compileRunning: false,
      validateRunning: false,
      compileError: 'exit code 9',
      compilePending: false,
      validatePending: false,
    }),
    {
      compileProcessRunning: false,
      compileProcessFailed: true,
      reportsTabRunning: false,
    },
  );

  assert.deepEqual(
    deriveStudioPageProcessState({
      compileRunning: false,
      validateRunning: false,
      compileError: null,
      compilePending: true,
      validatePending: false,
    }),
    {
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
      { field: 'alpha', values: ['A', '7'] },
      { field: 'zeta', values: ['B'] },
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
      { field: 'alpha', values: ['A', '7'] },
      { field: 'zeta', values: ['B'] },
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
      },
      {
        key: 'weight',
        label: 'Label:weight',
        group: '',
        type: 'number',
        required: '',
        unit: 'g',
      },
    ],
  );
});
