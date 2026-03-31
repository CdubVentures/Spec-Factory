import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  drainPersistQueue,
  loadUserSettingsSync,
  persistUserSettingsSections,
} from '../userSettingsService.js';
import {
  getSettingsPersistenceCountersSnapshot,
  resetSettingsPersistenceCounters,
} from '../../../observability/settingsPersistenceCounters.js';
import { AppDb } from '../../../db/appDb.js';

async function makeSettingsRoot(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return root;
}

function makeInMemoryAppDb() {
  return new AppDb({ dbPath: ':memory:' });
}

test('loadUserSettingsSync records stale-read + migration telemetry for outdated schema payloads', async () => {
  const settingsRoot = await makeSettingsRoot('settings-telemetry-load-');
  await fs.writeFile(path.join(settingsRoot, 'user-settings.json'), JSON.stringify({
    schemaVersion: 1,
    runtime: {
      domainClassifierUrlCap: 7,
    },
  }, null, 2), 'utf8');

  resetSettingsPersistenceCounters();
  const snapshot = loadUserSettingsSync({ settingsRoot });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(snapshot.runtime.domainClassifierUrlCap, 7);
  assert.equal(counters.stale_reads.total, 1);
  assert.equal(counters.stale_reads.by_reason.schema_version_outdated, 1);
  assert.equal(counters.migrations.total, 1);
});

test('persistUserSettingsSections records write attempt/success telemetry for app.sqlite writes', async () => {
  const appDb = makeInMemoryAppDb();

  resetSettingsPersistenceCounters();
  const saved = await persistUserSettingsSections({
    appDb,
    runtime: {
      domainClassifierUrlCap: 50,
    },
  });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(saved.runtime.domainClassifierUrlCap, 50);
  assert.equal(counters.writes.attempt_total, 1);
  assert.equal(counters.writes.success_total, 1);
  assert.equal(counters.writes.failed_total, 0);
  assert.equal(counters.writes.by_section.runtime.attempt_total, 1);
  assert.equal(counters.writes.by_section.runtime.success_total, 1);
  assert.equal(counters.writes.by_target['app.sqlite'].attempt_total, 1);
  assert.equal(counters.writes.by_target['app.sqlite'].success_total, 1);

  appDb.close();
});

test('persistUserSettingsSections concurrent section writes preserve all sections', async () => {
  const appDb = makeInMemoryAppDb();

  await Promise.all([
    persistUserSettingsSections({
      appDb,
      runtime: {
        domainClassifierUrlCap: 9,
      },
    }),
    persistUserSettingsSections({
      appDb,
      ui: {
        runtimeAutoSaveEnabled: false,
      },
    }),
  ]);

  const snapshot = loadUserSettingsSync({ appDb });
  assert.equal(snapshot.runtime.domainClassifierUrlCap, 9);
  assert.deepStrictEqual(snapshot.convergence, {});
  assert.equal(snapshot.ui.runtimeAutoSaveEnabled, false);

  appDb.close();
});

test('persistUserSettingsSections studioPatch merges per-category updates without clobbering concurrent categories', async () => {
  const appDb = makeInMemoryAppDb();

  await persistUserSettingsSections({
    appDb,
    studioPatch: {
      mouse: {
        file_path: 'category_authority/mouse/_control_plane/field_studio_map.json',
        map: { version: 1, component_sources: [{ component_type: 'sensor' }] },
      },
    },
  });
  await persistUserSettingsSections({
    appDb,
    studioPatch: {
      keyboard: {
        file_path: 'category_authority/keyboard/_control_plane/field_studio_map.json',
        map: { version: 2, component_sources: [{ component_type: 'switch' }] },
      },
    },
  });

  const snapshot = loadUserSettingsSync({ appDb });
  assert.equal(snapshot.studio.mouse.file_path, 'category_authority/mouse/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.keyboard.file_path, 'category_authority/keyboard/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.mouse.map.version, 1);
  assert.equal(snapshot.studio.keyboard.map.version, 2);

  appDb.close();
});

test('persistUserSettingsSections rejects mixed studio and studioPatch writes', async () => {
  await assert.rejects(
    () => persistUserSettingsSections({
      appDb: makeInMemoryAppDb(),
      studio: {
        mouse: { map: { version: 1 } },
      },
      studioPatch: {
        keyboard: { map: { version: 2 } },
      },
    }),
    (error) => {
      assert.equal(error?.code, 'persist_user_settings_studio_conflict');
      return true;
    },
  );
});

// =========================================================================
// drainPersistQueue — now a no-op (SQL writes are synchronous)
// =========================================================================

test('drainPersistQueue resolves immediately when no operations are pending', async () => {
  await drainPersistQueue();
});
