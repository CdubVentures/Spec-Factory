import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../../../../src/shared/settingsDefaults.js';

export interface ConvergenceBoolKnob {
  key: string;
  label: string;
  tip?: string;
  type: 'bool';
}

export interface ConvergenceNumericKnob {
  key: string;
  label: string;
  tip?: string;
  type: 'int' | 'float';
  min: number;
  max: number;
  step?: number;
}

export type ConvergenceKnob = ConvergenceBoolKnob | ConvergenceNumericKnob;

export interface ConvergenceKnobGroup {
  label: string;
  knobs: ConvergenceKnob[];
}

export const CONVERGENCE_KNOB_GROUPS = [
  {
    label: 'Convergence Loop',
    knobs: [
      { key: 'convergenceMaxRounds', label: 'Max Rounds', tip: 'Maximum convergence rounds before stopping. Higher values give more chances to fill missing fields but cost more LLM calls.', type: 'int', min: 1, max: 12 },
      { key: 'convergenceNoProgressLimit', label: 'No-Progress Streak Limit', tip: 'Stop after this many consecutive rounds with no improvement. Lower values save budget; higher values tolerate slow-burn discovery.', type: 'int', min: 1, max: 6 },
      { key: 'convergenceMaxLowQualityRounds', label: 'Max Low-Quality Rounds', tip: 'Stop after this many rounds where no identity-matched sources were found or confidence stayed below threshold.', type: 'int', min: 1, max: 6 },
      { key: 'convergenceLowQualityConfidence', label: 'Low Quality Confidence Threshold', tip: 'Confidence below this value counts the round as low-quality. Raise to be stricter about what counts as progress.', type: 'float', min: 0, max: 1, step: 0.05 },
      { key: 'convergenceMaxDispatchQueries', label: 'Max Dispatch Queries per Round', tip: 'Cap on search queries dispatched per convergence round from NeedSet deficits. Higher values widen discovery but increase API cost.', type: 'int', min: 5, max: 50 },
      { key: 'convergenceMaxTargetFields', label: 'Max Target Fields per Round', tip: 'Cap on candidate fields targeted per round. Higher values attempt more fields per extraction pass.', type: 'int', min: 5, max: 80 },
    ],
  },
  {
    label: 'NeedSet Identity Caps',
    knobs: [
      { key: 'needsetCapIdentityLocked', label: 'Locked', tip: 'Max effective confidence when product identity is locked (fully confirmed). Normally 1.0.', type: 'float', min: 0.5, max: 1, step: 0.05 },
      { key: 'needsetCapIdentityProvisional', label: 'Provisional', tip: 'Max effective confidence when identity is provisional (likely correct but not fully confirmed).', type: 'float', min: 0.5, max: 0.9, step: 0.01 },
      { key: 'needsetCapIdentityConflict', label: 'Conflict', tip: 'Max effective confidence when identity has conflicting signals. Lower values force more re-verification.', type: 'float', min: 0.2, max: 0.6, step: 0.01 },
      { key: 'needsetCapIdentityUnlocked', label: 'Unlocked', tip: 'Max effective confidence when identity is not yet confirmed. Lower values keep NeedSet scores conservative until identity resolves.', type: 'float', min: 0.3, max: 0.8, step: 0.01 },
    ],
  },
  {
    label: 'NeedSet Freshness Decay',
    knobs: [
      { key: 'needsetEvidenceDecayDays', label: 'Decay Half-Life (days)', tip: 'Number of days until evidence confidence is halved. Lower values penalize stale evidence more aggressively, higher values trust older evidence longer.', type: 'int', min: 1, max: 90 },
      { key: 'needsetEvidenceDecayFloor', label: 'Decay Floor', tip: 'Minimum decay multiplier; even very old evidence retains at least this fraction of its confidence. Set to 0 to allow full decay.', type: 'float', min: 0, max: 0.9, step: 0.05 },
    ],
  },
  {
    label: 'Consensus - LLM Weights',
    knobs: [
      { key: 'consensusLlmWeightTier1', label: 'LLM Tier 1 (Manufacturer)', tip: 'Weight applied to LLM-extracted candidates from tier-1 (manufacturer) sources in consensus scoring.', type: 'float', min: 0.3, max: 0.9, step: 0.05 },
      { key: 'consensusLlmWeightTier2', label: 'LLM Tier 2 (Lab Review)', tip: 'Weight applied to LLM-extracted candidates from tier-2 (lab review) sources.', type: 'float', min: 0.2, max: 0.7, step: 0.05 },
      { key: 'consensusLlmWeightTier3', label: 'LLM Tier 3 (Retail)', tip: 'Weight applied to LLM-extracted candidates from tier-3 (retail) sources.', type: 'float', min: 0.1, max: 0.4, step: 0.05 },
      { key: 'consensusLlmWeightTier4', label: 'LLM Tier 4 (Unverified)', tip: 'Weight applied to LLM-extracted candidates from tier-4 (unverified) sources. Keep low to prevent unreliable data from winning consensus.', type: 'float', min: 0.05, max: 0.3, step: 0.05 },
    ],
  },
  {
    label: 'Consensus - Tier Weights',
    knobs: [
      { key: 'consensusTier1Weight', label: 'Tier 1 Weight', tip: 'Base scoring weight for all tier-1 (manufacturer) evidence rows in consensus. Higher values strongly prefer official sources.', type: 'float', min: 0.8, max: 1, step: 0.05 },
      { key: 'consensusTier2Weight', label: 'Tier 2 Weight', tip: 'Base scoring weight for tier-2 (lab review) evidence rows.', type: 'float', min: 0.5, max: 0.9, step: 0.05 },
      { key: 'consensusTier3Weight', label: 'Tier 3 Weight', tip: 'Base scoring weight for tier-3 (retail) evidence rows.', type: 'float', min: 0.2, max: 0.6, step: 0.05 },
      { key: 'consensusTier4Weight', label: 'Tier 4 Weight', tip: 'Base scoring weight for tier-4 (unverified) evidence rows. Lower values reduce influence of unverified sources.', type: 'float', min: 0.1, max: 0.4, step: 0.05 },
    ],
  },
  {
    label: 'SERP Triage',
    knobs: [
      { key: 'serpTriageMinScore', label: 'Min Score Threshold', tip: 'Minimum LLM triage score (1-10) for a SERP result to pass. Higher values filter more aggressively.', type: 'int', min: 1, max: 10 },
      { key: 'serpTriageMaxUrls', label: 'Max URLs After Triage', tip: 'Maximum number of URLs kept after triage scoring. Lower values reduce fetch volume; higher values increase coverage.', type: 'int', min: 5, max: 30 },
      { key: 'serpTriageEnabled', label: 'Triage Enabled', tip: 'Enable LLM-powered SERP triage. When off, all search results pass through unfiltered.', type: 'bool' },
    ],
  },
  {
    label: 'Retrieval',
    knobs: [
      { key: 'retrievalMaxHitsPerField', label: 'Max Hits Per Field', tip: 'Maximum evidence rows retrieved per field during tier-aware retrieval. Higher values increase recall but slow scoring.', type: 'int', min: 5, max: 50 },
      { key: 'retrievalMaxPrimeSources', label: 'Max Prime Sources', tip: 'Maximum prime sources selected per field for extraction context. Higher values provide more evidence to LLM but increase token usage.', type: 'int', min: 3, max: 20 },
      { key: 'retrievalIdentityFilterEnabled', label: 'Identity Filter Enabled', tip: 'Filter retrieval results by product identity match. Disable to include all sources regardless of identity confidence.', type: 'bool' },
    ],
  },
] as ConvergenceKnobGroup[];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);

