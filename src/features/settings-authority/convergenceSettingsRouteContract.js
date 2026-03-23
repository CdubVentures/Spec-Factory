// WHY: O(1) Feature Scaling — convergence route contract and value types
// are derived from the registry SSOT. Adding a convergence knob = one entry.

import { CONVERGENCE_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveConvergenceRouteContract, deriveConvergenceValueTypes } from '../../shared/settingsRegistryDerivations.js';

export const CONVERGENCE_SETTINGS_ROUTE_PUT = deriveConvergenceRouteContract(CONVERGENCE_SETTINGS_REGISTRY);

export const CONVERGENCE_SETTINGS_VALUE_TYPES = deriveConvergenceValueTypes(CONVERGENCE_SETTINGS_REGISTRY);
