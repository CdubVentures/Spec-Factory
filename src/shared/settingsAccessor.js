// WHY: Single gateway for reading config values with registry-derived defaults.
// No hardcoded fallback parameters. The registry IS the default.
// Eliminates all `Number(config.foo || wrongFallback)` anti-patterns.

import { RUNTIME_SETTINGS_REGISTRY } from './settingsRegistry.js';

// WHY: Build lookup maps once at import. Keyed by both `key` and `configKey`
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

// WHY: Clamp maps derived from the registry's min/max declarations.
// configInt/configFloat use these to prevent NaN and out-of-range values.
function buildClampMap(type) {
  return Object.freeze(
    Object.fromEntries(
      RUNTIME_SETTINGS_REGISTRY
        .filter(e => e.type === type && e.min != null && e.max != null)
        .flatMap(e => {
          const clamp = Object.freeze({ min: e.min, max: e.max });
          const pairs = [[e.key, clamp]];
          const cfgKey = e.configKey || e.key;
          if (cfgKey !== e.key) pairs.push([cfgKey, clamp]);
          return pairs;
        })
    )
  );
}

const REGISTRY_INT_CLAMPS = buildClampMap('int');
const REGISTRY_FLOAT_CLAMPS = buildClampMap('float');

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
  const val = config == null ? undefined : config[key];
  return val ?? REGISTRY_DEFAULTS[key];
}

/** Read a config value and coerce to integer, clamped to registry min/max. */
export function configInt(config, key) {
  const raw = Number(configValue(config, key));
  if (Number.isNaN(raw)) return REGISTRY_DEFAULTS[key];
  const clamp = REGISTRY_INT_CLAMPS[key];
  if (!clamp) return raw;
  return Math.max(clamp.min, Math.min(clamp.max, raw));
}

/** Read a config value and coerce to float, clamped to registry min/max. */
export function configFloat(config, key) {
  const raw = parseFloat(String(configValue(config, key)));
  if (Number.isNaN(raw)) return REGISTRY_DEFAULTS[key];
  const clamp = REGISTRY_FLOAT_CLAMPS[key];
  if (!clamp) return raw;
  return Math.max(clamp.min, Math.min(clamp.max, raw));
}

/** Read a config value and coerce to boolean. */
export function configBool(config, key) {
  return Boolean(configValue(config, key));
}
