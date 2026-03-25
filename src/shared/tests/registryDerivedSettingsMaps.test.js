import test from 'node:test';
import assert from 'node:assert/strict';

import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { loadBundledModule } from './helpers/loadBundledModule.js';

const guiRegistryMapsPromise = loadBundledModule(
  'tools/gui-react/src/shared/registryDerivedSettingsMaps.ts',
  { prefix: 'registry-derived-settings-maps-' },
);

test('GUI registry-derived settings maps stay aligned with the runtime settings registry', async () => {
  const {
    REGISTRY_ALL_KEYS,
    REGISTRY_BOUNDS,
    REGISTRY_DEFAULTS,
    REGISTRY_ENUM_MAP,
    REGISTRY_TYPE_MAP,
  } = await guiRegistryMapsPromise;

  assert.deepEqual(
    [...REGISTRY_ALL_KEYS].sort(),
    RUNTIME_SETTINGS_REGISTRY.map((entry) => entry.key).sort(),
  );

  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    assert.equal(REGISTRY_TYPE_MAP[entry.key], entry.type, `${entry.key} type drifted`);
    assert.deepEqual(REGISTRY_DEFAULTS[entry.key], entry.default, `${entry.key} default drifted`);

    if ((entry.type === 'int' || entry.type === 'float') && entry.min != null && entry.max != null) {
      const expectedBounds = entry.type === 'int'
        ? { min: entry.min, max: entry.max, int: true }
        : { min: entry.min, max: entry.max };
      assert.deepEqual(REGISTRY_BOUNDS[entry.key], expectedBounds, `${entry.key} bounds drifted`);
    } else {
      assert.equal(REGISTRY_BOUNDS[entry.key], undefined, `${entry.key} should not expose numeric bounds`);
    }

    if (entry.type === 'enum' || entry.type === 'csv_enum') {
      assert.deepEqual(REGISTRY_ENUM_MAP[entry.key], entry.allowed, `${entry.key} enum values drifted`);
    } else {
      assert.equal(REGISTRY_ENUM_MAP[entry.key], undefined, `${entry.key} should not expose enum options`);
    }
  }
});

test('GUI registry-derived allowEmpty and secret sets reflect registry metadata', async () => {
  const {
    REGISTRY_ALLOW_EMPTY,
    REGISTRY_SECRET_KEYS,
  } = await guiRegistryMapsPromise;

  const expectedAllowEmpty = RUNTIME_SETTINGS_REGISTRY
    .filter((entry) => entry.allowEmpty)
    .map((entry) => entry.key)
    .sort();
  const expectedSecretKeys = RUNTIME_SETTINGS_REGISTRY
    .filter((entry) => entry.secret)
    .map((entry) => entry.key)
    .sort();

  assert.deepEqual([...REGISTRY_ALLOW_EMPTY].sort(), expectedAllowEmpty);
  assert.deepEqual([...REGISTRY_SECRET_KEYS].sort(), expectedSecretKeys);
});
