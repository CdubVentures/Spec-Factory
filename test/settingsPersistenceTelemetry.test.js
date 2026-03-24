import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  drainPersistQueue,
  loadUserSettingsSync,
  persistUserSettingsSections,
} from '../src/features/settings-authority/userSettingsService.js';
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
      maxPagesPerDomain: 7,
    },
  }, null, 2), 'utf8');

  resetSettingsPersistenceCounters();
  const snapshot = loadUserSettingsSync({ categoryAuthorityRoot: root });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(snapshot.runtime.maxPagesPerDomain, 7);
  assert.equal(counters.stale_reads.total, 1);
  assert.equal(counters.stale_reads.by_reason.schema_version_outdated, 1);
  assert.equal(counters.migrations.total, 1);
});

test('persistUserSettingsSections records write attempt/success telemetry for user-settings.json writes', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-persist-');

  resetSettingsPersistenceCounters();
  const saved = await persistUserSettingsSections({
    categoryAuthorityRoot: root,
    runtime: {
      maxPagesPerDomain: 5,
    },
  });
  const counters = getSettingsPersistenceCountersSnapshot();

  assert.equal(saved.runtime.maxPagesPerDomain, 5);
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
      categoryAuthorityRoot: root,
      runtime: {
        maxPagesPerDomain: 9,
      },
    }),
    persistUserSettingsSections({
      categoryAuthorityRoot: root,
      convergence: {},
    }),
    persistUserSettingsSections({
      categoryAuthorityRoot: root,
      ui: {
        runtimeAutoSaveEnabled: false,
        storageAutoSaveEnabled: true,
      },
    }),
  ]);

  const snapshot = loadUserSettingsSync({ categoryAuthorityRoot: root, strictRead: true });
  assert.equal(snapshot.runtime.maxPagesPerDomain, 9);
  assert.deepStrictEqual(snapshot.convergence, {});
  assert.equal(snapshot.ui.runtimeAutoSaveEnabled, false);
  assert.equal(snapshot.ui.storageAutoSaveEnabled, true);
});

test('persistUserSettingsSections fails on invalid user-settings JSON instead of normalizing to empty snapshot', async () => {
  const { root, runtimeRoot } = await makeHelperRoot('settings-telemetry-invalid-json-');
  const userSettingsPath = path.join(runtimeRoot, 'user-settings.json');
  await fs.writeFile(userSettingsPath, '{ invalid_json', 'utf8');

  await assert.rejects(
    () => persistUserSettingsSections({
      categoryAuthorityRoot: root,
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
      categoryAuthorityRoot: root,
      studioPatch: {
        mouse: {
          file_path: 'category_authority/mouse/_control_plane/field_studio_map.json',
          map: { version: 1, component_sources: [{ component_type: 'sensor' }] },
        },
      },
    }),
    persistUserSettingsSections({
      categoryAuthorityRoot: root,
      studioPatch: {
        keyboard: {
          file_path: 'category_authority/keyboard/_control_plane/field_studio_map.json',
          map: { version: 2, component_sources: [{ component_type: 'switch' }] },
        },
      },
    }),
  ]);

  const snapshot = loadUserSettingsSync({ categoryAuthorityRoot: root, strictRead: true });
  assert.equal(snapshot.studio.mouse.file_path, 'category_authority/mouse/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.keyboard.file_path, 'category_authority/keyboard/_control_plane/field_studio_map.json');
  assert.equal(snapshot.studio.mouse.map.version, 1);
  assert.equal(snapshot.studio.keyboard.map.version, 2);
});

test('persistUserSettingsSections rejects mixed studio and studioPatch writes', async () => {
  const { root } = await makeHelperRoot('settings-telemetry-studio-conflict-');

  await assert.rejects(
    () => persistUserSettingsSections({
      categoryAuthorityRoot: root,
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
// drainPersistQueue — observability for the hidden persist queue
// =========================================================================

test('drainPersistQueue resolves immediately when no operations are pending', async () => {
  await drainPersistQueue();
});

test('drainPersistQueue waits for in-flight persist operations to complete', async () => {
  const { root } = await makeHelperRoot('settings-drain-');
  persistUserSettingsSections({
    categoryAuthorityRoot: root,
    runtime: { maxPagesPerDomain: 11 },
  });
  await drainPersistQueue();
  const snapshot = loadUserSettingsSync({ categoryAuthorityRoot: root, strictRead: true });
  assert.equal(snapshot.runtime.maxPagesPerDomain, 11);
});
