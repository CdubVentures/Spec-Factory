import test from 'node:test';
import assert from 'node:assert/strict';

import { createConfigPersistenceContext } from '../configPersistenceContext.js';
import {
  getSettingsPersistenceCountersSnapshot,
  resetSettingsPersistenceCounters,
} from '../../../../core/events/settingsPersistenceCounters.js';
import { AppDb } from '../../../../db/appDb.js';

function makeInMemoryAppDb() {
  return new AppDb({ dbPath: ':memory:' });
}

test('createConfigPersistenceContext returns expected shape', () => {
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    initialUserSettings: {},
  });
  assert.equal(typeof ctx.getUserSettingsState, 'function');
  assert.equal(typeof ctx.getUiSettingsState, 'function');
  assert.equal(typeof ctx.persistCanonicalSections, 'function');
  assert.equal(typeof ctx.mergeRuntimePatch, 'function');
  assert.equal(typeof ctx.recordRouteWriteAttempt, 'function');
  assert.equal(typeof ctx.recordRouteWriteOutcome, 'function');
});

test('getUserSettingsState returns the initial user settings', () => {
  const initial = { runtime: { domainClassifierUrlCap: 40 } };
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
    initialUserSettings: initial,
  });
  assert.equal(ctx.getUserSettingsState(), initial);
});

test('createConfigPersistenceContext applies initial runtime settings onto config immediately', () => {
  const config = { llmModelPlan: 'gemini-2.5-flash' };
  createConfigPersistenceContext({
    config,
    initialUserSettings: {
      runtime: {
        llmModelPlan: 'gpt-5',
      },
    },
  });
  assert.equal(config.llmModelPlan, 'gpt-5');
});

test('getUiSettingsState returns a ui snapshot object', () => {
  const ctx = createConfigPersistenceContext({
    config: {},
    settingsRoot: 'category_authority',
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
    initialUserSettings: {},
  });
  ctx.recordRouteWriteAttempt('storage', 'storage-settings-route');
  ctx.recordRouteWriteOutcome('storage', 'storage-settings-route', false, 'storage_settings_persist_failed');
  const counters = getSettingsPersistenceCountersSnapshot();
  assert.equal(counters.writes.failed_total, 1);
  assert.equal(counters.writes.by_target['storage-settings-route']?.failed_total, 1);
});

test('persistCanonicalSections updates getUserSettingsState and returns artifacts', async () => {
  const appDb = makeInMemoryAppDb();
  const config = {};
  const ctx = createConfigPersistenceContext({
    config,
    settingsRoot: 'category_authority',
    initialUserSettings: {},
    appDb,
  });
  const initialState = ctx.getUserSettingsState();
  assert.deepEqual(initialState, {});
  const artifacts = await ctx.persistCanonicalSections({
    runtime: { domainClassifierUrlCap: 8 },
  });
  assert.notEqual(artifacts, null);
  assert.equal(typeof artifacts, 'object');
  assert.ok(artifacts.sections, 'artifacts should have sections');
  const updatedState = ctx.getUserSettingsState();
  assert.notEqual(updatedState, initialState, 'user settings state should be updated after persist');
  assert.equal(updatedState.runtime.domainClassifierUrlCap, 8);
  appDb.close();
});

test('mergeRuntimePatch does not heal blank secrets from config into SQL', async () => {
  const appDb = makeInMemoryAppDb();
  // Seed SQL with a blank geminiApiKey
  appDb.upsertSetting({ section: 'runtime', key: 'geminiApiKey', value: '', type: 'string' });

  // Config has a value (as if from env in the old world)
  const config = { geminiApiKey: 'from-env' };
  const ctx = createConfigPersistenceContext({
    config,
    initialUserSettings: { runtime: { geminiApiKey: '' } },
    appDb,
  });

  await ctx.mergeRuntimePatch({ llmTimeoutMs: 45000 });

  // Verify SQL still has blank geminiApiKey — no healing
  const rows = appDb.getSection('runtime');
  const geminiRow = rows.find((r) => r.key === 'geminiApiKey');
  assert.equal(geminiRow?.value, '',
    'SQL geminiApiKey must remain blank (no env→SQL healing)');
  appDb.close();
});
