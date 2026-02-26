import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  loadUserSettingsSync,
  persistUserSettingsSections,
} from '../src/api/services/userSettingsService.js';
import {
  getSettingsPersistenceCountersSnapshot,
  resetSettingsPersistenceCounters,
} from '../src/observability/settingsPersistenceCounters.js';

async function makeHelperRoot(prefix) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const runtimeRoot = path.join(root, '_runtime');
  await fs.mkdir(runtimeRoot, { recursive: true });
  return { root, runtimeRoot };
}

test('loadUserSettingsSync records stale-read + migration telemetry for outdated schema payloads', async () => {
  const { root, runtimeRoot } = await makeHelperRoot('settings-telemetry-load-');
  await fs.writeFile(path.join(runtimeRoot, 'user-settings.json'), JSON.stringify({
    schemaVersion: 1,
    runtime: {
      runProfile: 'standard',
      concurrency: 7,
    },
  }, null, 2), 'utf8');

  resetSettingsPersistenceCounters();
  const snapshot = loadUserSettingsSync({ helperFilesRoot: root });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(snapshot.runtime.runProfile, 'standard');
  assert.equal(snapshot.runtime.concurrency, 7);
  assert.equal(counters.stale_reads.total, 1);
  assert.equal(counters.stale_reads.by_reason.schema_version_outdated, 1);
  assert.equal(counters.migrations.total, 1);
});

test('persistUserSettingsSections records write attempt/success telemetry for user-settings.json writes', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-persist-');

  resetSettingsPersistenceCounters();
  const saved = await persistUserSettingsSections({
    helperFilesRoot: root,
    runtime: {
      runProfile: 'thorough',
      concurrency: 5,
    },
  });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(saved.runtime.runProfile, 'thorough');
  assert.equal(saved.runtime.concurrency, 5);
  assert.equal(counters.writes.attempt_total, 1);
  assert.equal(counters.writes.success_total, 1);
  assert.equal(counters.writes.failed_total, 0);
  assert.equal(counters.writes.by_section.runtime.attempt_total, 1);
  assert.equal(counters.writes.by_section.runtime.success_total, 1);
  assert.equal(counters.writes.by_target['user-settings.json'].attempt_total, 1);
  assert.equal(counters.writes.by_target['user-settings.json'].success_total, 1);
});

test('persistUserSettingsSections serializes concurrent section writes without dropping previously written sections', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-concurrent-');

  await Promise.all([
    persistUserSettingsSections({
      helperFilesRoot: root,
      runtime: {
        runProfile: 'thorough',
        concurrency: 9,
      },
    }),
    persistUserSettingsSections({
      helperFilesRoot: root,
      convergence: {
        convergenceMaxRounds: 6,
        serpTriageEnabled: false,
      },
    }),
    persistUserSettingsSections({
      helperFilesRoot: root,
      ui: {
        runtimeAutoSaveEnabled: false,
        storageAutoSaveEnabled: true,
      },
    }),
  ]);

  const snapshot = loadUserSettingsSync({ helperFilesRoot: root, strictRead: true });
  assert.equal(snapshot.runtime.runProfile, 'thorough');
  assert.equal(snapshot.runtime.concurrency, 9);
  assert.equal(snapshot.convergence.convergenceMaxRounds, 6);
  assert.equal(snapshot.convergence.serpTriageEnabled, false);
  assert.equal(snapshot.ui.runtimeAutoSaveEnabled, false);
  assert.equal(snapshot.ui.storageAutoSaveEnabled, true);
});

test('persistUserSettingsSections fails on invalid user-settings JSON instead of normalizing to empty snapshot', async () => {
  const { root, runtimeRoot } = await makeHelperRoot('settings-telemetry-invalid-json-');
  const userSettingsPath = path.join(runtimeRoot, 'user-settings.json');
  await fs.writeFile(userSettingsPath, '{ invalid_json', 'utf8');

  await assert.rejects(
    () => persistUserSettingsSections({
      helperFilesRoot: root,
      ui: {
        runtimeAutoSaveEnabled: false,
      },
    }),
    (error) => {
      assert.equal(error?.code, 'user_settings_invalid_json');
      return true;
    },
  );

  const raw = await fs.readFile(userSettingsPath, 'utf8');
  assert.equal(raw, '{ invalid_json');
});

test('persistUserSettingsSections studioPatch merges per-category updates without clobbering concurrent categories', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-studio-patch-');

  await Promise.all([
    persistUserSettingsSections({
      helperFilesRoot: root,
      studioPatch: {
        mouse: {
          file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
          map: { version: 1, component_sources: [{ component_type: 'sensor' }] },
        },
      },
    }),
    persistUserSettingsSections({
      helperFilesRoot: root,
      studioPatch: {
        keyboard: {
          file_path: 'helper_files/keyboard/_control_plane/field_studio_map.json',
          map: { version: 2, component_sources: [{ component_type: 'switch' }] },
        },
      },
    }),
  ]);

  const snapshot = loadUserSettingsSync({ helperFilesRoot: root, strictRead: true });
  assert.equal(snapshot.studio.mouse.file_path, 'helper_files/mouse/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.keyboard.file_path, 'helper_files/keyboard/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.mouse.map.version, 1);
  assert.equal(snapshot.studio.keyboard.map.version, 2);
});

test('persistUserSettingsSections rejects mixed studio and studioPatch writes', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-studio-conflict-');

  await assert.rejects(
    () => persistUserSettingsSections({
      helperFilesRoot: root,
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
