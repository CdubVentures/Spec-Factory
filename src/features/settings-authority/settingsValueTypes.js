import { UI_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveUiValueTypes } from '../../shared/settingsRegistryDerivations.js';

export const UI_SETTINGS_VALUE_TYPES = deriveUiValueTypes(UI_SETTINGS_REGISTRY);