export interface RuntimeSettingDefaults {
  profile: RuntimeProfile;
  searchProvider: RuntimeSearchProvider;
  phase2LlmModel: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
  llmFallbackPlanModel: string;
  llmFallbackExtractModel: string;
  llmFallbackValidateModel: string;
  llmFallbackWriteModel: string;
  resumeMode: RuntimeResumeMode;
  scannedPdfOcrBackend: RuntimeOcrBackend;
  fetchConcurrency: number;
  perHostMinDelayMs: number;
  llmTokensPlan: number;
  llmTokensTriage: number;
  llmTokensFast: number;
  llmTokensReasoning: number;
  llmTokensExtract: number;
  llmTokensValidate: number;
  llmTokensWrite: number;
  llmTokensPlanFallback: number;
  llmTokensExtractFallback: number;
  llmTokensValidateFallback: number;
  llmTokensWriteFallback: number;
  resumeWindowHours: number;
  reextractAfterHours: number;
  scannedPdfOcrMaxPages: number;
  scannedPdfOcrMaxPairs: number;
  scannedPdfOcrMinCharsPerPage: number;
  scannedPdfOcrMinLinesPerPage: number;
  scannedPdfOcrMinConfidence: number;
  crawleeRequestHandlerTimeoutSecs: number;
  dynamicFetchRetryBudget: number;
  dynamicFetchRetryBackoffMs: number;
  dynamicFetchPolicyMapJson: string;
  scannedPdfOcrEnabled: boolean;
  scannedPdfOcrPromoteCandidates: boolean;
  phase2LlmEnabled: boolean;
  phase3LlmTriageEnabled: boolean;
  llmFallbackEnabled: boolean;
  reextractIndexed: boolean;
  discoveryEnabled: boolean;
  dynamicCrawleeEnabled: boolean;
  crawleeHeadless: boolean;
  runtimeAutoSaveEnabled: boolean;
}

