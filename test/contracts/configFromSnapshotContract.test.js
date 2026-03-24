import { describe, it, beforeEach, afterEach } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  applySnapshotToConfig,
  isRegistrySetting,
  getConfigKey,
} from '../../src/core/config/resolveEffectiveRuntimeConfig.js';
import { loadConfigWithUserSettings } from '../../src/config.js';

// WHY: Plan 06 contract test. Validates the effective config resolver.

describe('resolveEffectiveRuntimeConfig — Plan 06', () => {

  it('applySnapshotToConfig overlays values onto config', () => {
    const config = { maxRunSeconds: 300, autoScrollEnabled: false, concurrency: 4 };
    const patches = applySnapshotToConfig(config, {
      maxRunSeconds: 600,
      autoScrollEnabled: true,
    });
    strictEqual(config.maxRunSeconds, 600);
    strictEqual(config.autoScrollEnabled, true);
    strictEqual(config.concurrency, 4); // Unchanged
    ok(patches.length === 2, `expected 2 patches, got ${patches.length}`);
    strictEqual(patches[0].key, 'maxRunSeconds');
    strictEqual(patches[0].originalValue, 300);
    strictEqual(patches[0].effectiveValue, 600);
    strictEqual(patches[0].source, 'snapshot');
  });

  it('applySnapshotToConfig handles aliased keys (resumeMode → indexingResumeMode)', () => {
    const config = { indexingResumeMode: 'auto' };
    const patches = applySnapshotToConfig(config, { resumeMode: 'force_resume' });
    strictEqual(config.indexingResumeMode, 'force_resume', 'configKey should be updated');
    strictEqual(config.resumeMode, 'force_resume', 'setting key should also be set');
    ok(patches.length === 1);
    strictEqual(patches[0].configKey, 'indexingResumeMode');
  });

  it('applySnapshotToConfig skips null/undefined values', () => {
    const config = { maxRunSeconds: 300 };
    const patches = applySnapshotToConfig(config, { maxRunSeconds: null, autoScrollEnabled: undefined });
    strictEqual(config.maxRunSeconds, 300); // Unchanged
    strictEqual(patches.length, 0);
  });

  it('applySnapshotToConfig records no patch when value is unchanged', () => {
    const config = { maxRunSeconds: 300 };
    const patches = applySnapshotToConfig(config, { maxRunSeconds: 300 });
    strictEqual(patches.length, 0);
  });

  it('applySnapshotToConfig handles empty snapshot', () => {
    const config = { maxRunSeconds: 300 };
    const patches = applySnapshotToConfig(config, {});
    strictEqual(patches.length, 0);
    strictEqual(config.maxRunSeconds, 300);
  });

  it('applySnapshotToConfig handles null snapshot', () => {
    const config = { maxRunSeconds: 300 };
    const patches = applySnapshotToConfig(config, null);
    strictEqual(patches.length, 0);
  });

  it('isRegistrySetting identifies known settings', () => {
    ok(isRegistrySetting('autoScrollEnabled'));
    ok(isRegistrySetting('resumeMode'));
    ok(isRegistrySetting('llmModelPlan'));
    ok(!isRegistrySetting('notARealSetting'));
    ok(!isRegistrySetting(''));
  });

  it('getConfigKey returns configKey for aliased entries', () => {
    strictEqual(getConfigKey('resumeMode'), 'indexingResumeMode');
    strictEqual(getConfigKey('resumeWindowHours'), 'indexingResumeMaxAgeHours');
    strictEqual(getConfigKey('autoScrollEnabled'), 'autoScrollEnabled');
  });
});

// WHY: Integration test proving loadConfigWithUserSettings remaps alias keys
// from the snapshot. This is the critical path: GUI sends canonical setting keys
// (fetchConcurrency, resumeMode, etc.) but runtime consumers read the config keys
// (concurrency, indexingResumeMode, etc.). If the remap is missing, consumers
// get stale defaults.
describe('loadConfigWithUserSettings — snapshot alias remap', () => {
  let tmpDir;
  let snapshotPath;
  let origEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-alias-test-'));
    origEnv = process.env.RUNTIME_SETTINGS_SNAPSHOT;
    const snapshot = {
      snapshotId: 'alias-test',
      schemaVersion: '1.0',
      createdAt: Date.now(),
      source: 'test',
      settings: {
        resumeMode: 'force_resume',
        resumeWindowHours: 72,
        maxRunSeconds: 600,
        autoScrollEnabled: false,
      },
    };
    snapshotPath = path.join(tmpDir, 'alias-test-settings.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), 'utf8');
    process.env.RUNTIME_SETTINGS_SNAPSHOT = snapshotPath;
  });

  afterEach(() => {
    if (origEnv === undefined) delete process.env.RUNTIME_SETTINGS_SNAPSHOT;
    else process.env.RUNTIME_SETTINGS_SNAPSHOT = origEnv;
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  it('alias keys in snapshot are remapped to config keys consumers read', () => {
    const config = loadConfigWithUserSettings();

    // Config keys (what consumers read) must have the snapshot values
    strictEqual(config.indexingResumeMode, 'force_resume', 'config.indexingResumeMode from resumeMode');
    strictEqual(config.indexingResumeMaxAgeHours, 72, 'config.indexingResumeMaxAgeHours from resumeWindowHours');
    strictEqual(config.maxRunSeconds, 600, 'config.maxRunSeconds from snapshot');
    strictEqual(config.autoScrollEnabled, false, 'config.autoScrollEnabled from snapshot');

    // Canonical setting keys should also be set (dual-key compat)
    strictEqual(config.resumeMode, 'force_resume', 'canonical key should also be set');
  });
});
