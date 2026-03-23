// WHY: O(1) Feature Scaling — runtime defaults and option values are derived
// from the registry SSOT. Adding a new setting = add one entry to settingsRegistry.js.
// No manual key-value pairs to maintain here.

import { RUNTIME_SETTINGS_REGISTRY, CONVERGENCE_SETTINGS_REGISTRY, STORAGE_SETTINGS_REGISTRY, UI_SETTINGS_REGISTRY, SEARXNG_AVAILABLE_ENGINES } from './settingsRegistry.js';
import { deriveRuntimeDefaults, deriveOptionValues, deriveConvergenceDefaults, deriveStorageDefaults, deriveStorageOptionValues, deriveUiDefaults } from './settingsRegistryDerivations.js';

export { SEARXNG_AVAILABLE_ENGINES };

// WHY: Derive runtime defaults from registry in a single pass.
// dynamicFetchPolicyMap is the only non-registry key — it's a JS object (not a setting).
const _derivedRuntime = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
_derivedRuntime.dynamicFetchPolicyMap = Object.freeze({});

export const SETTINGS_DEFAULTS = Object.freeze({
  convergence: Object.freeze(deriveConvergenceDefaults(CONVERGENCE_SETTINGS_REGISTRY)),
  runtime: Object.freeze(_derivedRuntime),
  storage: Object.freeze(deriveStorageDefaults(STORAGE_SETTINGS_REGISTRY)),
  ui: Object.freeze(deriveUiDefaults(UI_SETTINGS_REGISTRY)),
  autosave: Object.freeze({
    debounceMs: Object.freeze({
      runtime: 1500,
      storage: 700,
      llmRoutes: 700,
      uiSettings: 250,
      studioDocs: 1500,
      studioMap: 1500
    }),
    statusMs: Object.freeze({
      studioSavedIndicatorReset: 2000
    })
  })
});

// WHY: Derive enum option values from registry allowed[] arrays.
// Storage options are static (not in the runtime registry).
const _derivedRuntimeOptions = deriveOptionValues(RUNTIME_SETTINGS_REGISTRY);

export const SETTINGS_OPTION_VALUES = Object.freeze({
  runtime: Object.freeze(_derivedRuntimeOptions),
  storage: Object.freeze(deriveStorageOptionValues(STORAGE_SETTINGS_REGISTRY)),
});
