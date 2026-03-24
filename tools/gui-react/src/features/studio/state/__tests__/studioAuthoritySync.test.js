import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideStudioAuthorityAction,
  shouldOpenStudioAuthorityConflict,
} from '../authoritySync.js';

test('studio authority: category switch resets and hydrates from server snapshot', () => {
  const result = decideStudioAuthorityAction({
    category: 'keyboard',
    previousCategory: 'mouse',
    initialized: true,
    hasServerRules: true,
    hasUnsavedEdits: false,
    previousVersion: 'v1',
    nextVersion: 'v2',
  });

  assert.equal(result.resetStore, true);
  assert.equal(result.hydrate, true);
  assert.equal(result.rehydrate, false);
  assert.equal(result.conflict, false);
});

test('studio authority: first load hydrates when initialized is false', () => {
  const result = decideStudioAuthorityAction({
    category: 'mouse',
    previousCategory: 'mouse',
    initialized: false,
    hasServerRules: true,
    hasUnsavedEdits: false,
    previousVersion: '',
    nextVersion: 'v1',
  });

  assert.equal(result.resetStore, false);
  assert.equal(result.hydrate, true);
  assert.equal(result.rehydrate, false);
  assert.equal(result.conflict, false);
});

test('studio authority: version change in same category rehydrates when no unsaved edits', () => {
  const result = decideStudioAuthorityAction({
    category: 'mouse',
    previousCategory: 'mouse',
    initialized: true,
    hasServerRules: true,
    hasUnsavedEdits: false,
    previousVersion: 'v1',
    nextVersion: 'v2',
  });

  assert.equal(result.resetStore, false);
  assert.equal(result.hydrate, false);
  assert.equal(result.rehydrate, true);
  assert.equal(result.conflict, false);
});

test('studio authority: version change with unsaved edits triggers conflict instead of rehydrate', () => {
  const result = decideStudioAuthorityAction({
    category: 'mouse',
    previousCategory: 'mouse',
    initialized: true,
    hasServerRules: true,
    hasUnsavedEdits: true,
    previousVersion: 'v1',
    nextVersion: 'v2',
  });

  assert.equal(result.resetStore, false);
  assert.equal(result.hydrate, false);
  assert.equal(result.rehydrate, false);
  assert.equal(result.conflict, true);
});

test('studio authority: no server rules means no action', () => {
  const result = decideStudioAuthorityAction({
    category: 'mouse',
    previousCategory: 'mouse',
    initialized: true,
    hasServerRules: false,
    hasUnsavedEdits: false,
    previousVersion: 'v1',
    nextVersion: 'v2',
  });

  assert.equal(result.resetStore, false);
  assert.equal(result.hydrate, false);
  assert.equal(result.rehydrate, false);
  assert.equal(result.conflict, false);
});

test('studio authority conflict helper: opens for new unresolved conflict version', () => {
  const shouldOpen = shouldOpenStudioAuthorityConflict({
    conflict: true,
    nextVersion: 'v2',
    pendingVersion: '',
    ignoredVersion: '',
  });

  assert.equal(shouldOpen, true);
});

test('studio authority conflict helper: does not re-open for already pending version', () => {
  const shouldOpen = shouldOpenStudioAuthorityConflict({
    conflict: true,
    nextVersion: 'v2',
    pendingVersion: 'v2',
    ignoredVersion: '',
  });

  assert.equal(shouldOpen, false);
});

test('studio authority conflict helper: does not re-open for ignored version', () => {
  const shouldOpen = shouldOpenStudioAuthorityConflict({
    conflict: true,
    nextVersion: 'v2',
    pendingVersion: '',
    ignoredVersion: 'v2',
  });

  assert.equal(shouldOpen, false);
});
