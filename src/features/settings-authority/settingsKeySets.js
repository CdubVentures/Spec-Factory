import { RUNTIME_SETTINGS_VALUE_TYPES } from './runtimeSettingsRouteContract.js';
import { UI_SETTINGS_VALUE_TYPES } from './settingsValueTypes.js';
import { CONVERGENCE_SETTINGS_KEYS } from '../../core/config/settingsKeyMap.js';

export const RUNTIME_SETTINGS_KEYS = Object.freeze(Object.keys(RUNTIME_SETTINGS_VALUE_TYPES));

export { CONVERGENCE_SETTINGS_KEYS };

export const UI_SETTINGS_KEYS = Object.freeze(Object.keys(UI_SETTINGS_VALUE_TYPES));
