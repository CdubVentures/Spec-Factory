import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudioCompileReportsState,
} from './helpers/studioPageContractsHarness.js';

test('studio compile reports state keeps running, failed, and idle badges stable', async () => {
  const { deriveCompileReportsViewState } = await loadStudioCompileReportsState();

  const IDLE_CLASS =
    'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle';

  assert.deepEqual(
    deriveCompileReportsViewState({
      compileRunning: true,
      validateRunning: false,
      compileError: null,
      validateError: null,
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
      validateBadgeClass: IDLE_CLASS,
      artifactProgressLabel: 'Artifacts 1 of 9',
      artifactProgressPercent: 11,
    },
  );

  assert.deepEqual(
    deriveCompileReportsViewState({
      compileRunning: false,
      validateRunning: false,
      compileError: null,
      validateError: null,
      compilePending: false,
      compileIsError: true,
      compileErrorMessage: 'Compile failed (7)',
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
      validateBadgeClass: IDLE_CLASS,
      artifactProgressLabel: 'Artifacts 0 of 1',
      artifactProgressPercent: 0,
    },
  );

  assert.deepEqual(
    deriveCompileReportsViewState({
      compileRunning: false,
      validateRunning: false,
      compileError: null,
      validateError: null,
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
      compileBadgeClass: IDLE_CLASS,
      validateBadgeLabel: 'Validation idle',
      validateBadgeClass: IDLE_CLASS,
      artifactProgressLabel: 'Artifacts 0 of 1',
      artifactProgressPercent: 0,
    },
  );
});
