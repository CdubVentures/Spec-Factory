import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';

import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import {
  deriveConfigKeyMap,
  deriveEnvKeyMap,
} from '../settingsRegistryDerivations.js';

describe('settingsRegistry transport contract', () => {
  it('keeps config keys well-formed, unique, and free of legacy cfgKey metadata', () => {
    const seen = new Set();

    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      const configKey = entry.configKey || entry.key;
      ok(typeof configKey === 'string' && configKey.length > 0, `${entry.key} missing configKey`);
      ok(!seen.has(configKey), `duplicate configKey: ${configKey}`);
      ok(!Object.hasOwn(entry, 'cfgKey'), `${entry.key} should not expose legacy cfgKey`);
      seen.add(configKey);
    }
  });

  it('keeps non-empty env keys unique and UPPER_SNAKE_CASE', () => {
    const seen = new Set();

    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(typeof entry.envKey === 'string', `${entry.key} envKey should be a string`);
      if (!entry.envKey) continue;
      ok(/^[A-Z][A-Z0-9_]*$/.test(entry.envKey), `${entry.key} envKey "${entry.envKey}" is invalid`);
      ok(!seen.has(entry.envKey), `duplicate envKey: ${entry.envKey}`);
      seen.add(entry.envKey);
    }
  });

  it('derives the exact config-key lookup map from registry metadata', () => {
    const expected = Object.freeze(Object.fromEntries(
      RUNTIME_SETTINGS_REGISTRY.map((entry) => [entry.key, entry.configKey || entry.key]),
    ));

    deepStrictEqual(deriveConfigKeyMap(RUNTIME_SETTINGS_REGISTRY), expected);
  });

  it('derives the exact non-empty env-key lookup map from registry metadata', () => {
    const expected = Object.freeze(Object.fromEntries(
      RUNTIME_SETTINGS_REGISTRY
        .filter((entry) => entry.envKey)
        .map((entry) => [entry.key, entry.envKey]),
    ));

    deepStrictEqual(deriveEnvKeyMap(RUNTIME_SETTINGS_REGISTRY), expected);
  });
});