export type RuntimeProfile = 'fast' | 'standard' | 'thorough';
export type RuntimeSearchProvider = 'none' | 'google' | 'bing' | 'searxng' | 'duckduckgo' | 'dual';
export type RuntimeResumeMode = 'auto' | 'force_resume' | 'start_over';
export type RuntimeOcrBackend = 'auto' | 'tesseract' | 'none';

export const RUNTIME_PROFILE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.profile] as RuntimeProfile[],
);

export const RUNTIME_SEARCH_PROVIDER_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.searchProvider] as RuntimeSearchProvider[],
);

export const RUNTIME_RESUME_MODE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.resumeMode] as RuntimeResumeMode[],
);

export const RUNTIME_OCR_BACKEND_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.scannedPdfOcrBackend] as RuntimeOcrBackend[],
);

export const RUNTIME_SETTING_DEFAULTS: RuntimeSettingDefaults = {
  ...(SETTINGS_DEFAULTS.runtime as unknown as RuntimeSettingDefaults),
};

export type StorageDestinationOption = 'local' | 's3';

export interface StorageSettingDefaults {
  enabled: boolean;
  destinationType: StorageDestinationOption;
  localDirectory: string;
  s3Region: string;
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

export interface LlmSettingLimit {
  min: number;
  max: number;
  step?: number;
}

export interface LlmRoutePresetLimits {
  maxTokensMin: number;
  maxTokensMax: number;
}

export interface LlmRoutePresetConfig extends LlmRoutePresetLimits {
  modelLadderToday: string;
  singleSourceData: boolean;
  allSourceData: boolean;
  enableWebsearch: boolean;
  allSourcesConfidenceRepatch: boolean;
  minEvidenceRefsRequired?: number;
}

export const LLM_SETTING_LIMITS = {
  effort: { min: 1, max: 10 },
  maxTokens: { min: 256, max: 65536, step: 256 },
  minEvidenceRefs: { min: 1, max: 5 },
} satisfies {
  effort: LlmSettingLimit;
  maxTokens: LlmSettingLimit;
  minEvidenceRefs: LlmSettingLimit;
};

export const LLM_ROUTE_PRESET_LIMITS = {
  fast: {
    maxTokensMin: 2048,
    maxTokensMax: 6144,
    modelLadderToday: 'gpt-5-low -> gpt-5-medium',
    singleSourceData: true,
    allSourceData: false,
    enableWebsearch: false,
    allSourcesConfidenceRepatch: true,
    minEvidenceRefsRequired: 1,
  },
  balanced: {
    maxTokensMin: 4096,
    maxTokensMax: 8192,
    modelLadderToday: 'gpt-5-medium -> gpt-5.1-medium',
    singleSourceData: true,
    allSourceData: false,
    enableWebsearch: false,
    allSourcesConfidenceRepatch: true,
  },
  deep: {
    maxTokensMin: 12288,
    maxTokensMax: 65536,
    modelLadderToday: 'gpt-5.2-high -> gpt-5.1-high',
    singleSourceData: true,
    allSourceData: true,
    enableWebsearch: true,
    allSourcesConfidenceRepatch: true,
    minEvidenceRefsRequired: 2,
  },
} as const satisfies Record<'fast' | 'balanced' | 'deep', LlmRoutePresetConfig>;

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
