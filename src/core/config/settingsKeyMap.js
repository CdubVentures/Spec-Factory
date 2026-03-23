// WHY: Settings key constants needed by config.js at assembly time.
// Route maps are now derived from the unified settingsRegistry.

import { RUNTIME_SETTINGS_REGISTRY, CONVERGENCE_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveRouteGetMaps, deriveConvergenceKeySet } from '../../shared/settingsRegistryDerivations.js';

export const CATEGORY_AUTHORITY_ROOT_KEY = 'categoryAuthorityRoot';
export const CATEGORY_AUTHORITY_ENABLED_KEY = 'categoryAuthorityEnabled';
export const INDEXING_CATEGORY_AUTHORITY_ENABLED_KEY = 'indexingCategoryAuthorityEnabled';

export const RUNTIME_SETTINGS_ROUTE_GET = deriveRouteGetMaps(RUNTIME_SETTINGS_REGISTRY);

export const CONVERGENCE_SETTINGS_KEYS = Object.freeze(
  deriveConvergenceKeySet(CONVERGENCE_SETTINGS_REGISTRY),
);

// WHY: Dual-key pairs must have identical values. Self-referencing pairs
// remain for fallback models (keyA === keyB) as no-ops. All GUI aliases retired.
export const DUAL_KEY_PAIRS = Object.freeze([
  ['llmPlanFallbackModel', 'llmPlanFallbackModel'],
  ['llmReasoningFallbackModel', 'llmReasoningFallbackModel'],
]);

export function assertDualKeyConsistency(defaults) {
  for (const [keyA, keyB] of DUAL_KEY_PAIRS) {
    if (keyA === keyB) continue;
    if (!Object.hasOwn(defaults, keyA) || !Object.hasOwn(defaults, keyB)) continue;
    const valA = defaults[keyA];
    const valB = defaults[keyB];
    if (valA !== valB) {
      throw new Error(
        `Dual-key drift: ${keyA} (${JSON.stringify(valA)}) !== ${keyB} (${JSON.stringify(valB)})`
      );
    }
  }
}
