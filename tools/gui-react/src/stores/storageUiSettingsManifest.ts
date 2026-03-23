import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

export type StorageDestinationOption = 'local' | 's3';

// WHY: Derived from codegen'd settingsDefaults.d.ts — no manual interface to maintain.
export type StorageSettingDefaults = typeof SETTINGS_DEFAULTS['storage'];
export type UiSettingDefaults = typeof SETTINGS_DEFAULTS['ui'];

export const STORAGE_SETTING_DEFAULTS: StorageSettingDefaults = {
  ...SETTINGS_DEFAULTS.storage,
};

export const STORAGE_DESTINATION_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.storage.destinationType] as StorageDestinationOption[],
);

export const UI_SETTING_DEFAULTS: UiSettingDefaults = {
  ...SETTINGS_DEFAULTS.ui,
};

export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.debounceMs,
});

export const SETTINGS_AUTOSAVE_STATUS_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.statusMs,
});
