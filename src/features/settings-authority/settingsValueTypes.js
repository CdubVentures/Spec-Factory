import { UI_SETTINGS_REGISTRY, STORAGE_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { deriveUiValueTypes, deriveStorageValueTypes } from '../../shared/settingsRegistryDerivations.js';

export const UI_SETTINGS_VALUE_TYPES = deriveUiValueTypes(UI_SETTINGS_REGISTRY);
export const STORAGE_SETTINGS_VALUE_TYPES = deriveStorageValueTypes(STORAGE_SETTINGS_REGISTRY);
