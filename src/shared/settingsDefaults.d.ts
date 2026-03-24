// AUTO-GENERATED from RUNTIME_SETTINGS_REGISTRY — do not edit manually.
// Run: node tools/gui-react/scripts/generateManifestTypes.js

export declare const SETTINGS_DEFAULTS: {
  readonly convergence: Readonly<Record<string, number | boolean>>;
  readonly runtime: Readonly<Record<string, string | number | boolean>>;
  readonly storage: Readonly<{
    enabled: boolean;
    destinationType: 'local' | 's3';
    localDirectory: string;
    awsRegion: string;
    s3Bucket: string;
    s3Prefix: string;
    s3AccessKeyId: string;
  }>;
  readonly ui: Readonly<{
    studioAutoSaveAllEnabled: boolean;
    studioAutoSaveEnabled: boolean;
    studioAutoSaveMapEnabled: boolean;
    runtimeAutoSaveEnabled: boolean;
    storageAutoSaveEnabled: boolean;
  }>;
  readonly autosave: Readonly<{
    debounceMs: Readonly<{
      runtime: number;
      storage: number;
      llmRoutes: number;
      uiSettings: number;
      studioDocs: number;
      studioMap: number;
    }>;
    statusMs: Readonly<{
      studioSavedIndicatorReset: number;
    }>;
  }>;
};

export declare const SETTINGS_OPTION_VALUES: {
  readonly runtime: Readonly<{
    fetcherAdapter: readonly string[];
    pipelineSchemaEnforcementMode: readonly string[];
    repairDedupeRule: readonly string[];
    searchEngines: readonly string[];
    searchEnginesFallback: readonly string[];
  }>;
  readonly storage: Readonly<{
    destinationType: readonly ('local' | 's3')[];
  }>;
};

export declare const SEARXNG_AVAILABLE_ENGINES: readonly string[];
