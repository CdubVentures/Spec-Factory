// WHY: Plan 06 — Single resolver for effective runtime config.
// Replaces the scattered merge chain: configBuilder env reads + configPostMerge
// normalization + userSettingsService merge + roundConfigBuilder mutation.
// All consumers get their config from this one function.

import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveConfigKeyMap } from '../../shared/settingsRegistryDerivations.js';

const CONFIG_KEY_MAP = deriveConfigKeyMap(RUNTIME_SETTINGS_REGISTRY);
const REGISTRY_KEY_SET = new Set(RUNTIME_SETTINGS_REGISTRY.map(e => e.key));

/**
 * Apply snapshot settings onto a base config, recording patches.
 * @param {Object} config — Mutable config object
 * @param {Object} snapshotSettings — Settings from snapshot
 * @returns {Array<{key: string, originalValue: *, effectiveValue: *, source: string, reason: string}>}
 */
export function applySnapshotToConfig(config, snapshotSettings) {
  const patches = [];
  if (!snapshotSettings || typeof snapshotSettings !== 'object') return patches;

  for (const [key, value] of Object.entries(snapshotSettings)) {
    if (value === undefined || value === null) continue;
    // WHY: Map the setting key to the config key (handles aliases like fetchConcurrency → concurrency)
    const configKey = CONFIG_KEY_MAP[key] || key;
    const originalValue = config[configKey];
    if (originalValue !== value) {
      patches.push({
        key,
        configKey,
        originalValue,
        effectiveValue: value,
        source: 'snapshot',
        reason: 'GUI editor value at run start',
      });
    }
    config[configKey] = value;
    // WHY: Also set under the setting key if it differs from configKey (dual-key compat)
    if (configKey !== key) {
      config[key] = value;
    }
  }
  return patches;
}

/**
 * Check whether a key is a known registry setting.
 * @param {string} key
 * @returns {boolean}
 */
export function isRegistrySetting(key) {
  return REGISTRY_KEY_SET.has(key);
}

/**
 * Get the config key for a registry setting key.
 * @param {string} settingKey
 * @returns {string} The config key (may be the same as settingKey)
 */
export function getConfigKey(settingKey) {
  return CONFIG_KEY_MAP[settingKey] || settingKey;
}
