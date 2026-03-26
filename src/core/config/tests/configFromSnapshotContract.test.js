import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  applySnapshotToConfig,
  isRegistrySetting,
  getConfigKey,
} from '../resolveEffectiveRuntimeConfig.js';
import { loadConfigWithUserSettings } from '../../../config.js';
import { withSavedEnv, withTempDirSync } from './helpers/configTestHarness.js';

describe('resolveEffectiveRuntimeConfig contract', () => {
  it('applySnapshotToConfig overlays values onto config', () => {
    const config = { maxRunSeconds: 300, autoScrollEnabled: false, concurrency: 4 };
    const patches = applySnapshotToConfig(config, {
      maxRunSeconds: 600,
      autoScrollEnabled: true,
    });

    strictEqual(config.maxRunSeconds, 600);
    strictEqual(config.autoScrollEnabled, true);
    strictEqual(config.concurrency, 4);
    ok(patches.length === 2, `expected 2 patches, got ${patches.length}`);
    strictEqual(patches[0].key, 'maxRunSeconds');
    strictEqual(patches[0].originalValue, 300);
    strictEqual(patches[0].effectiveValue, 600);
    strictEqual(patches[0].source, 'snapshot');
  });

  it('applySnapshotToConfig ignores nullish values', () => {
    const config = { maxRunSeconds: 300 };
    const patches = applySnapshotToConfig(config, {
      maxRunSeconds: null,
      autoScrollEnabled: undefined,
    });

    strictEqual(config.maxRunSeconds, 300);
    strictEqual(patches.length, 0);
  });

  it('applySnapshotToConfig skips unchanged and empty snapshots', () => {
    const unchangedConfig = { maxRunSeconds: 300 };
    strictEqual(applySnapshotToConfig(unchangedConfig, { maxRunSeconds: 300 }).length, 0);

    const emptyConfig = { maxRunSeconds: 300 };
    strictEqual(applySnapshotToConfig(emptyConfig, {}).length, 0);
    strictEqual(emptyConfig.maxRunSeconds, 300);

    strictEqual(applySnapshotToConfig({ maxRunSeconds: 300 }, null).length, 0);
  });

  it('isRegistrySetting identifies known settings only', () => {
    ok(isRegistrySetting('autoScrollEnabled'));
    ok(isRegistrySetting('llmModelPlan'));
    ok(!isRegistrySetting('notARealSetting'));
    ok(!isRegistrySetting(''));
  });

  it('getConfigKey returns the effective config key for aliased entries', () => {
    strictEqual(getConfigKey('autoScrollEnabled'), 'autoScrollEnabled');
  });
});

function withSnapshotHarness(settings, runTest) {
  return withSavedEnv(['RUNTIME_SETTINGS_SNAPSHOT'], () =>
    withTempDirSync('sf-alias-test-', (tmpDir) => {
      const snapshotPath = path.join(tmpDir, 'alias-test-settings.json');
      const snapshot = {
        snapshotId: 'alias-test',
        schemaVersion: '1.0',
        createdAt: Date.now(),
        source: 'test',
        settings,
      };

      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');
      process.env.RUNTIME_SETTINGS_SNAPSHOT = snapshotPath;
      return runTest();
    })
  );
}

describe('loadConfigWithUserSettings snapshot contract', () => {
  it('remaps alias keys from the snapshot onto the consumer-facing config surface', () => {
    return withSnapshotHarness({
      maxRunSeconds: 600,
      autoScrollEnabled: false,
    }, () => {
      const config = loadConfigWithUserSettings();

      strictEqual(config.maxRunSeconds, 600);
      strictEqual(config.autoScrollEnabled, false);
    });
  });
});
