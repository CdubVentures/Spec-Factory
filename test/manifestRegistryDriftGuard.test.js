import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG_MANIFEST,
  CONFIG_MANIFEST_KEYS,
  CONFIG_MANIFEST_DEFAULTS,
} from '../src/core/config/manifest.js';
import { RUNTIME_SETTINGS_REGISTRY, BOOTSTRAP_ENV_REGISTRY } from '../src/shared/settingsRegistry.js';

// WHY: Permanent regression guard. Since the manifest is now 100% derived from
// the registry, these tests verify the derivation contract stays intact.

describe('manifest ↔ registry drift guard', () => {
  const allRegistry = [...RUNTIME_SETTINGS_REGISTRY, ...BOOTSTRAP_ENV_REGISTRY];
  const registryEnvKeys = new Set(
    allRegistry.filter(e => e.envKey && !e.routeOnly).map(e => e.envKey)
  );

  it('every manifest key has a matching registry entry with envKey', () => {
    for (const key of CONFIG_MANIFEST_KEYS) {
      assert.ok(registryEnvKeys.has(key), `manifest key "${key}" has no registry entry with envKey`);
    }
  });

  it('every registry entry with envKey appears in the manifest', () => {
    const manifestKeySet = new Set(CONFIG_MANIFEST_KEYS);
    for (const envKey of registryEnvKeys) {
      assert.ok(manifestKeySet.has(envKey), `registry envKey "${envKey}" missing from manifest`);
    }
  });

  it('manifest key count equals registry envKey count', () => {
    assert.equal(CONFIG_MANIFEST_KEYS.length, registryEnvKeys.size,
      `manifest has ${CONFIG_MANIFEST_KEYS.length} keys but registry has ${registryEnvKeys.size} envKeys`);
  });

  it('no duplicate keys across manifest groups', () => {
    const allKeys = CONFIG_MANIFEST.flatMap(g => g.entries.map(e => e.key));
    const unique = new Set(allKeys);
    assert.equal(allKeys.length, unique.size,
      `found ${allKeys.length - unique.size} duplicate manifest keys`);
  });

  it('every registry entry with envKey has a group field', () => {
    const missing = allRegistry
      .filter(e => e.envKey && !e.routeOnly && !e.group)
      .map(e => e.key);
    assert.equal(missing.length, 0,
      `registry entries missing group: ${missing.join(', ')}`);
  });
});
