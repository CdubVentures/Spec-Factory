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
  {
    label: 'Lane Concurrency',
    knobs: [
      { key: 'laneConcurrencySearch', label: 'Search Lane Concurrency', tip: 'Maximum concurrent work units in the search lane.', type: 'int', min: 1, max: 32 },
      { key: 'laneConcurrencyFetch', label: 'Fetch Lane Concurrency', tip: 'Maximum concurrent work units in the fetch lane.', type: 'int', min: 1, max: 32 },
      { key: 'laneConcurrencyParse', label: 'Parse Lane Concurrency', tip: 'Maximum concurrent work units in the parse lane.', type: 'int', min: 1, max: 32 },
      { key: 'laneConcurrencyLlm', label: 'LLM Lane Concurrency', tip: 'Maximum concurrent work units in the llm lane.', type: 'int', min: 1, max: 32 },
    ],
  },
] as ConvergenceKnobGroup[];

export const CONVERGENCE_SETTING_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.convergence,
} satisfies Record<string, number | boolean>);

export interface RuntimeSettingDefaults {
  runProfile: RuntimeProfile;
  profile: RuntimeProfile;
  searchProvider: RuntimeSearchProvider;
  searxngBaseUrl: string;
  bingSearchEndpoint: string;
  bingSearchKey: string;
  googleCseCx: string;
  googleCseKey: string;
  llmPlanApiKey: string;
  duckduckgoBaseUrl: string;
  duckduckgoTimeoutMs: number;
  llmModelPlan: string;
  phase2LlmModel: string;
  llmModelTriage: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
  needsetEvidenceDecayDays: number;
  needsetEvidenceDecayFloor: number;
  needsetRequiredWeightIdentity: number;
  needsetRequiredWeightCritical: number;
  needsetRequiredWeightRequired: number;
  needsetRequiredWeightExpected: number;
  needsetRequiredWeightOptional: number;
  needsetMissingMultiplier: number;
  needsetTierDeficitMultiplier: number;
  needsetMinRefsDeficitMultiplier: number;
  needsetConflictMultiplier: number;
  needsetIdentityLockThreshold: number;
  needsetIdentityProvisionalThreshold: number;
  needsetDefaultIdentityAuditLimit: number;
  consensusMethodWeightNetworkJson: number;
  consensusMethodWeightAdapterApi: number;
  consensusMethodWeightStructuredMeta: number;
  consensusMethodWeightPdf: number;
  consensusMethodWeightTableKv: number;
  consensusMethodWeightDom: number;
  consensusMethodWeightLlmExtractBase: number;
  consensusPolicyBonus: number;
  consensusWeightedMajorityThreshold: number;
  consensusStrictAcceptanceDomainCount: number;
  consensusRelaxedAcceptanceDomainCount: number;
  consensusInstrumentedFieldThreshold: number;
  consensusConfidenceScoringBase: number;
  consensusPassTargetIdentityStrong: number;
  consensusPassTargetNormal: number;
  retrievalTierWeightTier1: number;
  retrievalTierWeightTier2: number;
  retrievalTierWeightTier3: number;
  retrievalTierWeightTier4: number;
  retrievalTierWeightTier5: number;
  retrievalDocKindWeightManualPdf: number;
  retrievalDocKindWeightSpecPdf: number;
  retrievalDocKindWeightSupport: number;
  retrievalDocKindWeightLabReview: number;
  retrievalDocKindWeightProductPage: number;
  retrievalDocKindWeightOther: number;
  retrievalMethodWeightTable: number;
  retrievalMethodWeightKv: number;
  retrievalMethodWeightJsonLd: number;
  retrievalMethodWeightLlmExtract: number;
  retrievalMethodWeightHelperSupportive: number;
  retrievalAnchorScorePerMatch: number;
  retrievalIdentityScorePerMatch: number;
  retrievalUnitMatchBonus: number;
  retrievalDirectFieldMatchBonus: number;
  retrievalInternalsMapJson: string;
  evidenceTextMaxChars: number;
  evidencePackLimitsMapJson: string;
  llmExtractMaxTokens: number;
  llmExtractMaxSnippetsPerBatch: number;
  llmExtractMaxSnippetChars: number;
  llmExtractSkipLowSignal: boolean;
  llmExtractReasoningBudget: number;
  llmReasoningMode: boolean;
  llmReasoningBudget: number;
  llmMonthlyBudgetUsd: number;
  llmPerProductBudgetUsd: number;
  llmDisableBudgetGuards: boolean;
  llmMaxCallsPerRound: number;
  llmMaxOutputTokens: number;
  llmVerifySampleRate: number;
  llmMaxBatchesPerProduct: number;
  llmMaxEvidenceChars: number;
  llmMaxTokens: number;
  llmTimeoutMs: number;
  llmCostInputPer1M: number;
  llmCostOutputPer1M: number;
  llmCostCachedInputPer1M: number;
  llmVerifyMode: boolean;
  llmPlanFallbackModel: string;
  llmFallbackPlanModel: string;
  llmExtractFallbackModel: string;
  llmFallbackExtractModel: string;
  llmValidateFallbackModel: string;
  llmFallbackValidateModel: string;
  llmWriteFallbackModel: string;
  llmFallbackWriteModel: string;
  resumeMode: RuntimeResumeMode;
  indexingResumeSeedLimit: number;
  indexingResumePersistLimit: number;
  indexingSchemaPacketsValidationEnabled: boolean;
  indexingSchemaPacketsValidationStrict: boolean;
  scannedPdfOcrBackend: RuntimeOcrBackend;
  fetchConcurrency: number;
  perHostMinDelayMs: number;
  llmMaxOutputTokensPlan: number;
  llmTokensPlan: number;
  llmMaxOutputTokensTriage: number;
  llmTokensTriage: number;
  llmMaxOutputTokensFast: number;
  llmTokensFast: number;
  llmMaxOutputTokensReasoning: number;
  llmTokensReasoning: number;
  llmMaxOutputTokensExtract: number;
  llmTokensExtract: number;
  llmMaxOutputTokensValidate: number;
  llmTokensValidate: number;
  llmMaxOutputTokensWrite: number;
  llmTokensWrite: number;
  llmMaxOutputTokensPlanFallback: number;
  llmTokensPlanFallback: number;
  llmMaxOutputTokensExtractFallback: number;
  llmTokensExtractFallback: number;
  llmMaxOutputTokensValidateFallback: number;
  llmTokensValidateFallback: number;
  llmMaxOutputTokensWriteFallback: number;
  llmTokensWriteFallback: number;
  llmExtractionCacheEnabled: boolean;
  llmExtractionCacheDir: string;
  llmExtractionCacheTtlMs: number;
  llmMaxCallsPerProductTotal: number;
  llmMaxCallsPerProductFast: number;
  resumeWindowHours: number;
  reextractAfterHours: number;
  convergenceIdentityFailFastRounds: number;
  identityGatePublishThreshold: number;
  identityGateBaseMatchThreshold: number;
  identityGateEasyAmbiguityReduction: number;
  identityGateMediumAmbiguityReduction: number;
  identityGateHardAmbiguityReduction: number;
  identityGateVeryHardAmbiguityIncrease: number;
  identityGateExtraHardAmbiguityIncrease: number;
  identityGateMissingStrongIdPenalty: number;
  identityGateHardMissingStrongIdIncrease: number;
  identityGateVeryHardMissingStrongIdIncrease: number;
  identityGateExtraHardMissingStrongIdIncrease: number;
  identityGateNumericTokenBoost: number;
  identityGateNumericRangeThreshold: number;
  identityGateThresholdBoundsMapJson: string;
  parsingConfidenceBaseMapJson: string;
  qualityGateIdentityThreshold: number;
  scannedPdfOcrMaxPages: number;
  scannedPdfOcrMaxPairs: number;
  scannedPdfOcrMinCharsPerPage: number;
  scannedPdfOcrMinLinesPerPage: number;
  scannedPdfOcrMinConfidence: number;
  crawleeRequestHandlerTimeoutSecs: number;
  dynamicFetchRetryBudget: number;
  dynamicFetchRetryBackoffMs: number;
  dynamicFetchPolicyMapJson: string;
  searchProfileCapMapJson: string;
  serpRerankerWeightMapJson: string;
  scannedPdfOcrEnabled: boolean;
  scannedPdfOcrPromoteCandidates: boolean;
  llmPlanDiscoveryQueries: boolean;
  phase2LlmEnabled: boolean;
  llmSerpRerankEnabled: boolean;
  phase3LlmTriageEnabled: boolean;
  llmFallbackEnabled: boolean;
  reextractIndexed: boolean;
  discoveryEnabled: boolean;
  fetchCandidateSources: boolean;
  discoveryMaxQueries: number;
  discoveryResultsPerQuery: number;
  discoveryMaxDiscovered: number;
  discoveryQueryConcurrency: number;
  manufacturerBroadDiscovery: boolean;
  manufacturerSeedSearchUrls: boolean;
  maxUrlsPerProduct: number;
  maxCandidateUrls: number;
  maxPagesPerDomain: number;
  uberMaxUrlsPerProduct: number;
  uberMaxUrlsPerDomain: number;
  maxRunSeconds: number;
  maxJsonBytes: number;
  maxPdfBytes: number;
  specDbDir: string;
  pdfBackendRouterEnabled: boolean;
  pdfPreferredBackend: string;
  pdfBackendRouterTimeoutMs: number;
  pdfBackendRouterMaxPages: number;
  pdfBackendRouterMaxPairs: number;
  pdfBackendRouterMaxTextPreviewChars: number;
  capturePageScreenshotEnabled: boolean;
  capturePageScreenshotFormat: string;
  capturePageScreenshotQuality: number;
  capturePageScreenshotMaxBytes: number;
  capturePageScreenshotSelectors: string;
  runtimeCaptureScreenshots: boolean;
  runtimeScreenshotMode: string;
  visualAssetCaptureEnabled: boolean;
  visualAssetCaptureMaxPerSource: number;
  visualAssetStoreOriginal: boolean;
  visualAssetRetentionDays: number;
  visualAssetPhashEnabled: boolean;
  visualAssetReviewFormat: string;
  visualAssetReviewLgMaxSide: number;
  visualAssetReviewSmMaxSide: number;
  visualAssetReviewLgQuality: number;
  visualAssetReviewSmQuality: number;
  visualAssetRegionCropMaxSide: number;
  visualAssetRegionCropQuality: number;
  visualAssetLlmMaxBytes: number;
  visualAssetMinWidth: number;
  visualAssetMinHeight: number;
  visualAssetMinSharpness: number;
  visualAssetMinEntropy: number;
  visualAssetMaxPhashDistance: number;
  visualAssetHeroSelectorMapJson: string;
  chartExtractionEnabled: boolean;
  runtimeControlFile: string;
  articleExtractorV2Enabled: boolean;
  articleExtractorMinChars: number;
  articleExtractorMinScore: number;
  articleExtractorMaxChars: number;
  articleExtractorDomainPolicyMapJson: string;
  htmlTableExtractorV2: boolean;
  staticDomExtractorEnabled: boolean;
  staticDomMode: string;
  staticDomTargetMatchThreshold: number;
  staticDomMaxEvidenceSnippets: number;
  structuredMetadataExtructEnabled: boolean;
  structuredMetadataExtructUrl: string;
  structuredMetadataExtructTimeoutMs: number;
  structuredMetadataExtructMaxItemsPerSurface: number;
  structuredMetadataExtructCacheEnabled: boolean;
  structuredMetadataExtructCacheLimit: number;
  domSnippetMaxChars: number;
  helperFilesEnabled: boolean;
  helperFilesRoot: string;
  helperSupportiveEnabled: boolean;
  helperSupportiveFillMissing: boolean;
  helperSupportiveMaxSources: number;
  helperAutoSeedTargets: boolean;
  helperActiveSyncLimit: number;
  fieldRewardHalfLifeDays: number;
  batchStrategy: string;
  driftDetectionEnabled: boolean;
  driftPollSeconds: number;
  driftScanMaxProducts: number;
  driftAutoRepublish: boolean;
  reCrawlStaleAfterDays: number;
  aggressiveModeEnabled: boolean;
  aggressiveConfidenceThreshold: number;
  aggressiveMaxSearchQueries: number;
  aggressiveEvidenceAuditEnabled: boolean;
  aggressiveEvidenceAuditBatchSize: number;
  aggressiveMaxTimePerProductMs: number;
  aggressiveThoroughFromRound: number;
  aggressiveRound1MaxUrls: number;
  aggressiveRound1MaxCandidateUrls: number;
  aggressiveLlmMaxCallsPerRound: number;
  aggressiveLlmMaxCallsPerProductTotal: number;
  aggressiveLlmTargetMaxFields: number;
  aggressiveLlmDiscoveryPasses: number;
  aggressiveLlmDiscoveryQueryCap: number;
  uberAggressiveEnabled: boolean;
  uberMaxRounds: number;
  cortexEnabled: boolean;
  cortexAsyncEnabled: boolean;
  cortexBaseUrl: string;
  cortexApiKey: string;
  cortexAsyncBaseUrl: string;
  cortexAsyncSubmitPath: string;
  cortexAsyncStatusPath: string;
  cortexSyncTimeoutMs: number;
  cortexAsyncPollIntervalMs: number;
  cortexAsyncMaxWaitMs: number;
  cortexModelFast: string;
  cortexModelAudit: string;
  cortexModelDom: string;
  cortexModelReasoningDeep: string;
  cortexModelVision: string;
  cortexModelSearchFast: string;
  cortexModelRerankFast: string;
  cortexModelSearchDeep: string;
  cortexAutoStart: boolean;
  cortexAutoRestartOnAuth: boolean;
  cortexEnsureReadyTimeoutMs: number;
  cortexStartReadyTimeoutMs: number;
  cortexFailureThreshold: number;
  cortexCircuitOpenMs: number;
  cortexEscalateConfidenceLt: number;
  cortexEscalateIfConflict: boolean;
  cortexEscalateCriticalOnly: boolean;
  cortexMaxDeepFieldsPerProduct: number;
  outputMode: string;
  localMode: boolean;
  dryRun: boolean;
  mirrorToS3: boolean;
  mirrorToS3Input: boolean;
  localInputRoot: string;
  localOutputRoot: string;
  runtimeEventsKey: string;
  writeMarkdownSummary: boolean;
  awsRegion: string;
  s3Bucket: string;
  s3InputPrefix: string;
  s3OutputPrefix: string;
  eloSupabaseAnonKey: string;
  eloSupabaseEndpoint: string;
  llmEnabled: boolean;
  llmWriteSummary: boolean;
  llmProvider: string;
  llmBaseUrl: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  allowBelowPassTargetFill: boolean;
  indexingHelperFilesEnabled: boolean;
  llmPlanProvider: string;
  llmPlanBaseUrl: string;
  manufacturerDeepResearchEnabled: boolean;
  maxManufacturerUrlsPerProduct: number;
  maxManufacturerPagesPerDomain: number;
  manufacturerReserveUrls: number;
  userAgent: string;
  selfImproveEnabled: boolean;
  learningConfidenceThreshold: number;
  componentLexiconDecayDays: number;
  componentLexiconExpireDays: number;
  fieldAnchorsDecayDays: number;
  urlMemoryDecayDays: number;
  maxHypothesisItems: number;
  hypothesisAutoFollowupRounds: number;
  hypothesisFollowupUrlsPerRound: number;
  disableGoogleCse: boolean;
  cseRescueOnlyMode: boolean;
  duckduckgoEnabled: boolean;
  cseRescueRequiredIteration: number;
  endpointSignalLimit: number;
  endpointSuggestionLimit: number;
  endpointNetworkScanLimit: number;
  dynamicCrawleeEnabled: boolean;
  crawleeHeadless: boolean;
  fetchSchedulerEnabled: boolean;
  fetchSchedulerMaxRetries: number;
  fetchSchedulerFallbackWaitMs: number;
  fetchSchedulerInternalsMapJson: string;
  preferHttpFetcher: boolean;
  pageGotoTimeoutMs: number;
  pageNetworkIdleTimeoutMs: number;
  postLoadWaitMs: number;
  frontierDbPath: string;
  frontierEnableSqlite: boolean;
  frontierStripTrackingParams: boolean;
  frontierQueryCooldownSeconds: number;
  frontierCooldown404Seconds: number;
  frontierCooldown404RepeatSeconds: number;
  frontierCooldown410Seconds: number;
  frontierCooldownTimeoutSeconds: number;
  frontierCooldown403BaseSeconds: number;
  frontierCooldown429BaseSeconds: number;
  frontierBackoffMaxExponent: number;
  frontierPathPenaltyNotfoundThreshold: number;
  frontierBlockedDomainThreshold: number;
  frontierRepairSearchEnabled: boolean;
  repairDedupeRule: RuntimeRepairDedupeRule;
  automationQueueStorageEngine: RuntimeAutomationQueueStorageEngine;
  autoScrollEnabled: boolean;
  autoScrollPasses: number;
  autoScrollDelayMs: number;
  graphqlReplayEnabled: boolean;
  maxGraphqlReplays: number;
  maxNetworkResponsesPerPage: number;
  robotsTxtCompliant: boolean;
  robotsTxtTimeoutMs: number;
  runtimeTraceEnabled: boolean;
  runtimeTraceFetchRing: number;
  runtimeTraceLlmRing: number;
  runtimeTraceLlmPayloads: boolean;
  eventsJsonWrite: boolean;
  queueJsonWrite: boolean;
  billingJsonWrite: boolean;
  brainJsonWrite: boolean;
  intelJsonWrite: boolean;
  corpusJsonWrite: boolean;
  learningJsonWrite: boolean;
  cacheJsonWrite: boolean;
  daemonConcurrency: number;
  daemonGracefulShutdownTimeoutMs: number;
  importsRoot: string;
  importsPollSeconds: number;
  authoritySnapshotEnabled: boolean;
  runtimeScreencastEnabled: boolean;
  runtimeScreencastFps: number;
  runtimeScreencastQuality: number;
  runtimeScreencastMaxWidth: number;
  runtimeScreencastMaxHeight: number;
  runtimeAutoSaveEnabled: boolean;
}

export type RuntimeProfile = 'fast' | 'standard' | 'thorough';
export type RuntimeSearchProvider = 'none' | 'google' | 'bing' | 'searxng' | 'duckduckgo' | 'dual';
export type RuntimeResumeMode = 'auto' | 'force_resume' | 'start_over';
export type RuntimeOcrBackend = 'auto' | 'tesseract' | 'none';
export type RuntimeRepairDedupeRule = 'domain_once' | 'domain_and_status' | 'none';
export type RuntimeAutomationQueueStorageEngine = 'sqlite' | 'memory';

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

export const RUNTIME_REPAIR_DEDUPE_RULE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.repairDedupeRule] as RuntimeRepairDedupeRule[],
);

export const RUNTIME_AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS = Object.freeze(
  [...SETTINGS_OPTION_VALUES.runtime.automationQueueStorageEngine] as RuntimeAutomationQueueStorageEngine[],
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
