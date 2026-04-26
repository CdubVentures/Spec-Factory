// AUTO-GENERATED from RUNTIME_SETTINGS_REGISTRY — do not edit manually.
// Run: node tools/gui-react/scripts/generateManifestTypes.js

export declare const SETTINGS_DEFAULTS: {
  readonly convergence: Readonly<Record<string, number | boolean>>;
  readonly runtime: Readonly<Record<string, string | number | boolean>>;
  readonly storage: Readonly<Record<string, never>>;
  readonly ui: Readonly<{
    studioAutoSaveAllEnabled: boolean;
    studioAutoSaveEnabled: boolean;
    studioAutoSaveMapEnabled: boolean;
    runtimeAutoSaveEnabled: boolean;
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
    autoScrollStrategy: readonly string[];
    fetchSuiteMode: readonly string[];
    llmOperationStreamingMode: readonly string[];
    pipelineSchemaEnforcementMode: readonly string[];
    searchEngines: readonly string[];
    searchEnginesFallback: readonly string[];
    crawleeWaitUntil: readonly string[];
    overlayDismissalMode: readonly string[];
  }>;
  readonly storage: Readonly<Record<string, never>>;
};

export declare const SEARXNG_AVAILABLE_ENGINES: readonly string[];
