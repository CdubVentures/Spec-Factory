// WHY: Builds the settings manifest from existing SSOT sources (Phase 17).
// The manifest exposes ranges, types, defaults, and allowed values so the
// frontend can derive constraints from the backend instead of hardcoding them.

import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../settings-authority/runtimeSettingsRoutePut.js';
import { CONVERGENCE_SETTINGS_ROUTE_PUT } from '../../settings-authority/convergenceSettingsRouteContract.js';
import { SETTINGS_DEFAULTS } from '../../../shared/settingsDefaults.js';

const RUNTIME_DEFAULTS = SETTINGS_DEFAULTS?.runtime || {};
const CONVERGENCE_DEFAULTS = SETTINGS_DEFAULTS?.convergence || {};

function resolveDefault(key, defaults) {
  return Object.hasOwn(defaults, key) ? defaults[key] : null;
}

export function buildSettingsManifest() {
  // --- runtime intRange ---
  const intRange = {};
  for (const [key, spec] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap)) {
    intRange[key] = {
      min: spec.min,
      max: spec.max,
      configKey: spec.configKey,
      default: resolveDefault(key, RUNTIME_DEFAULTS),
    };
  }

  // --- runtime floatRange ---
  const floatRange = {};
  for (const [key, spec] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap)) {
    floatRange[key] = {
      min: spec.min,
      max: spec.max,
      configKey: spec.configKey,
      default: resolveDefault(key, RUNTIME_DEFAULTS),
    };
  }

  // --- runtime boolKeys ---
  const boolKeys = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap);

  // --- runtime stringEnum ---
  const stringEnum = {};
  for (const [key, spec] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap)) {
    stringEnum[key] = {
      allowed: [...spec.allowed],
      configKey: spec.configKey,
      default: resolveDefault(key, RUNTIME_DEFAULTS),
    };
  }

  // --- convergence ---
  const convergenceKeys = [
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys,
  ];
  const convergenceDefaults = {};
  for (const key of convergenceKeys) {
    convergenceDefaults[key] = resolveDefault(key, CONVERGENCE_DEFAULTS);
  }

  return {
    runtime: {
      intRange,
      floatRange,
      boolKeys,
      stringEnum,
    },
    convergence: {
      keys: convergenceKeys,
      defaults: convergenceDefaults,
    },
  };
}
