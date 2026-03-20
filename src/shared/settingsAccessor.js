// WHY: Single gateway for reading config values with registry-derived defaults.
// No hardcoded fallback parameters. The registry IS the default.
// Eliminates all `Number(config.foo || wrongFallback)` anti-patterns.

import { RUNTIME_SETTINGS_REGISTRY } from './settingsRegistry.js';

// WHY: Build lookup map once at import. Keyed by both `key` and `configKey`
// so consumers can use either name. Registry is the sole source of defaults.
const REGISTRY_DEFAULTS = Object.freeze(
  Object.fromEntries(
    RUNTIME_SETTINGS_REGISTRY.flatMap(entry => {
      const pairs = [[entry.key, entry.default]];
      const cfgKey = entry.configKey || entry.key;
      if (cfgKey !== entry.key) {
        pairs.push([cfgKey, entry.default]);
      }
      return pairs;
    })
  )
);

const VALID_KEYS = new Set(Object.keys(REGISTRY_DEFAULTS));

/**
 * Read a config value with registry default fallback.
 * @param {Record<string, unknown>} config - The resolved config object.
 * @param {string} key - Registry key or configKey.
 * @returns {unknown} Config value, or registry default if null/undefined.
 * @throws {Error} If key is not in registry (catches typos at dev time).
 */
export function configValue(config, key) {
  if (!VALID_KEYS.has(key)) {
    throw new Error(`Unknown setting key: "${key}" — not found in RUNTIME_SETTINGS_REGISTRY`);
  }
  const val = config[key];
  return val ?? REGISTRY_DEFAULTS[key];
}

/** Read a config value and coerce to integer. */
export function configInt(config, key) {
  return Number(configValue(config, key));
}

/** Read a config value and coerce to float. */
export function configFloat(config, key) {
  return parseFloat(String(configValue(config, key)));
}

/** Read a config value and coerce to boolean. */
export function configBool(config, key) {
  return Boolean(configValue(config, key));
}
