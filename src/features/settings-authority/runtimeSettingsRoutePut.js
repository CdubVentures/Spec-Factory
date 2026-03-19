// WHY: PUT route contract derived from the unified settingsRegistry.
// Previously 118 LOC of hand-maintained maps.

import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  SETTINGS_CLAMPING_STRING_ENUM_MAP,
} from '../../shared/settingsClampingRanges.js';
import { deriveRoutePutContract } from '../../shared/settingsRegistryDerivations.js';

export const RUNTIME_SETTINGS_ROUTE_PUT = deriveRoutePutContract(RUNTIME_SETTINGS_REGISTRY, {
  clampingIntRangeMap: SETTINGS_CLAMPING_INT_RANGE_MAP,
  clampingFloatRangeMap: SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  clampingStringEnumMap: SETTINGS_CLAMPING_STRING_ENUM_MAP,
});
