export interface SharedUiDefaults {
  studioAutoSaveAllEnabled: boolean;
  studioAutoSaveEnabled: boolean;
  studioAutoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  llmSettingsAutoSaveEnabled: boolean;
}

export interface SharedStorageDefaults {
  enabled: boolean;
  destinationType: 'local' | 's3';
  localDirectory: string;
  s3Region: string;
  s3Bucket: string;
  s3Prefix: string;
  s3AccessKeyId: string;
}

export interface SharedAutosaveDefaults {
  debounceMs: {
    runtime: number;
    storage: number;
    llmRoutes: number;
    uiSettings: number;
    studioDocs: number;
    studioMap: number;
  };
  statusMs: {
    studioSavedIndicatorReset: number;
  };
}

export interface SharedSettingsDefaults {
  convergence: Record<string, number | boolean>;
  runtime: Record<string, string | number | boolean>;
  storage: SharedStorageDefaults;
  ui: SharedUiDefaults;
  autosave: SharedAutosaveDefaults;
}

export const SETTINGS_DEFAULTS: SharedSettingsDefaults;
