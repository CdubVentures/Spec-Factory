import { SETTINGS_DEFAULTS } from '../../../../src/shared/settingsDefaults.js';

export * from './runtimeSettingsManifest.ts';
export * from './llmSettingsManifest.ts';

export type UiSettingDefaults = typeof SETTINGS_DEFAULTS['ui'];

export const UI_SETTING_DEFAULTS: UiSettingDefaults = {
  ...SETTINGS_DEFAULTS.ui,
};

export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.debounceMs,
});

export const SETTINGS_AUTOSAVE_STATUS_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.statusMs,
});
