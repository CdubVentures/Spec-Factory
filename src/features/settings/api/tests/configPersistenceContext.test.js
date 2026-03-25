import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createConfigPersistenceContext } from '../configPersistenceContext.js';
import {
  getSettingsPersistenceCountersSnapshot,
  resetSettingsPersistenceCounters,
} from '../../../../observability/settingsPersistenceCounters.js';

async function makeHelperRoot() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-factory-persistence-ctx-'));
  await fs.mkdir(path.join(tempRoot, '_runtime'), { recursive: true });
  return tempRoot;
}

test('createConfigPersistenceContext returns expected shape', () => {
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  assert.equal(typeof ctx.getUserSettingsState, 'function');
  assert.equal(typeof ctx.getUiSettingsState, 'function');
  assert.equal(typeof ctx.persistCanonicalSections, 'function');
  assert.equal(typeof ctx.persistLegacySettingsFile, 'function');
  assert.equal(typeof ctx.recordRouteWriteAttempt, 'function');
  assert.equal(typeof ctx.recordRouteWriteOutcome, 'function');
  assert.ok(Object.hasOwn(ctx, 'runDataStorageState'));
});

test('getUserSettingsState returns the initial user settings', () => {
  const initial = { runtime: { maxPagesPerDomain: 40 } };
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: initial,
  });
  assert.equal(ctx.getUserSettingsState(), initial);
});

test('getUiSettingsState returns a ui snapshot object', () => {
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  const ui = ctx.getUiSettingsState();
  assert.equal(typeof ui, 'object');
  assert.notEqual(ui, null);
});

test('recordRouteWriteAttempt delegates to observability counters', () => {
  resetSettingsPersistenceCounters();
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  ctx.recordRouteWriteAttempt('runtime', 'runtime-settings-route');
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.attempt_total, 1);
  assert.equal(counters.writes.by_section.runtime?.attempt_total, 1);
  assert.equal(counters.writes.by_target['runtime-settings-route']?.attempt_total, 1);
});

test('recordRouteWriteOutcome records success telemetry', () => {
  resetSettingsPersistenceCounters();
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  ctx.recordRouteWriteAttempt('ui', 'ui-settings-route');
  ctx.recordRouteWriteOutcome('ui', 'ui-settings-route', true);
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.success_total, 1);
  assert.equal(counters.writes.by_target['ui-settings-route']?.success_total, 1);
});

test('recordRouteWriteOutcome records failure telemetry', () => {
  resetSettingsPersistenceCounters();
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  ctx.recordRouteWriteAttempt('storage', 'storage-settings-route');
  ctx.recordRouteWriteOutcome('storage', 'storage-settings-route', false, 'storage_settings_persist_failed');
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.failed_total, 1);
  assert.equal(counters.writes.by_target['storage-settings-route']?.failed_total, 1);
});

test('persistLegacySettingsFile is no-op when canonicalOnlySettingsWrites is true', async () => {
  const helperRoot = await makeHelperRoot();
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: helperRoot,
    canonicalOnlySettingsWrites: true,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  await ctx.persistLegacySettingsFile('test-legacy.json', { foo: 'bar' });
  const exists = await fs.access(path.join(helperRoot, '_runtime', 'test-legacy.json'))
    .then(() => true)
    .catch(() => false);
  assert.equal(exists, false, 'legacy file should not be written when canonicalOnlySettingsWrites is true');
  await fs.rm(helperRoot, { recursive: true, force: true }).catch(() => {});
});

test('persistLegacySettingsFile writes when canonicalOnlySettingsWrites is false', async () => {
  const helperRoot = await makeHelperRoot();
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: helperRoot,
    canonicalOnlySettingsWrites: false,
    runDataStorageState: {},
    initialUserSettings: {},
  });
  await ctx.persistLegacySettingsFile('test-legacy.json', { foo: 'bar' });
  const content = await fs.readFile(path.join(helperRoot, '_runtime', 'test-legacy.json'), 'utf8');
  const parsed = JSON.parse(content);
  assert.deepEqual(parsed, { foo: 'bar' });
  await fs.rm(helperRoot, { recursive: true, force: true }).catch(() => {});
});

test('persistCanonicalSections updates getUserSettingsState and returns artifacts', async () => {
  const helperRoot = await makeHelperRoot();
  const config = {};
  const runDataStorageState = {};
  const ctx = createConfigPersistenceContext({
    config,
    settingsRoot: helperRoot,
    canonicalOnlySettingsWrites: true,
    runDataStorageState,
    initialUserSettings: {},
  });
  const initialState = ctx.getUserSettingsState();
  assert.deepEqual(initialState, {});
  const artifacts = await ctx.persistCanonicalSections({
    runtime: { maxPagesPerDomain: 8 },
  });
  assert.notEqual(artifacts, null);
  assert.equal(typeof artifacts, 'object');
  assert.ok(artifacts.sections, 'artifacts should have sections');
  const updatedState = ctx.getUserSettingsState();
  assert.notEqual(updatedState, initialState, 'user settings state should be updated after persist');
  assert.equal(updatedState.runtime.maxPagesPerDomain, 8);
  await fs.rm(helperRoot, { recursive: true, force: true }).catch(() => {});
});

test('runDataStorageState is the same reference passed in', () => {
  const storageState = { enabled: false, destinationType: 'local' };
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    canonicalOnlySettingsWrites: true,
    runDataStorageState: storageState,
    initialUserSettings: {},
  });
  assert.equal(ctx.runDataStorageState, storageState);
});
