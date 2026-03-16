import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

export type StorageDestinationOption = 'local' | 's3';

export interface StorageSettingDefaults {
  enabled: boolean;
  destinationType: StorageDestinationOption;
  localDirectory: string;
  awsRegion: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
}

export interface UiSettingDefaults {
  studioAutoSaveAllEnabled: boolean;
  studioAutoSaveEnabled: boolean;
  studioAutoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  llmSettingsAutoSaveEnabled: boolean;
}

export const STORAGE_SETTING_DEFAULTS: StorageSettingDefaults = {
  ...(SETTINGS_DEFAULTS.storage as StorageSettingDefaults),
};

export const STORAGE_DESTINATION_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.storage.destinationType] as StorageDestinationOption[],
);

export const UI_SETTING_DEFAULTS: UiSettingDefaults = {
  ...(SETTINGS_DEFAULTS.ui as UiSettingDefaults),
};

export const SETTINGS_AUTOSAVE_DEBOUNCE_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.debounceMs,
});

export const SETTINGS_AUTOSAVE_STATUS_MS = Object.freeze({
  ...SETTINGS_DEFAULTS.autosave.statusMs,
});
