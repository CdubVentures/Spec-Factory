import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudioCompileReportsState,
} from './helpers/studioPageContractsHarness.js';

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
