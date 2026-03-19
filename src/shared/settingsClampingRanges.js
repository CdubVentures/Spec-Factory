// WHY: Clamping ranges derived from the unified settingsRegistry.
// Previously 126 LOC of hand-maintained maps — now derived in ~10 lines.

import { RUNTIME_SETTINGS_REGISTRY } from './settingsRegistry.js';
import {
  deriveClampingIntRangeMap,
  deriveClampingFloatRangeMap,
  deriveClampingStringEnumMap,
} from './settingsRegistryDerivations.js';

export const SETTINGS_CLAMPING_INT_RANGE_MAP = deriveClampingIntRangeMap(RUNTIME_SETTINGS_REGISTRY);
export const SETTINGS_CLAMPING_FLOAT_RANGE_MAP = deriveClampingFloatRangeMap(RUNTIME_SETTINGS_REGISTRY);
export const SETTINGS_CLAMPING_STRING_ENUM_MAP = deriveClampingStringEnumMap(RUNTIME_SETTINGS_REGISTRY);
