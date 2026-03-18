export interface SharedUiDefaults {
  studioAutoSaveAllEnabled: boolean;
  studioAutoSaveEnabled: boolean;
  studioAutoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
}

export interface SharedStorageDefaults {
  enabled: boolean;
  destinationType: 'local' | 's3';
  localDirectory: string;
  awsRegion: string;
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

export interface SharedRuntimeOptionValues {
  searchProvider: readonly ['none', 'google', 'bing', 'searxng', 'dual'];
  resumeMode: readonly ['auto', 'force_resume', 'start_over'];
  scannedPdfOcrBackend: readonly ['auto', 'tesseract', 'none'];
  repairDedupeRule: readonly ['domain_once', 'domain_and_status', 'none'];
  automationQueueStorageEngine: readonly ['sqlite', 'memory'];
}

export interface SharedStorageOptionValues {
  destinationType: readonly ['local', 's3'];
}

export interface SharedSettingsOptionValues {
  runtime: SharedRuntimeOptionValues;
  storage: SharedStorageOptionValues;
}

export const SETTINGS_OPTION_VALUES: SharedSettingsOptionValues;
