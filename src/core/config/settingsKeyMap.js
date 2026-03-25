// WHY: Settings key constants needed by config.js at assembly time.
// Route maps are now derived from the unified settingsRegistry.

import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveRouteGetMaps } from '../../shared/settingsRegistryDerivations.js';

export const CATEGORY_AUTHORITY_ROOT_KEY = 'categoryAuthorityRoot';


export const RUNTIME_SETTINGS_ROUTE_GET = deriveRouteGetMaps(RUNTIME_SETTINGS_REGISTRY);
