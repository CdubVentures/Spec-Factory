import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import {
  applySnapshotToConfig,
  isRegistrySetting,
  getConfigKey,
} from '../../src/core/config/resolveEffectiveRuntimeConfig.js';

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

  it('applySnapshotToConfig handles aliased keys (fetchConcurrency → concurrency)', () => {
    const config = { concurrency: 4 };
    const patches = applySnapshotToConfig(config, { fetchConcurrency: 8 });
    strictEqual(config.concurrency, 8, 'configKey should be updated');
    strictEqual(config.fetchConcurrency, 8, 'setting key should also be set');
    ok(patches.length === 1);
    strictEqual(patches[0].configKey, 'concurrency');
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
    ok(isRegistrySetting('fetchConcurrency'));
    ok(isRegistrySetting('llmModelPlan'));
    ok(!isRegistrySetting('notARealSetting'));
    ok(!isRegistrySetting(''));
  });

  it('getConfigKey returns configKey for aliased entries', () => {
    strictEqual(getConfigKey('fetchConcurrency'), 'concurrency');
    strictEqual(getConfigKey('resumeMode'), 'indexingResumeMode');
    strictEqual(getConfigKey('autoScrollEnabled'), 'autoScrollEnabled');
  });
});
