import { LLM_SETTING_LIMITS } from './settingsManifest';
import type {
  RuntimeAutomationQueueStorageEngine,
  RuntimeOcrBackend,
  RuntimeProfile,
  RuntimeRepairDedupeRule,
  RuntimeResumeMode,
  RuntimeSearchProvider,
} from './settingsManifest';
import type { RuntimeSettings, RuntimeSettingsNumericBaseline } from './runtimeSettingsAuthority';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;
const LLM_MAX_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.max;

type RuntimeStringHydrationBinding = {
  key: string;
  allowEmpty?: boolean;
  apply: (value: string) => void;
};

type RuntimeNumberHydrationBinding = {
  key: string;
  apply: (value: number) => void;
};

type RuntimeBooleanHydrationBinding = {
  key: string;
  apply: (value: boolean) => void;
};

export interface RuntimeHydrationBindings {
  stringBindings: RuntimeStringHydrationBinding[];
  numberBindings: RuntimeNumberHydrationBinding[];
  booleanBindings: RuntimeBooleanHydrationBinding[];
}

export interface RuntimeHydrationBindingSetters {
  setProfile: (value: RuntimeProfile) => void;
  setSearchProvider: (value: RuntimeSearchProvider) => void;
  setSearxngBaseUrl: (value: string) => void;
  setBingSearchEndpoint: (value: string) => void;
  setBingSearchKey: (value: string) => void;
  setGoogleCseCx: (value: string) => void;
  setGoogleCseKey: (value: string) => void;
  setLlmPlanApiKey: (value: string) => void;
  setDuckduckgoBaseUrl: (value: string) => void;
  setPhase2LlmModel: (value: string) => void;
  setPhase3LlmModel: (value: string) => void;
  setLlmModelFast: (value: string) => void;
  setLlmModelReasoning: (value: string) => void;
  setLlmModelExtract: (value: string) => void;
  setLlmModelValidate: (value: string) => void;
  setLlmModelWrite: (value: string) => void;
  setNeedsetEvidenceDecayDays: (value: string) => void;
  setNeedsetEvidenceDecayFloor: (value: string) => void;
  setNeedsetRequiredWeightIdentity: (value: string) => void;
  setNeedsetRequiredWeightCritical: (value: string) => void;
  setNeedsetRequiredWeightRequired: (value: string) => void;
  setNeedsetRequiredWeightExpected: (value: string) => void;
  setNeedsetRequiredWeightOptional: (value: string) => void;
  setNeedsetMissingMultiplier: (value: string) => void;
  setNeedsetTierDeficitMultiplier: (value: string) => void;
  setNeedsetMinRefsDeficitMultiplier: (value: string) => void;
  setNeedsetConflictMultiplier: (value: string) => void;
  setNeedsetIdentityLockThreshold: (value: string) => void;
  setNeedsetIdentityProvisionalThreshold: (value: string) => void;
  setNeedsetDefaultIdentityAuditLimit: (value: string) => void;
  setConsensusMethodWeightNetworkJson: (value: string) => void;
  setConsensusMethodWeightAdapterApi: (value: string) => void;
  setConsensusMethodWeightStructuredMeta: (value: string) => void;
  setConsensusMethodWeightPdf: (value: string) => void;
  setConsensusMethodWeightTableKv: (value: string) => void;
  setConsensusMethodWeightDom: (value: string) => void;
  setConsensusPolicyBonus: (value: string) => void;
  setConsensusWeightedMajorityThreshold: (value: string) => void;
  setConsensusStrictAcceptanceDomainCount: (value: string) => void;
  setConsensusRelaxedAcceptanceDomainCount: (value: string) => void;
  setConsensusInstrumentedFieldThreshold: (value: string) => void;
  setConsensusConfidenceScoringBase: (value: string) => void;
  setConsensusPassTargetIdentityStrong: (value: string) => void;
  setConsensusPassTargetNormal: (value: string) => void;
  setRetrievalTierWeightTier1: (value: string) => void;
  setRetrievalTierWeightTier2: (value: string) => void;
  setRetrievalTierWeightTier3: (value: string) => void;
  setRetrievalTierWeightTier4: (value: string) => void;
  setRetrievalTierWeightTier5: (value: string) => void;
  setRetrievalDocKindWeightManualPdf: (value: string) => void;
  setRetrievalDocKindWeightSpecPdf: (value: string) => void;
  setRetrievalDocKindWeightSupport: (value: string) => void;
  setRetrievalDocKindWeightLabReview: (value: string) => void;
  setRetrievalDocKindWeightProductPage: (value: string) => void;
  setRetrievalDocKindWeightOther: (value: string) => void;
  setRetrievalMethodWeightTable: (value: string) => void;
  setRetrievalMethodWeightKv: (value: string) => void;
  setRetrievalMethodWeightJsonLd: (value: string) => void;
  setRetrievalMethodWeightLlmExtract: (value: string) => void;
  setRetrievalMethodWeightHelperSupportive: (value: string) => void;
  setRetrievalAnchorScorePerMatch: (value: string) => void;
  setRetrievalIdentityScorePerMatch: (value: string) => void;
  setRetrievalUnitMatchBonus: (value: string) => void;
  setRetrievalDirectFieldMatchBonus: (value: string) => void;
  setIdentityGatePublishThreshold: (value: string) => void;
  setIdentityGateBaseMatchThreshold: (value: string) => void;
  setIdentityGateEasyAmbiguityReduction: (value: string) => void;
  setIdentityGateMediumAmbiguityReduction: (value: string) => void;
  setIdentityGateHardAmbiguityReduction: (value: string) => void;
  setIdentityGateVeryHardAmbiguityIncrease: (value: string) => void;
  setIdentityGateExtraHardAmbiguityIncrease: (value: string) => void;
  setIdentityGateMissingStrongIdPenalty: (value: string) => void;
  setIdentityGateHardMissingStrongIdIncrease: (value: string) => void;
  setIdentityGateVeryHardMissingStrongIdIncrease: (value: string) => void;
  setIdentityGateExtraHardMissingStrongIdIncrease: (value: string) => void;
  setIdentityGateNumericTokenBoost: (value: string) => void;
  setIdentityGateNumericRangeThreshold: (value: string) => void;
  setQualityGateIdentityThreshold: (value: string) => void;
  setEvidenceTextMaxChars: (value: string) => void;
  setLlmExtractMaxTokens: (value: string) => void;
  setLlmExtractMaxSnippetsPerBatch: (value: string) => void;
  setLlmExtractMaxSnippetChars: (value: string) => void;
  setLlmExtractReasoningBudget: (value: string) => void;
  setLlmReasoningBudget: (value: string) => void;
  setLlmMonthlyBudgetUsd: (value: string) => void;
  setLlmPerProductBudgetUsd: (value: string) => void;
  setLlmMaxCallsPerRound: (value: string) => void;
  setLlmMaxOutputTokens: (value: string) => void;
  setLlmVerifySampleRate: (value: string) => void;
  setLlmMaxBatchesPerProduct: (value: string) => void;
  setLlmMaxEvidenceChars: (value: string) => void;
  setLlmMaxTokens: (value: string) => void;
  setLlmTimeoutMs: (value: string) => void;
  setLlmCostInputPer1M: (value: string) => void;
  setLlmCostOutputPer1M: (value: string) => void;
  setLlmCostCachedInputPer1M: (value: string) => void;
  setLlmFallbackPlanModel: (value: string) => void;
  setLlmFallbackExtractModel: (value: string) => void;
  setLlmFallbackValidateModel: (value: string) => void;
  setLlmFallbackWriteModel: (value: string) => void;
  setLocalInputRoot: (value: string) => void;
  setLocalOutputRoot: (value: string) => void;
  setRuntimeEventsKey: (value: string) => void;
  setAwsRegion: (value: string) => void;
  setS3Bucket: (value: string) => void;
  setS3InputPrefix: (value: string) => void;
  setS3OutputPrefix: (value: string) => void;
  setEloSupabaseAnonKey: (value: string) => void;
  setEloSupabaseEndpoint: (value: string) => void;
  setLlmProvider: (value: string) => void;
  setLlmBaseUrl: (value: string) => void;
  setOpenaiApiKey: (value: string) => void;
  setAnthropicApiKey: (value: string) => void;
  setResumeMode: (value: RuntimeResumeMode) => void;
  setImportsRoot: (value: string) => void;
  setScannedPdfOcrBackend: (value: RuntimeOcrBackend) => void;
  setDynamicFetchPolicyMapJson: (value: string) => void;
  setSearchProfileCapMapJson: (value: string) => void;
  setSerpRerankerWeightMapJson: (value: string) => void;
  setFetchSchedulerInternalsMapJson?: (value: string) => void;
  setRetrievalInternalsMapJson?: (value: string) => void;
  setEvidencePackLimitsMapJson?: (value: string) => void;
  setIdentityGateThresholdBoundsMapJson?: (value: string) => void;
  setParsingConfidenceBaseMapJson?: (value: string) => void;
  setRepairDedupeRule?: (value: RuntimeRepairDedupeRule) => void;
  setAutomationQueueStorageEngine?: (value: RuntimeAutomationQueueStorageEngine) => void;
  setConsensusMethodWeightLlmExtractBase?: (value: string) => void;
  setFetchConcurrency: (value: string) => void;
  setPerHostMinDelayMs: (value: string) => void;
  setLlmTokensPlan: (value: number) => void;
  setLlmTokensTriage: (value: number) => void;
  setLlmTokensFast: (value: number) => void;
  setLlmTokensReasoning: (value: number) => void;
  setLlmTokensExtract: (value: number) => void;
  setLlmTokensValidate: (value: number) => void;
  setLlmTokensWrite: (value: number) => void;
  setLlmTokensPlanFallback: (value: number) => void;
  setLlmTokensExtractFallback: (value: number) => void;
  setLlmTokensValidateFallback: (value: number) => void;
  setLlmTokensWriteFallback: (value: number) => void;
  setResumeWindowHours: (value: string) => void;
  setReextractAfterHours: (value: string) => void;
  setScannedPdfOcrMaxPages: (value: string) => void;
  setScannedPdfOcrMaxPairs: (value: string) => void;
  setScannedPdfOcrMinCharsPerPage: (value: string) => void;
  setScannedPdfOcrMinLinesPerPage: (value: string) => void;
  setScannedPdfOcrMinConfidence: (value: string) => void;
  setCrawleeRequestHandlerTimeoutSecs: (value: string) => void;
  setDynamicFetchRetryBudget: (value: string) => void;
  setDynamicFetchRetryBackoffMs: (value: string) => void;
  setFetchSchedulerMaxRetries: (value: string) => void;
  setFetchSchedulerFallbackWaitMs: (value: string) => void;
  setPageGotoTimeoutMs: (value: string) => void;
  setPageNetworkIdleTimeoutMs: (value: string) => void;
  setPostLoadWaitMs: (value: string) => void;
  setFrontierDbPath: (value: string) => void;
  setFrontierQueryCooldownSeconds: (value: string) => void;
  setFrontierCooldown404Seconds: (value: string) => void;
  setFrontierCooldown404RepeatSeconds: (value: string) => void;
  setFrontierCooldown410Seconds: (value: string) => void;
  setFrontierCooldownTimeoutSeconds: (value: string) => void;
  setFrontierCooldown403BaseSeconds: (value: string) => void;
  setFrontierCooldown429BaseSeconds: (value: string) => void;
  setFrontierBackoffMaxExponent: (value: string) => void;
  setFrontierPathPenaltyNotfoundThreshold: (value: string) => void;
  setFrontierBlockedDomainThreshold: (value: string) => void;
  setAutoScrollPasses: (value: string) => void;
  setAutoScrollDelayMs: (value: string) => void;
  setMaxGraphqlReplays: (value: string) => void;
  setMaxNetworkResponsesPerPage: (value: string) => void;
  setRobotsTxtTimeoutMs: (value: string) => void;
  setEndpointSignalLimit: (value: string) => void;
  setEndpointSuggestionLimit: (value: string) => void;
  setEndpointNetworkScanLimit: (value: string) => void;
  setDiscoveryMaxQueries: (value: string) => void;
  setDiscoveryResultsPerQuery: (value: string) => void;
  setDiscoveryMaxDiscovered: (value: string) => void;
  setDiscoveryQueryConcurrency: (value: string) => void;
  setMaxUrlsPerProduct: (value: string) => void;
  setMaxCandidateUrls: (value: string) => void;
  setMaxPagesPerDomain: (value: string) => void;
  setUberMaxUrlsPerProduct: (value: string) => void;
  setUberMaxUrlsPerDomain: (value: string) => void;
  setMaxRunSeconds: (value: string) => void;
  setMaxJsonBytes: (value: string) => void;
  setMaxPdfBytes: (value: string) => void;
  setPdfBackendRouterTimeoutMs: (value: string) => void;
  setPdfBackendRouterMaxPages: (value: string) => void;
  setPdfBackendRouterMaxPairs: (value: string) => void;
  setPdfBackendRouterMaxTextPreviewChars: (value: string) => void;
  setCapturePageScreenshotQuality: (value: string) => void;
  setCapturePageScreenshotMaxBytes: (value: string) => void;
  setVisualAssetCaptureMaxPerSource: (value: string) => void;
  setVisualAssetRetentionDays: (value: string) => void;
  setVisualAssetReviewLgMaxSide: (value: string) => void;
  setVisualAssetReviewSmMaxSide: (value: string) => void;
  setVisualAssetReviewLgQuality: (value: string) => void;
  setVisualAssetReviewSmQuality: (value: string) => void;
  setVisualAssetRegionCropMaxSide: (value: string) => void;
  setVisualAssetRegionCropQuality: (value: string) => void;
  setVisualAssetLlmMaxBytes: (value: string) => void;
  setVisualAssetMinWidth: (value: string) => void;
  setVisualAssetMinHeight: (value: string) => void;
  setVisualAssetMinSharpness: (value: string) => void;
  setVisualAssetMinEntropy: (value: string) => void;
  setVisualAssetMaxPhashDistance: (value: string) => void;
  setArticleExtractorMinChars: (value: string) => void;
  setArticleExtractorMinScore: (value: string) => void;
  setArticleExtractorMaxChars: (value: string) => void;
  setStaticDomTargetMatchThreshold: (value: string) => void;
  setStaticDomMaxEvidenceSnippets: (value: string) => void;
  setStructuredMetadataExtructTimeoutMs: (value: string) => void;
  setStructuredMetadataExtructMaxItemsPerSurface: (value: string) => void;
  setStructuredMetadataExtructCacheLimit: (value: string) => void;
  setDomSnippetMaxChars: (value: string) => void;
  setLlmExtractionCacheTtlMs: (value: string) => void;
  setLlmMaxCallsPerProductTotal: (value: string) => void;
  setLlmMaxCallsPerProductFast: (value: string) => void;
  setMaxManufacturerUrlsPerProduct: (value: string) => void;
  setMaxManufacturerPagesPerDomain: (value: string) => void;
  setManufacturerReserveUrls: (value: string) => void;
  setMaxHypothesisItems: (value: string) => void;
  setHypothesisAutoFollowupRounds: (value: string) => void;
  setHypothesisFollowupUrlsPerRound: (value: string) => void;
  setLearningConfidenceThreshold: (value: string) => void;
  setComponentLexiconDecayDays: (value: string) => void;
  setComponentLexiconExpireDays: (value: string) => void;
  setFieldAnchorsDecayDays: (value: string) => void;
  setUrlMemoryDecayDays: (value: string) => void;
  setUserAgent: (value: string) => void;
  setPdfPreferredBackend: (value: string) => void;
  setCapturePageScreenshotFormat: (value: string) => void;
  setCapturePageScreenshotSelectors: (value: string) => void;
  setRuntimeScreenshotMode: (value: string) => void;
  setVisualAssetReviewFormat: (value: string) => void;
  setVisualAssetHeroSelectorMapJson: (value: string) => void;
  setStaticDomMode: (value: string) => void;
  setSpecDbDir: (value: string) => void;
  setArticleExtractorDomainPolicyMapJson: (value: string) => void;
  setStructuredMetadataExtructUrl: (value: string) => void;
  setLlmExtractionCacheDir: (value: string) => void;
  setCortexBaseUrl: (value: string) => void;
  setCortexApiKey: (value: string) => void;
  setCortexAsyncBaseUrl: (value: string) => void;
  setCortexAsyncSubmitPath: (value: string) => void;
  setCortexAsyncStatusPath: (value: string) => void;
  setCortexModelFast: (value: string) => void;
  setCortexModelAudit: (value: string) => void;
  setCortexModelDom: (value: string) => void;
  setCortexModelReasoningDeep: (value: string) => void;
  setCortexModelVision: (value: string) => void;
  setCortexModelSearchFast: (value: string) => void;
  setCortexModelRerankFast: (value: string) => void;
  setCortexModelSearchDeep: (value: string) => void;
  setCseRescueRequiredIteration: (value: string) => void;
  setDuckduckgoTimeoutMs: (value: string) => void;
  setRuntimeScreencastFps: (value: string) => void;
  setRuntimeScreencastQuality: (value: string) => void;
  setRuntimeScreencastMaxWidth: (value: string) => void;
  setRuntimeScreencastMaxHeight: (value: string) => void;
  setRuntimeTraceFetchRing: (value: string) => void;
  setRuntimeTraceLlmRing: (value: string) => void;
  setDaemonConcurrency: (value: string) => void;
  setDaemonGracefulShutdownTimeoutMs: (value: string) => void;
  setImportsPollSeconds: (value: string) => void;
  setConvergenceIdentityFailFastRounds: (value: string) => void;
  setIndexingResumeSeedLimit: (value: string) => void;
  setIndexingResumePersistLimit: (value: string) => void;
  setHelperSupportiveMaxSources: (value: string) => void;
  setHelperActiveSyncLimit: (value: string) => void;
  setFieldRewardHalfLifeDays: (value: string) => void;
  setDriftPollSeconds: (value: string) => void;
  setDriftScanMaxProducts: (value: string) => void;
  setReCrawlStaleAfterDays: (value: string) => void;
  setAggressiveConfidenceThreshold: (value: string) => void;
  setAggressiveMaxSearchQueries: (value: string) => void;
  setAggressiveEvidenceAuditBatchSize: (value: string) => void;
  setAggressiveMaxTimePerProductMs: (value: string) => void;
  setAggressiveThoroughFromRound: (value: string) => void;
  setAggressiveRound1MaxUrls: (value: string) => void;
  setAggressiveRound1MaxCandidateUrls: (value: string) => void;
  setAggressiveLlmMaxCallsPerRound: (value: string) => void;
  setAggressiveLlmMaxCallsPerProductTotal: (value: string) => void;
  setAggressiveLlmTargetMaxFields: (value: string) => void;
  setAggressiveLlmDiscoveryPasses: (value: string) => void;
  setAggressiveLlmDiscoveryQueryCap: (value: string) => void;
  setUberMaxRounds: (value: string) => void;
  setCortexSyncTimeoutMs: (value: string) => void;
  setCortexAsyncPollIntervalMs: (value: string) => void;
  setCortexAsyncMaxWaitMs: (value: string) => void;
  setCortexEnsureReadyTimeoutMs: (value: string) => void;
  setCortexStartReadyTimeoutMs: (value: string) => void;
  setCortexFailureThreshold: (value: string) => void;
  setCortexCircuitOpenMs: (value: string) => void;
  setCortexEscalateConfidenceLt: (value: string) => void;
  setCortexMaxDeepFieldsPerProduct: (value: string) => void;
  setDiscoveryEnabled: (value: boolean) => void;
  setPhase2LlmEnabled: (value: boolean) => void;
  setPhase3LlmTriageEnabled: (value: boolean) => void;
  setLlmExtractionCacheEnabled: (value: boolean) => void;
  setLlmFallbackEnabled: (value: boolean) => void;
  setReextractIndexed: (value: boolean) => void;
  setFetchCandidateSources: (value: boolean) => void;
  setManufacturerBroadDiscovery: (value: boolean) => void;
  setManufacturerSeedSearchUrls: (value: boolean) => void;
  setManufacturerDeepResearchEnabled: (value: boolean) => void;
  setPdfBackendRouterEnabled: (value: boolean) => void;
  setCapturePageScreenshotEnabled: (value: boolean) => void;
  setRuntimeCaptureScreenshots: (value: boolean) => void;
  setVisualAssetCaptureEnabled: (value: boolean) => void;
  setVisualAssetStoreOriginal: (value: boolean) => void;
  setVisualAssetPhashEnabled: (value: boolean) => void;
  setChartExtractionEnabled: (value: boolean) => void;
  setArticleExtractorV2Enabled: (value: boolean) => void;
  setStaticDomExtractorEnabled: (value: boolean) => void;
  setHtmlTableExtractorV2: (value: boolean) => void;
  setStructuredMetadataExtructEnabled: (value: boolean) => void;
  setStructuredMetadataExtructCacheEnabled: (value: boolean) => void;
  setHelperFilesEnabled: (value: boolean) => void;
  setHelperSupportiveEnabled: (value: boolean) => void;
  setHelperSupportiveFillMissing: (value: boolean) => void;
  setHelperAutoSeedTargets: (value: boolean) => void;
  setDriftDetectionEnabled: (value: boolean) => void;
  setDriftAutoRepublish: (value: boolean) => void;
  setAggressiveModeEnabled: (value: boolean) => void;
  setAggressiveEvidenceAuditEnabled: (value: boolean) => void;
  setUberAggressiveEnabled: (value: boolean) => void;
  setCortexEnabled: (value: boolean) => void;
  setCortexAsyncEnabled: (value: boolean) => void;
  setCortexAutoStart: (value: boolean) => void;
  setCortexAutoRestartOnAuth: (value: boolean) => void;
  setCortexEscalateIfConflict: (value: boolean) => void;
  setCortexEscalateCriticalOnly: (value: boolean) => void;
  setAllowBelowPassTargetFill: (value: boolean) => void;
  setIndexingHelperFilesEnabled: (value: boolean) => void;
  setDisableGoogleCse: (value: boolean) => void;
  setCseRescueOnlyMode: (value: boolean) => void;
  setDuckduckgoEnabled: (value: boolean) => void;
  setScannedPdfOcrEnabled: (value: boolean) => void;
  setScannedPdfOcrPromoteCandidates: (value: boolean) => void;
  setDynamicCrawleeEnabled: (value: boolean) => void;
  setCrawleeHeadless: (value: boolean) => void;
  setLlmExtractSkipLowSignal: (value: boolean) => void;
  setLlmReasoningMode: (value: boolean) => void;
  setLlmDisableBudgetGuards: (value: boolean) => void;
  setLlmVerifyMode: (value: boolean) => void;
  setLocalMode: (value: boolean) => void;
  setDryRun: (value: boolean) => void;
  setMirrorToS3: (value: boolean) => void;
  setMirrorToS3Input: (value: boolean) => void;
  setWriteMarkdownSummary: (value: boolean) => void;
  setLlmEnabled: (value: boolean) => void;
  setLlmWriteSummary: (value: boolean) => void;
  setFetchSchedulerEnabled: (value: boolean) => void;
  setPreferHttpFetcher: (value: boolean) => void;
  setFrontierEnableSqlite: (value: boolean) => void;
  setFrontierStripTrackingParams: (value: boolean) => void;
  setFrontierRepairSearchEnabled: (value: boolean) => void;
  setAutoScrollEnabled: (value: boolean) => void;
  setGraphqlReplayEnabled: (value: boolean) => void;
  setRobotsTxtCompliant: (value: boolean) => void;
  setRuntimeScreencastEnabled: (value: boolean) => void;
  setRuntimeTraceEnabled: (value: boolean) => void;
  setRuntimeTraceLlmPayloads: (value: boolean) => void;
  setEventsJsonWrite: (value: boolean) => void;
  setIndexingSchemaPacketsValidationEnabled: (value: boolean) => void;
  setIndexingSchemaPacketsValidationStrict: (value: boolean) => void;
  setQueueJsonWrite: (value: boolean) => void;
  setBillingJsonWrite: (value: boolean) => void;
  setBrainJsonWrite: (value: boolean) => void;
  setIntelJsonWrite: (value: boolean) => void;
  setCorpusJsonWrite: (value: boolean) => void;
  setLearningJsonWrite: (value: boolean) => void;
  setCacheJsonWrite: (value: boolean) => void;
  setAuthoritySnapshotEnabled: (value: boolean) => void;
  setSelfImproveEnabled: (value: boolean) => void;
  setOutputMode: (value: string) => void;
  setLlmPlanProvider: (value: string) => void;
  setLlmPlanBaseUrl: (value: string) => void;
  setRuntimeControlFile: (value: string) => void;
  setHelperFilesRoot: (value: string) => void;
  setBatchStrategy: (value: string) => void;
}

export interface RuntimeModelTokenDefaults {
  default_output_tokens: number;
  max_output_tokens: number;
}

export type RuntimeModelTokenDefaultsResolver = (
  model: string,
) => RuntimeModelTokenDefaults;

export interface RuntimeSettingsPayloadSerializerInput {
  runProfile?: RuntimeProfile | string;
  profile: RuntimeProfile | string;
  searchProvider: RuntimeSearchProvider | string;
  searxngBaseUrl: string;
  bingSearchEndpoint: string;
  bingSearchKey: string;
  googleCseCx: string;
  googleCseKey: string;
  llmPlanApiKey: string;
  duckduckgoBaseUrl: string;
  llmModelPlan?: string;
  phase2LlmModel: string;
  llmModelTriage?: string;
  phase3LlmModel: string;
  llmModelFast: string;
  llmModelReasoning: string;
  llmModelExtract: string;
  llmModelValidate: string;
  llmModelWrite: string;
  needsetEvidenceDecayDays: number | string;
  needsetEvidenceDecayFloor: number | string;
  needsetRequiredWeightIdentity: number | string;
  needsetRequiredWeightCritical: number | string;
  needsetRequiredWeightRequired: number | string;
  needsetRequiredWeightExpected: number | string;
  needsetRequiredWeightOptional: number | string;
  needsetMissingMultiplier: number | string;
  needsetTierDeficitMultiplier: number | string;
  needsetMinRefsDeficitMultiplier: number | string;
  needsetConflictMultiplier: number | string;
  needsetIdentityLockThreshold: number | string;
  needsetIdentityProvisionalThreshold: number | string;
  needsetDefaultIdentityAuditLimit: number | string;
  consensusMethodWeightNetworkJson: number | string;
  consensusMethodWeightAdapterApi: number | string;
  consensusMethodWeightStructuredMeta: number | string;
  consensusMethodWeightPdf: number | string;
  consensusMethodWeightTableKv: number | string;
  consensusMethodWeightDom: number | string;
  consensusMethodWeightLlmExtractBase?: number | string;
  consensusPolicyBonus: number | string;
  consensusWeightedMajorityThreshold: number | string;
  consensusStrictAcceptanceDomainCount: number | string;
  consensusRelaxedAcceptanceDomainCount: number | string;
  consensusInstrumentedFieldThreshold: number | string;
  consensusConfidenceScoringBase: number | string;
  consensusPassTargetIdentityStrong: number | string;
  consensusPassTargetNormal: number | string;
  retrievalTierWeightTier1: number | string;
  retrievalTierWeightTier2: number | string;
  retrievalTierWeightTier3: number | string;
  retrievalTierWeightTier4: number | string;
  retrievalTierWeightTier5: number | string;
  retrievalDocKindWeightManualPdf: number | string;
  retrievalDocKindWeightSpecPdf: number | string;
  retrievalDocKindWeightSupport: number | string;
  retrievalDocKindWeightLabReview: number | string;
  retrievalDocKindWeightProductPage: number | string;
  retrievalDocKindWeightOther: number | string;
  retrievalMethodWeightTable: number | string;
  retrievalMethodWeightKv: number | string;
  retrievalMethodWeightJsonLd: number | string;
  retrievalMethodWeightLlmExtract: number | string;
  retrievalMethodWeightHelperSupportive: number | string;
  retrievalAnchorScorePerMatch: number | string;
  retrievalIdentityScorePerMatch: number | string;
  retrievalUnitMatchBonus: number | string;
  retrievalDirectFieldMatchBonus: number | string;
  identityGatePublishThreshold: number | string;
  identityGateBaseMatchThreshold: number | string;
  identityGateEasyAmbiguityReduction: number | string;
  identityGateMediumAmbiguityReduction: number | string;
  identityGateHardAmbiguityReduction: number | string;
  identityGateVeryHardAmbiguityIncrease: number | string;
  identityGateExtraHardAmbiguityIncrease: number | string;
  identityGateMissingStrongIdPenalty: number | string;
  identityGateHardMissingStrongIdIncrease: number | string;
  identityGateVeryHardMissingStrongIdIncrease: number | string;
  identityGateExtraHardMissingStrongIdIncrease: number | string;
  identityGateNumericTokenBoost: number | string;
  identityGateNumericRangeThreshold: number | string;
  qualityGateIdentityThreshold: number | string;
  evidenceTextMaxChars: number | string;
  llmExtractMaxTokens: number | string;
  llmExtractMaxSnippetsPerBatch: number | string;
  llmExtractMaxSnippetChars: number | string;
  llmExtractReasoningBudget: number | string;
  llmReasoningBudget: number | string;
  llmMonthlyBudgetUsd: number | string;
  llmPerProductBudgetUsd: number | string;
  llmMaxCallsPerRound: number | string;
  llmMaxOutputTokens: number | string;
  llmVerifySampleRate: number | string;
  llmMaxBatchesPerProduct: number | string;
  llmMaxEvidenceChars: number | string;
  llmMaxTokens: number | string;
  llmTimeoutMs: number | string;
  llmCostInputPer1M: number | string;
  llmCostOutputPer1M: number | string;
  llmCostCachedInputPer1M: number | string;
  llmPlanFallbackModel?: string;
  llmFallbackPlanModel: string;
  llmExtractFallbackModel?: string;
  llmFallbackExtractModel: string;
  llmValidateFallbackModel?: string;
  llmFallbackValidateModel: string;
  llmWriteFallbackModel?: string;
  llmFallbackWriteModel: string;
  outputMode: string;
  localInputRoot: string;
  localOutputRoot: string;
  runtimeEventsKey: string;
  awsRegion: string;
  s3Bucket: string;
  s3InputPrefix: string;
  s3OutputPrefix: string;
  eloSupabaseAnonKey: string;
  eloSupabaseEndpoint: string;
  llmProvider: string;
  llmBaseUrl: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  llmPlanProvider: string;
  llmPlanBaseUrl: string;
  importsRoot: string;
  resumeMode: RuntimeResumeMode | string;
  scannedPdfOcrBackend: RuntimeOcrBackend | string;
  fetchConcurrency: number | string;
  perHostMinDelayMs: number | string;
  llmMaxOutputTokensPlan?: number | string;
  llmTokensPlan: number | string;
  llmMaxOutputTokensTriage?: number | string;
  llmTokensTriage: number | string;
  llmMaxOutputTokensFast?: number | string;
  llmTokensFast: number | string;
  llmMaxOutputTokensReasoning?: number | string;
  llmTokensReasoning: number | string;
  llmMaxOutputTokensExtract?: number | string;
  llmTokensExtract: number | string;
  llmMaxOutputTokensValidate?: number | string;
  llmTokensValidate: number | string;
  llmMaxOutputTokensWrite?: number | string;
  llmTokensWrite: number | string;
  llmMaxOutputTokensPlanFallback?: number | string;
  llmTokensPlanFallback: number | string;
  llmMaxOutputTokensExtractFallback?: number | string;
  llmTokensExtractFallback: number | string;
  llmMaxOutputTokensValidateFallback?: number | string;
  llmTokensValidateFallback: number | string;
  llmMaxOutputTokensWriteFallback?: number | string;
  llmTokensWriteFallback: number | string;
  llmExtractionCacheTtlMs: number | string;
  llmMaxCallsPerProductTotal: number | string;
  llmMaxCallsPerProductFast: number | string;
  resumeWindowHours: number | string;
  reextractAfterHours: number | string;
  scannedPdfOcrMaxPages: number | string;
  scannedPdfOcrMaxPairs: number | string;
  scannedPdfOcrMinCharsPerPage: number | string;
  scannedPdfOcrMinLinesPerPage: number | string;
  scannedPdfOcrMinConfidence: number | string;
  crawleeRequestHandlerTimeoutSecs: number | string;
  dynamicFetchRetryBudget: number | string;
  dynamicFetchRetryBackoffMs: number | string;
  fetchSchedulerMaxRetries: number | string;
  fetchSchedulerFallbackWaitMs: number | string;
  pageGotoTimeoutMs: number | string;
  pageNetworkIdleTimeoutMs: number | string;
  postLoadWaitMs: number | string;
  frontierDbPath: string;
  frontierQueryCooldownSeconds: number | string;
  frontierCooldown404Seconds: number | string;
  frontierCooldown404RepeatSeconds: number | string;
  frontierCooldown410Seconds: number | string;
  frontierCooldownTimeoutSeconds: number | string;
  frontierCooldown403BaseSeconds: number | string;
  frontierCooldown429BaseSeconds: number | string;
  frontierBackoffMaxExponent: number | string;
  frontierPathPenaltyNotfoundThreshold: number | string;
  frontierBlockedDomainThreshold: number | string;
  autoScrollPasses: number | string;
  autoScrollDelayMs: number | string;
  maxGraphqlReplays: number | string;
  maxNetworkResponsesPerPage: number | string;
  robotsTxtTimeoutMs: number | string;
  endpointSignalLimit: number | string;
  endpointSuggestionLimit: number | string;
  endpointNetworkScanLimit: number | string;
  discoveryMaxQueries: number | string;
  discoveryResultsPerQuery: number | string;
  discoveryMaxDiscovered: number | string;
  discoveryQueryConcurrency: number | string;
  maxUrlsPerProduct: number | string;
  maxCandidateUrls: number | string;
  maxPagesPerDomain: number | string;
  uberMaxUrlsPerProduct: number | string;
  uberMaxUrlsPerDomain: number | string;
  maxRunSeconds: number | string;
  maxJsonBytes: number | string;
  maxPdfBytes: number | string;
  pdfBackendRouterTimeoutMs: number | string;
  pdfBackendRouterMaxPages: number | string;
  pdfBackendRouterMaxPairs: number | string;
  pdfBackendRouterMaxTextPreviewChars: number | string;
  capturePageScreenshotQuality: number | string;
  capturePageScreenshotMaxBytes: number | string;
  visualAssetCaptureMaxPerSource: number | string;
  visualAssetRetentionDays: number | string;
  visualAssetReviewLgMaxSide: number | string;
  visualAssetReviewSmMaxSide: number | string;
  visualAssetReviewLgQuality: number | string;
  visualAssetReviewSmQuality: number | string;
  visualAssetRegionCropMaxSide: number | string;
  visualAssetRegionCropQuality: number | string;
  visualAssetLlmMaxBytes: number | string;
  visualAssetMinWidth: number | string;
  visualAssetMinHeight: number | string;
  visualAssetMinSharpness: number | string;
  visualAssetMinEntropy: number | string;
  visualAssetMaxPhashDistance: number | string;
  articleExtractorMinChars: number | string;
  articleExtractorMinScore: number | string;
  articleExtractorMaxChars: number | string;
  staticDomTargetMatchThreshold: number | string;
  staticDomMaxEvidenceSnippets: number | string;
  structuredMetadataExtructTimeoutMs: number | string;
  structuredMetadataExtructMaxItemsPerSurface: number | string;
  structuredMetadataExtructCacheLimit: number | string;
  domSnippetMaxChars: number | string;
  maxManufacturerUrlsPerProduct: number | string;
  maxManufacturerPagesPerDomain: number | string;
  manufacturerReserveUrls: number | string;
  maxHypothesisItems: number | string;
  hypothesisAutoFollowupRounds: number | string;
  hypothesisFollowupUrlsPerRound: number | string;
  learningConfidenceThreshold: number | string;
  componentLexiconDecayDays: number | string;
  componentLexiconExpireDays: number | string;
  fieldAnchorsDecayDays: number | string;
  urlMemoryDecayDays: number | string;
  cseRescueRequiredIteration: number | string;
  duckduckgoTimeoutMs: number | string;
  runtimeScreencastFps: number | string;
  runtimeScreencastQuality: number | string;
  runtimeScreencastMaxWidth: number | string;
  runtimeScreencastMaxHeight: number | string;
  runtimeTraceFetchRing: number | string;
  runtimeTraceLlmRing: number | string;
  daemonConcurrency: number | string;
  daemonGracefulShutdownTimeoutMs: number | string;
  importsPollSeconds: number | string;
  convergenceIdentityFailFastRounds: number | string;
  indexingResumeSeedLimit: number | string;
  indexingResumePersistLimit: number | string;
  helperSupportiveMaxSources: number | string;
  helperActiveSyncLimit: number | string;
  fieldRewardHalfLifeDays: number | string;
  driftPollSeconds: number | string;
  driftScanMaxProducts: number | string;
  reCrawlStaleAfterDays: number | string;
  aggressiveConfidenceThreshold: number | string;
  aggressiveMaxSearchQueries: number | string;
  aggressiveEvidenceAuditBatchSize: number | string;
  aggressiveMaxTimePerProductMs: number | string;
  aggressiveThoroughFromRound: number | string;
  aggressiveRound1MaxUrls: number | string;
  aggressiveRound1MaxCandidateUrls: number | string;
  aggressiveLlmMaxCallsPerRound: number | string;
  aggressiveLlmMaxCallsPerProductTotal: number | string;
  aggressiveLlmTargetMaxFields: number | string;
  aggressiveLlmDiscoveryPasses: number | string;
  aggressiveLlmDiscoveryQueryCap: number | string;
  uberMaxRounds: number | string;
  cortexSyncTimeoutMs: number | string;
  cortexAsyncPollIntervalMs: number | string;
  cortexAsyncMaxWaitMs: number | string;
  cortexEnsureReadyTimeoutMs: number | string;
  cortexStartReadyTimeoutMs: number | string;
  cortexFailureThreshold: number | string;
  cortexCircuitOpenMs: number | string;
  cortexEscalateConfidenceLt: number | string;
  cortexMaxDeepFieldsPerProduct: number | string;
  dynamicFetchPolicyMapJson: string;
  searchProfileCapMapJson: string;
  serpRerankerWeightMapJson: string;
  fetchSchedulerInternalsMapJson?: string;
  retrievalInternalsMapJson?: string;
  evidencePackLimitsMapJson?: string;
  identityGateThresholdBoundsMapJson?: string;
  parsingConfidenceBaseMapJson?: string;
  repairDedupeRule?: RuntimeRepairDedupeRule;
  automationQueueStorageEngine?: RuntimeAutomationQueueStorageEngine;
  userAgent: string;
  pdfPreferredBackend: string;
  capturePageScreenshotFormat: string;
  capturePageScreenshotSelectors: string;
  runtimeScreenshotMode: string;
  visualAssetReviewFormat: string;
  visualAssetHeroSelectorMapJson: string;
  runtimeControlFile: string;
  staticDomMode: string;
  specDbDir: string;
  articleExtractorDomainPolicyMapJson: string;
  structuredMetadataExtructUrl: string;
  llmExtractionCacheDir: string;
  cortexBaseUrl: string;
  cortexApiKey: string;
  cortexAsyncBaseUrl: string;
  cortexAsyncSubmitPath: string;
  cortexAsyncStatusPath: string;
  cortexModelFast: string;
  cortexModelAudit: string;
  cortexModelDom: string;
  cortexModelReasoningDeep: string;
  cortexModelVision: string;
  cortexModelSearchFast: string;
  cortexModelRerankFast: string;
  cortexModelSearchDeep: string;
  helperFilesRoot: string;
  batchStrategy: string;
  discoveryEnabled: boolean;
  llmPlanDiscoveryQueries?: boolean;
  phase2LlmEnabled: boolean;
  llmSerpRerankEnabled?: boolean;
  phase3LlmTriageEnabled: boolean;
  llmExtractionCacheEnabled: boolean;
  llmFallbackEnabled: boolean;
  reextractIndexed: boolean;
  fetchCandidateSources: boolean;
  manufacturerBroadDiscovery: boolean;
  manufacturerSeedSearchUrls: boolean;
  manufacturerDeepResearchEnabled: boolean;
  pdfBackendRouterEnabled: boolean;
  capturePageScreenshotEnabled: boolean;
  runtimeCaptureScreenshots: boolean;
  visualAssetCaptureEnabled: boolean;
  visualAssetStoreOriginal: boolean;
  visualAssetPhashEnabled: boolean;
  chartExtractionEnabled: boolean;
  articleExtractorV2Enabled: boolean;
  staticDomExtractorEnabled: boolean;
  htmlTableExtractorV2: boolean;
  structuredMetadataExtructEnabled: boolean;
  structuredMetadataExtructCacheEnabled: boolean;
  helperFilesEnabled: boolean;
  helperSupportiveEnabled: boolean;
  helperSupportiveFillMissing: boolean;
  helperAutoSeedTargets: boolean;
  driftDetectionEnabled: boolean;
  driftAutoRepublish: boolean;
  aggressiveModeEnabled: boolean;
  aggressiveEvidenceAuditEnabled: boolean;
  uberAggressiveEnabled: boolean;
  cortexEnabled: boolean;
  cortexAsyncEnabled: boolean;
  cortexAutoStart: boolean;
  cortexAutoRestartOnAuth: boolean;
  cortexEscalateIfConflict: boolean;
  cortexEscalateCriticalOnly: boolean;
  allowBelowPassTargetFill: boolean;
  indexingHelperFilesEnabled: boolean;
  disableGoogleCse: boolean;
  cseRescueOnlyMode: boolean;
  duckduckgoEnabled: boolean;
  scannedPdfOcrEnabled: boolean;
  scannedPdfOcrPromoteCandidates: boolean;
  dynamicCrawleeEnabled: boolean;
  crawleeHeadless: boolean;
  llmExtractSkipLowSignal: boolean;
  llmReasoningMode: boolean;
  llmDisableBudgetGuards: boolean;
  llmVerifyMode: boolean;
  localMode: boolean;
  dryRun: boolean;
  mirrorToS3: boolean;
  mirrorToS3Input: boolean;
  writeMarkdownSummary: boolean;
  llmEnabled: boolean;
  llmWriteSummary: boolean;
  fetchSchedulerEnabled: boolean;
  preferHttpFetcher: boolean;
  frontierEnableSqlite: boolean;
  frontierStripTrackingParams: boolean;
  frontierRepairSearchEnabled: boolean;
  autoScrollEnabled: boolean;
  graphqlReplayEnabled: boolean;
  robotsTxtCompliant: boolean;
  runtimeScreencastEnabled: boolean;
  runtimeTraceEnabled: boolean;
  runtimeTraceLlmPayloads: boolean;
  eventsJsonWrite: boolean;
  indexingSchemaPacketsValidationEnabled: boolean;
  indexingSchemaPacketsValidationStrict: boolean;
  queueJsonWrite: boolean;
  billingJsonWrite: boolean;
  brainJsonWrite: boolean;
  intelJsonWrite: boolean;
  corpusJsonWrite: boolean;
  learningJsonWrite: boolean;
  cacheJsonWrite: boolean;
  authoritySnapshotEnabled: boolean;
  selfImproveEnabled: boolean;
  runtimeSettingsFallbackBaseline: RuntimeSettingsNumericBaseline;
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver;
}

function hasSnapshotData(
  source: RuntimeSettings | Record<string, unknown> | undefined,
): source is Record<string, unknown> {
  return Boolean(source) && typeof source === 'object' && !Array.isArray(source);
}

export function parseRuntimeLlmTokenCap(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(
    LLM_MIN_OUTPUT_TOKENS,
    Math.min(LLM_MAX_OUTPUT_TOKENS, parsed),
  );
}

export function parseRuntimeInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRuntimeFloat(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRuntimeString(value: unknown, fallback = ''): string {
  const parsed = String(value ?? '').trim();
  return parsed || fallback;
}

export function clampTokenForModel(
  model: string,
  value: number | string,
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver,
): number {
  const defaults = resolveModelTokenDefaults(model);
  const parsed = Number.parseInt(String(value), 10);
  const safeValue = Math.max(
    LLM_MIN_OUTPUT_TOKENS,
    Number.isFinite(parsed) ? parsed : defaults.default_output_tokens,
  );
  return Math.min(safeValue, defaults.max_output_tokens);
}

export function createRuntimeHydrationBindings(
  setters: RuntimeHydrationBindingSetters,
): RuntimeHydrationBindings {
  return {
    stringBindings: [
      {
        key: 'runProfile',
        apply: (value) => setters.setProfile(value as RuntimeProfile),
      },
      {
        key: 'profile',
        apply: (value) => setters.setProfile(value as RuntimeProfile),
      },
      {
        key: 'searchProvider',
        allowEmpty: true,
        apply: (value) => setters.setSearchProvider(value as RuntimeSearchProvider),
      },
      {
        key: 'searxngBaseUrl',
        allowEmpty: true,
        apply: setters.setSearxngBaseUrl,
      },
      {
        key: 'bingSearchEndpoint',
        allowEmpty: true,
        apply: setters.setBingSearchEndpoint,
      },
      {
        key: 'bingSearchKey',
        allowEmpty: true,
        apply: setters.setBingSearchKey,
      },
      {
        key: 'googleCseCx',
        allowEmpty: true,
        apply: setters.setGoogleCseCx,
      },
      {
        key: 'googleCseKey',
        allowEmpty: true,
        apply: setters.setGoogleCseKey,
      },
      {
        key: 'llmPlanApiKey',
        allowEmpty: true,
        apply: setters.setLlmPlanApiKey,
      },
      {
        key: 'duckduckgoBaseUrl',
        allowEmpty: true,
        apply: setters.setDuckduckgoBaseUrl,
      },
      { key: 'llmModelPlan', apply: setters.setPhase2LlmModel },
      { key: 'phase2LlmModel', apply: setters.setPhase2LlmModel },
      { key: 'llmModelTriage', apply: setters.setPhase3LlmModel },
      { key: 'phase3LlmModel', apply: setters.setPhase3LlmModel },
      { key: 'llmModelFast', apply: setters.setLlmModelFast },
      { key: 'llmModelReasoning', apply: setters.setLlmModelReasoning },
      { key: 'llmModelExtract', apply: setters.setLlmModelExtract },
      { key: 'llmModelValidate', apply: setters.setLlmModelValidate },
      { key: 'llmModelWrite', apply: setters.setLlmModelWrite },
      {
        key: 'llmPlanFallbackModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackPlanModel,
      },
      {
        key: 'llmFallbackPlanModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackPlanModel,
      },
      {
        key: 'llmExtractFallbackModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackExtractModel,
      },
      {
        key: 'llmFallbackExtractModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackExtractModel,
      },
      {
        key: 'llmValidateFallbackModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackValidateModel,
      },
      {
        key: 'llmFallbackValidateModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackValidateModel,
      },
      {
        key: 'llmWriteFallbackModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackWriteModel,
      },
      {
        key: 'llmFallbackWriteModel',
        allowEmpty: true,
        apply: setters.setLlmFallbackWriteModel,
      },
      {
        key: 'outputMode',
        allowEmpty: true,
        apply: setters.setOutputMode,
      },
      {
        key: 'localInputRoot',
        allowEmpty: true,
        apply: setters.setLocalInputRoot,
      },
      {
        key: 'localOutputRoot',
        allowEmpty: true,
        apply: setters.setLocalOutputRoot,
      },
      {
        key: 'runtimeEventsKey',
        allowEmpty: true,
        apply: setters.setRuntimeEventsKey,
      },
      {
        key: 'awsRegion',
        allowEmpty: true,
        apply: setters.setAwsRegion,
      },
      {
        key: 's3Bucket',
        allowEmpty: true,
        apply: setters.setS3Bucket,
      },
      {
        key: 's3InputPrefix',
        allowEmpty: true,
        apply: setters.setS3InputPrefix,
      },
      {
        key: 's3OutputPrefix',
        allowEmpty: true,
        apply: setters.setS3OutputPrefix,
      },
      {
        key: 'eloSupabaseAnonKey',
        allowEmpty: true,
        apply: setters.setEloSupabaseAnonKey,
      },
      {
        key: 'eloSupabaseEndpoint',
        allowEmpty: true,
        apply: setters.setEloSupabaseEndpoint,
      },
      {
        key: 'llmProvider',
        allowEmpty: true,
        apply: setters.setLlmProvider,
      },
      {
        key: 'llmBaseUrl',
        allowEmpty: true,
        apply: setters.setLlmBaseUrl,
      },
      {
        key: 'openaiApiKey',
        allowEmpty: true,
        apply: setters.setOpenaiApiKey,
      },
      {
        key: 'anthropicApiKey',
        allowEmpty: true,
        apply: setters.setAnthropicApiKey,
      },
      {
        key: 'llmPlanProvider',
        allowEmpty: true,
        apply: setters.setLlmPlanProvider,
      },
      {
        key: 'llmPlanBaseUrl',
        allowEmpty: true,
        apply: setters.setLlmPlanBaseUrl,
      },
      {
        key: 'importsRoot',
        allowEmpty: true,
        apply: setters.setImportsRoot,
      },
      {
        key: 'resumeMode',
        apply: (value) => setters.setResumeMode(value as RuntimeResumeMode),
      },
      {
        key: 'scannedPdfOcrBackend',
        apply: (value) => setters.setScannedPdfOcrBackend(value as RuntimeOcrBackend),
      },
      {
        key: 'frontierDbPath',
        allowEmpty: true,
        apply: setters.setFrontierDbPath,
      },
      {
        key: 'dynamicFetchPolicyMapJson',
        allowEmpty: true,
        apply: setters.setDynamicFetchPolicyMapJson,
      },
      {
        key: 'searchProfileCapMapJson',
        allowEmpty: true,
        apply: setters.setSearchProfileCapMapJson,
      },
      {
        key: 'serpRerankerWeightMapJson',
        allowEmpty: true,
        apply: setters.setSerpRerankerWeightMapJson,
      },
      {
        key: 'fetchSchedulerInternalsMapJson',
        allowEmpty: true,
        apply: (value) => setters.setFetchSchedulerInternalsMapJson?.(value),
      },
      {
        key: 'retrievalInternalsMapJson',
        allowEmpty: true,
        apply: (value) => setters.setRetrievalInternalsMapJson?.(value),
      },
      {
        key: 'evidencePackLimitsMapJson',
        allowEmpty: true,
        apply: (value) => setters.setEvidencePackLimitsMapJson?.(value),
      },
      {
        key: 'identityGateThresholdBoundsMapJson',
        allowEmpty: true,
        apply: (value) => setters.setIdentityGateThresholdBoundsMapJson?.(value),
      },
      {
        key: 'parsingConfidenceBaseMapJson',
        allowEmpty: true,
        apply: (value) => setters.setParsingConfidenceBaseMapJson?.(value),
      },
      {
        key: 'repairDedupeRule',
        allowEmpty: true,
        apply: (value) => setters.setRepairDedupeRule?.(value as RuntimeRepairDedupeRule),
      },
      {
        key: 'automationQueueStorageEngine',
        allowEmpty: true,
        apply: (value) => setters.setAutomationQueueStorageEngine?.(value as RuntimeAutomationQueueStorageEngine),
      },
      {
        key: 'userAgent',
        allowEmpty: true,
        apply: setters.setUserAgent,
      },
      {
        key: 'pdfPreferredBackend',
        allowEmpty: true,
        apply: setters.setPdfPreferredBackend,
      },
      {
        key: 'capturePageScreenshotFormat',
        allowEmpty: true,
        apply: setters.setCapturePageScreenshotFormat,
      },
      {
        key: 'capturePageScreenshotSelectors',
        allowEmpty: true,
        apply: setters.setCapturePageScreenshotSelectors,
      },
      {
        key: 'runtimeScreenshotMode',
        allowEmpty: true,
        apply: setters.setRuntimeScreenshotMode,
      },
      {
        key: 'visualAssetReviewFormat',
        allowEmpty: true,
        apply: setters.setVisualAssetReviewFormat,
      },
      {
        key: 'visualAssetHeroSelectorMapJson',
        allowEmpty: true,
        apply: setters.setVisualAssetHeroSelectorMapJson,
      },
      {
        key: 'runtimeControlFile',
        allowEmpty: true,
        apply: setters.setRuntimeControlFile,
      },
      {
        key: 'staticDomMode',
        allowEmpty: true,
        apply: setters.setStaticDomMode,
      },
      {
        key: 'specDbDir',
        allowEmpty: true,
        apply: setters.setSpecDbDir,
      },
      {
        key: 'articleExtractorDomainPolicyMapJson',
        allowEmpty: true,
        apply: setters.setArticleExtractorDomainPolicyMapJson,
      },
      {
        key: 'structuredMetadataExtructUrl',
        allowEmpty: true,
        apply: setters.setStructuredMetadataExtructUrl,
      },
      {
        key: 'llmExtractionCacheDir',
        allowEmpty: true,
        apply: setters.setLlmExtractionCacheDir,
      },
      { key: 'cortexBaseUrl', allowEmpty: true, apply: setters.setCortexBaseUrl },
      { key: 'cortexApiKey', allowEmpty: true, apply: setters.setCortexApiKey },
      { key: 'cortexAsyncBaseUrl', allowEmpty: true, apply: setters.setCortexAsyncBaseUrl },
      { key: 'cortexAsyncSubmitPath', allowEmpty: true, apply: setters.setCortexAsyncSubmitPath },
      { key: 'cortexAsyncStatusPath', allowEmpty: true, apply: setters.setCortexAsyncStatusPath },
      { key: 'cortexModelFast', allowEmpty: true, apply: setters.setCortexModelFast },
      { key: 'cortexModelAudit', allowEmpty: true, apply: setters.setCortexModelAudit },
      { key: 'cortexModelDom', allowEmpty: true, apply: setters.setCortexModelDom },
      { key: 'cortexModelReasoningDeep', allowEmpty: true, apply: setters.setCortexModelReasoningDeep },
      { key: 'cortexModelVision', allowEmpty: true, apply: setters.setCortexModelVision },
      { key: 'cortexModelSearchFast', allowEmpty: true, apply: setters.setCortexModelSearchFast },
      { key: 'cortexModelRerankFast', allowEmpty: true, apply: setters.setCortexModelRerankFast },
      { key: 'cortexModelSearchDeep', allowEmpty: true, apply: setters.setCortexModelSearchDeep },
      {
        key: 'helperFilesRoot',
        allowEmpty: true,
        apply: setters.setHelperFilesRoot,
      },
      {
        key: 'batchStrategy',
        allowEmpty: true,
        apply: setters.setBatchStrategy,
      },
    ],
    numberBindings: [
      { key: 'fetchConcurrency', apply: (value) => setters.setFetchConcurrency(String(value)) },
      { key: 'perHostMinDelayMs', apply: (value) => setters.setPerHostMinDelayMs(String(value)) },
      { key: 'llmMaxOutputTokensPlan', apply: setters.setLlmTokensPlan },
      { key: 'llmTokensPlan', apply: setters.setLlmTokensPlan },
      { key: 'llmMaxOutputTokensTriage', apply: setters.setLlmTokensTriage },
      { key: 'llmTokensTriage', apply: setters.setLlmTokensTriage },
      { key: 'llmMaxOutputTokensFast', apply: setters.setLlmTokensFast },
      { key: 'llmTokensFast', apply: setters.setLlmTokensFast },
      { key: 'llmMaxOutputTokensReasoning', apply: setters.setLlmTokensReasoning },
      { key: 'llmTokensReasoning', apply: setters.setLlmTokensReasoning },
      { key: 'llmMaxOutputTokensExtract', apply: setters.setLlmTokensExtract },
      { key: 'llmTokensExtract', apply: setters.setLlmTokensExtract },
      { key: 'llmMaxOutputTokensValidate', apply: setters.setLlmTokensValidate },
      { key: 'llmTokensValidate', apply: setters.setLlmTokensValidate },
      { key: 'llmMaxOutputTokensWrite', apply: setters.setLlmTokensWrite },
      { key: 'llmTokensWrite', apply: setters.setLlmTokensWrite },
      { key: 'llmMaxOutputTokensPlanFallback', apply: setters.setLlmTokensPlanFallback },
      { key: 'llmTokensPlanFallback', apply: setters.setLlmTokensPlanFallback },
      { key: 'llmMaxOutputTokensExtractFallback', apply: setters.setLlmTokensExtractFallback },
      { key: 'llmTokensExtractFallback', apply: setters.setLlmTokensExtractFallback },
      { key: 'llmMaxOutputTokensValidateFallback', apply: setters.setLlmTokensValidateFallback },
      { key: 'llmTokensValidateFallback', apply: setters.setLlmTokensValidateFallback },
      { key: 'llmMaxOutputTokensWriteFallback', apply: setters.setLlmTokensWriteFallback },
      { key: 'llmTokensWriteFallback', apply: setters.setLlmTokensWriteFallback },
      { key: 'needsetEvidenceDecayDays', apply: (value) => setters.setNeedsetEvidenceDecayDays(String(value)) },
      { key: 'needsetEvidenceDecayFloor', apply: (value) => setters.setNeedsetEvidenceDecayFloor(String(value)) },
      { key: 'needsetRequiredWeightIdentity', apply: (value) => setters.setNeedsetRequiredWeightIdentity(String(value)) },
      { key: 'needsetRequiredWeightCritical', apply: (value) => setters.setNeedsetRequiredWeightCritical(String(value)) },
      { key: 'needsetRequiredWeightRequired', apply: (value) => setters.setNeedsetRequiredWeightRequired(String(value)) },
      { key: 'needsetRequiredWeightExpected', apply: (value) => setters.setNeedsetRequiredWeightExpected(String(value)) },
      { key: 'needsetRequiredWeightOptional', apply: (value) => setters.setNeedsetRequiredWeightOptional(String(value)) },
      { key: 'needsetMissingMultiplier', apply: (value) => setters.setNeedsetMissingMultiplier(String(value)) },
      { key: 'needsetTierDeficitMultiplier', apply: (value) => setters.setNeedsetTierDeficitMultiplier(String(value)) },
      { key: 'needsetMinRefsDeficitMultiplier', apply: (value) => setters.setNeedsetMinRefsDeficitMultiplier(String(value)) },
      { key: 'needsetConflictMultiplier', apply: (value) => setters.setNeedsetConflictMultiplier(String(value)) },
      { key: 'needsetIdentityLockThreshold', apply: (value) => setters.setNeedsetIdentityLockThreshold(String(value)) },
      { key: 'needsetIdentityProvisionalThreshold', apply: (value) => setters.setNeedsetIdentityProvisionalThreshold(String(value)) },
      { key: 'needsetDefaultIdentityAuditLimit', apply: (value) => setters.setNeedsetDefaultIdentityAuditLimit(String(value)) },
      { key: 'consensusMethodWeightNetworkJson', apply: (value) => setters.setConsensusMethodWeightNetworkJson(String(value)) },
      { key: 'consensusMethodWeightAdapterApi', apply: (value) => setters.setConsensusMethodWeightAdapterApi(String(value)) },
      { key: 'consensusMethodWeightStructuredMeta', apply: (value) => setters.setConsensusMethodWeightStructuredMeta(String(value)) },
      { key: 'consensusMethodWeightPdf', apply: (value) => setters.setConsensusMethodWeightPdf(String(value)) },
      { key: 'consensusMethodWeightTableKv', apply: (value) => setters.setConsensusMethodWeightTableKv(String(value)) },
      { key: 'consensusMethodWeightDom', apply: (value) => setters.setConsensusMethodWeightDom(String(value)) },
      { key: 'consensusMethodWeightLlmExtractBase', apply: (value) => setters.setConsensusMethodWeightLlmExtractBase?.(String(value)) },
      { key: 'consensusPolicyBonus', apply: (value) => setters.setConsensusPolicyBonus(String(value)) },
      { key: 'consensusWeightedMajorityThreshold', apply: (value) => setters.setConsensusWeightedMajorityThreshold(String(value)) },
      { key: 'consensusStrictAcceptanceDomainCount', apply: (value) => setters.setConsensusStrictAcceptanceDomainCount(String(value)) },
      { key: 'consensusRelaxedAcceptanceDomainCount', apply: (value) => setters.setConsensusRelaxedAcceptanceDomainCount(String(value)) },
      { key: 'consensusInstrumentedFieldThreshold', apply: (value) => setters.setConsensusInstrumentedFieldThreshold(String(value)) },
      { key: 'consensusConfidenceScoringBase', apply: (value) => setters.setConsensusConfidenceScoringBase(String(value)) },
      { key: 'consensusPassTargetIdentityStrong', apply: (value) => setters.setConsensusPassTargetIdentityStrong(String(value)) },
      { key: 'consensusPassTargetNormal', apply: (value) => setters.setConsensusPassTargetNormal(String(value)) },
      { key: 'retrievalTierWeightTier1', apply: (value) => setters.setRetrievalTierWeightTier1(String(value)) },
      { key: 'retrievalTierWeightTier2', apply: (value) => setters.setRetrievalTierWeightTier2(String(value)) },
      { key: 'retrievalTierWeightTier3', apply: (value) => setters.setRetrievalTierWeightTier3(String(value)) },
      { key: 'retrievalTierWeightTier4', apply: (value) => setters.setRetrievalTierWeightTier4(String(value)) },
      { key: 'retrievalTierWeightTier5', apply: (value) => setters.setRetrievalTierWeightTier5(String(value)) },
      { key: 'retrievalDocKindWeightManualPdf', apply: (value) => setters.setRetrievalDocKindWeightManualPdf(String(value)) },
      { key: 'retrievalDocKindWeightSpecPdf', apply: (value) => setters.setRetrievalDocKindWeightSpecPdf(String(value)) },
      { key: 'retrievalDocKindWeightSupport', apply: (value) => setters.setRetrievalDocKindWeightSupport(String(value)) },
      { key: 'retrievalDocKindWeightLabReview', apply: (value) => setters.setRetrievalDocKindWeightLabReview(String(value)) },
      { key: 'retrievalDocKindWeightProductPage', apply: (value) => setters.setRetrievalDocKindWeightProductPage(String(value)) },
      { key: 'retrievalDocKindWeightOther', apply: (value) => setters.setRetrievalDocKindWeightOther(String(value)) },
      { key: 'retrievalMethodWeightTable', apply: (value) => setters.setRetrievalMethodWeightTable(String(value)) },
      { key: 'retrievalMethodWeightKv', apply: (value) => setters.setRetrievalMethodWeightKv(String(value)) },
      { key: 'retrievalMethodWeightJsonLd', apply: (value) => setters.setRetrievalMethodWeightJsonLd(String(value)) },
      { key: 'retrievalMethodWeightLlmExtract', apply: (value) => setters.setRetrievalMethodWeightLlmExtract(String(value)) },
      { key: 'retrievalMethodWeightHelperSupportive', apply: (value) => setters.setRetrievalMethodWeightHelperSupportive(String(value)) },
      { key: 'retrievalAnchorScorePerMatch', apply: (value) => setters.setRetrievalAnchorScorePerMatch(String(value)) },
      { key: 'retrievalIdentityScorePerMatch', apply: (value) => setters.setRetrievalIdentityScorePerMatch(String(value)) },
      { key: 'retrievalUnitMatchBonus', apply: (value) => setters.setRetrievalUnitMatchBonus(String(value)) },
      { key: 'retrievalDirectFieldMatchBonus', apply: (value) => setters.setRetrievalDirectFieldMatchBonus(String(value)) },
      { key: 'identityGatePublishThreshold', apply: (value) => setters.setIdentityGatePublishThreshold(String(value)) },
      { key: 'identityGateBaseMatchThreshold', apply: (value) => setters.setIdentityGateBaseMatchThreshold(String(value)) },
      { key: 'identityGateEasyAmbiguityReduction', apply: (value) => setters.setIdentityGateEasyAmbiguityReduction(String(value)) },
      { key: 'identityGateMediumAmbiguityReduction', apply: (value) => setters.setIdentityGateMediumAmbiguityReduction(String(value)) },
      { key: 'identityGateHardAmbiguityReduction', apply: (value) => setters.setIdentityGateHardAmbiguityReduction(String(value)) },
      { key: 'identityGateVeryHardAmbiguityIncrease', apply: (value) => setters.setIdentityGateVeryHardAmbiguityIncrease(String(value)) },
      { key: 'identityGateExtraHardAmbiguityIncrease', apply: (value) => setters.setIdentityGateExtraHardAmbiguityIncrease(String(value)) },
      { key: 'identityGateMissingStrongIdPenalty', apply: (value) => setters.setIdentityGateMissingStrongIdPenalty(String(value)) },
      { key: 'identityGateHardMissingStrongIdIncrease', apply: (value) => setters.setIdentityGateHardMissingStrongIdIncrease(String(value)) },
      { key: 'identityGateVeryHardMissingStrongIdIncrease', apply: (value) => setters.setIdentityGateVeryHardMissingStrongIdIncrease(String(value)) },
      { key: 'identityGateExtraHardMissingStrongIdIncrease', apply: (value) => setters.setIdentityGateExtraHardMissingStrongIdIncrease(String(value)) },
      { key: 'identityGateNumericTokenBoost', apply: (value) => setters.setIdentityGateNumericTokenBoost(String(value)) },
      { key: 'identityGateNumericRangeThreshold', apply: (value) => setters.setIdentityGateNumericRangeThreshold(String(value)) },
      { key: 'qualityGateIdentityThreshold', apply: (value) => setters.setQualityGateIdentityThreshold(String(value)) },
      { key: 'evidenceTextMaxChars', apply: (value) => setters.setEvidenceTextMaxChars(String(value)) },
      { key: 'llmExtractMaxTokens', apply: (value) => setters.setLlmExtractMaxTokens(String(value)) },
      { key: 'llmExtractMaxSnippetsPerBatch', apply: (value) => setters.setLlmExtractMaxSnippetsPerBatch(String(value)) },
      { key: 'llmExtractMaxSnippetChars', apply: (value) => setters.setLlmExtractMaxSnippetChars(String(value)) },
      { key: 'llmExtractReasoningBudget', apply: (value) => setters.setLlmExtractReasoningBudget(String(value)) },
      { key: 'llmReasoningBudget', apply: (value) => setters.setLlmReasoningBudget(String(value)) },
      { key: 'llmMonthlyBudgetUsd', apply: (value) => setters.setLlmMonthlyBudgetUsd(String(value)) },
      { key: 'llmPerProductBudgetUsd', apply: (value) => setters.setLlmPerProductBudgetUsd(String(value)) },
      { key: 'llmMaxCallsPerRound', apply: (value) => setters.setLlmMaxCallsPerRound(String(value)) },
      { key: 'llmMaxOutputTokens', apply: (value) => setters.setLlmMaxOutputTokens(String(value)) },
      { key: 'llmVerifySampleRate', apply: (value) => setters.setLlmVerifySampleRate(String(value)) },
      { key: 'llmMaxBatchesPerProduct', apply: (value) => setters.setLlmMaxBatchesPerProduct(String(value)) },
      { key: 'llmMaxEvidenceChars', apply: (value) => setters.setLlmMaxEvidenceChars(String(value)) },
      { key: 'llmMaxTokens', apply: (value) => setters.setLlmMaxTokens(String(value)) },
      { key: 'llmTimeoutMs', apply: (value) => setters.setLlmTimeoutMs(String(value)) },
      { key: 'llmCostInputPer1M', apply: (value) => setters.setLlmCostInputPer1M(String(value)) },
      { key: 'llmCostOutputPer1M', apply: (value) => setters.setLlmCostOutputPer1M(String(value)) },
      { key: 'llmCostCachedInputPer1M', apply: (value) => setters.setLlmCostCachedInputPer1M(String(value)) },
      { key: 'llmExtractionCacheTtlMs', apply: (value) => setters.setLlmExtractionCacheTtlMs(String(value)) },
      { key: 'llmMaxCallsPerProductTotal', apply: (value) => setters.setLlmMaxCallsPerProductTotal(String(value)) },
      { key: 'llmMaxCallsPerProductFast', apply: (value) => setters.setLlmMaxCallsPerProductFast(String(value)) },
      { key: 'resumeWindowHours', apply: (value) => setters.setResumeWindowHours(String(value)) },
      { key: 'reextractAfterHours', apply: (value) => setters.setReextractAfterHours(String(value)) },
      { key: 'scannedPdfOcrMaxPages', apply: (value) => setters.setScannedPdfOcrMaxPages(String(value)) },
      { key: 'scannedPdfOcrMaxPairs', apply: (value) => setters.setScannedPdfOcrMaxPairs(String(value)) },
      { key: 'scannedPdfOcrMinCharsPerPage', apply: (value) => setters.setScannedPdfOcrMinCharsPerPage(String(value)) },
      { key: 'scannedPdfOcrMinLinesPerPage', apply: (value) => setters.setScannedPdfOcrMinLinesPerPage(String(value)) },
      { key: 'scannedPdfOcrMinConfidence', apply: (value) => setters.setScannedPdfOcrMinConfidence(String(value)) },
      { key: 'crawleeRequestHandlerTimeoutSecs', apply: (value) => setters.setCrawleeRequestHandlerTimeoutSecs(String(value)) },
      { key: 'dynamicFetchRetryBudget', apply: (value) => setters.setDynamicFetchRetryBudget(String(value)) },
      { key: 'dynamicFetchRetryBackoffMs', apply: (value) => setters.setDynamicFetchRetryBackoffMs(String(value)) },
      { key: 'fetchSchedulerMaxRetries', apply: (value) => setters.setFetchSchedulerMaxRetries(String(value)) },
      { key: 'fetchSchedulerFallbackWaitMs', apply: (value) => setters.setFetchSchedulerFallbackWaitMs(String(value)) },
      { key: 'pageGotoTimeoutMs', apply: (value) => setters.setPageGotoTimeoutMs(String(value)) },
      { key: 'pageNetworkIdleTimeoutMs', apply: (value) => setters.setPageNetworkIdleTimeoutMs(String(value)) },
      { key: 'postLoadWaitMs', apply: (value) => setters.setPostLoadWaitMs(String(value)) },
      { key: 'frontierQueryCooldownSeconds', apply: (value) => setters.setFrontierQueryCooldownSeconds(String(value)) },
      { key: 'frontierCooldown404Seconds', apply: (value) => setters.setFrontierCooldown404Seconds(String(value)) },
      { key: 'frontierCooldown404RepeatSeconds', apply: (value) => setters.setFrontierCooldown404RepeatSeconds(String(value)) },
      { key: 'frontierCooldown410Seconds', apply: (value) => setters.setFrontierCooldown410Seconds(String(value)) },
      { key: 'frontierCooldownTimeoutSeconds', apply: (value) => setters.setFrontierCooldownTimeoutSeconds(String(value)) },
      { key: 'frontierCooldown403BaseSeconds', apply: (value) => setters.setFrontierCooldown403BaseSeconds(String(value)) },
      { key: 'frontierCooldown429BaseSeconds', apply: (value) => setters.setFrontierCooldown429BaseSeconds(String(value)) },
      { key: 'frontierBackoffMaxExponent', apply: (value) => setters.setFrontierBackoffMaxExponent(String(value)) },
      { key: 'frontierPathPenaltyNotfoundThreshold', apply: (value) => setters.setFrontierPathPenaltyNotfoundThreshold(String(value)) },
      { key: 'frontierBlockedDomainThreshold', apply: (value) => setters.setFrontierBlockedDomainThreshold(String(value)) },
      { key: 'autoScrollPasses', apply: (value) => setters.setAutoScrollPasses(String(value)) },
      { key: 'autoScrollDelayMs', apply: (value) => setters.setAutoScrollDelayMs(String(value)) },
      { key: 'maxGraphqlReplays', apply: (value) => setters.setMaxGraphqlReplays(String(value)) },
      { key: 'maxNetworkResponsesPerPage', apply: (value) => setters.setMaxNetworkResponsesPerPage(String(value)) },
      { key: 'robotsTxtTimeoutMs', apply: (value) => setters.setRobotsTxtTimeoutMs(String(value)) },
      { key: 'endpointSignalLimit', apply: (value) => setters.setEndpointSignalLimit(String(value)) },
      { key: 'endpointSuggestionLimit', apply: (value) => setters.setEndpointSuggestionLimit(String(value)) },
      { key: 'endpointNetworkScanLimit', apply: (value) => setters.setEndpointNetworkScanLimit(String(value)) },
      { key: 'discoveryMaxQueries', apply: (value) => setters.setDiscoveryMaxQueries(String(value)) },
      { key: 'discoveryResultsPerQuery', apply: (value) => setters.setDiscoveryResultsPerQuery(String(value)) },
      { key: 'discoveryMaxDiscovered', apply: (value) => setters.setDiscoveryMaxDiscovered(String(value)) },
      { key: 'discoveryQueryConcurrency', apply: (value) => setters.setDiscoveryQueryConcurrency(String(value)) },
      { key: 'maxUrlsPerProduct', apply: (value) => setters.setMaxUrlsPerProduct(String(value)) },
      { key: 'maxCandidateUrls', apply: (value) => setters.setMaxCandidateUrls(String(value)) },
      { key: 'maxPagesPerDomain', apply: (value) => setters.setMaxPagesPerDomain(String(value)) },
      { key: 'uberMaxUrlsPerProduct', apply: (value) => setters.setUberMaxUrlsPerProduct(String(value)) },
      { key: 'uberMaxUrlsPerDomain', apply: (value) => setters.setUberMaxUrlsPerDomain(String(value)) },
      { key: 'maxRunSeconds', apply: (value) => setters.setMaxRunSeconds(String(value)) },
      { key: 'maxJsonBytes', apply: (value) => setters.setMaxJsonBytes(String(value)) },
      { key: 'maxPdfBytes', apply: (value) => setters.setMaxPdfBytes(String(value)) },
      { key: 'pdfBackendRouterTimeoutMs', apply: (value) => setters.setPdfBackendRouterTimeoutMs(String(value)) },
      { key: 'pdfBackendRouterMaxPages', apply: (value) => setters.setPdfBackendRouterMaxPages(String(value)) },
      { key: 'pdfBackendRouterMaxPairs', apply: (value) => setters.setPdfBackendRouterMaxPairs(String(value)) },
      { key: 'pdfBackendRouterMaxTextPreviewChars', apply: (value) => setters.setPdfBackendRouterMaxTextPreviewChars(String(value)) },
      { key: 'capturePageScreenshotQuality', apply: (value) => setters.setCapturePageScreenshotQuality(String(value)) },
      { key: 'capturePageScreenshotMaxBytes', apply: (value) => setters.setCapturePageScreenshotMaxBytes(String(value)) },
      { key: 'visualAssetCaptureMaxPerSource', apply: (value) => setters.setVisualAssetCaptureMaxPerSource(String(value)) },
      { key: 'visualAssetRetentionDays', apply: (value) => setters.setVisualAssetRetentionDays(String(value)) },
      { key: 'visualAssetReviewLgMaxSide', apply: (value) => setters.setVisualAssetReviewLgMaxSide(String(value)) },
      { key: 'visualAssetReviewSmMaxSide', apply: (value) => setters.setVisualAssetReviewSmMaxSide(String(value)) },
      { key: 'visualAssetReviewLgQuality', apply: (value) => setters.setVisualAssetReviewLgQuality(String(value)) },
      { key: 'visualAssetReviewSmQuality', apply: (value) => setters.setVisualAssetReviewSmQuality(String(value)) },
      { key: 'visualAssetRegionCropMaxSide', apply: (value) => setters.setVisualAssetRegionCropMaxSide(String(value)) },
      { key: 'visualAssetRegionCropQuality', apply: (value) => setters.setVisualAssetRegionCropQuality(String(value)) },
      { key: 'visualAssetLlmMaxBytes', apply: (value) => setters.setVisualAssetLlmMaxBytes(String(value)) },
      { key: 'visualAssetMinWidth', apply: (value) => setters.setVisualAssetMinWidth(String(value)) },
      { key: 'visualAssetMinHeight', apply: (value) => setters.setVisualAssetMinHeight(String(value)) },
      { key: 'visualAssetMinSharpness', apply: (value) => setters.setVisualAssetMinSharpness(String(value)) },
      { key: 'visualAssetMinEntropy', apply: (value) => setters.setVisualAssetMinEntropy(String(value)) },
      { key: 'visualAssetMaxPhashDistance', apply: (value) => setters.setVisualAssetMaxPhashDistance(String(value)) },
      { key: 'articleExtractorMinChars', apply: (value) => setters.setArticleExtractorMinChars(String(value)) },
      { key: 'articleExtractorMinScore', apply: (value) => setters.setArticleExtractorMinScore(String(value)) },
      { key: 'articleExtractorMaxChars', apply: (value) => setters.setArticleExtractorMaxChars(String(value)) },
      { key: 'staticDomTargetMatchThreshold', apply: (value) => setters.setStaticDomTargetMatchThreshold(String(value)) },
      { key: 'staticDomMaxEvidenceSnippets', apply: (value) => setters.setStaticDomMaxEvidenceSnippets(String(value)) },
      { key: 'structuredMetadataExtructTimeoutMs', apply: (value) => setters.setStructuredMetadataExtructTimeoutMs(String(value)) },
      { key: 'structuredMetadataExtructMaxItemsPerSurface', apply: (value) => setters.setStructuredMetadataExtructMaxItemsPerSurface(String(value)) },
      { key: 'structuredMetadataExtructCacheLimit', apply: (value) => setters.setStructuredMetadataExtructCacheLimit(String(value)) },
      { key: 'domSnippetMaxChars', apply: (value) => setters.setDomSnippetMaxChars(String(value)) },
      { key: 'maxManufacturerUrlsPerProduct', apply: (value) => setters.setMaxManufacturerUrlsPerProduct(String(value)) },
      { key: 'maxManufacturerPagesPerDomain', apply: (value) => setters.setMaxManufacturerPagesPerDomain(String(value)) },
      { key: 'manufacturerReserveUrls', apply: (value) => setters.setManufacturerReserveUrls(String(value)) },
      { key: 'maxHypothesisItems', apply: (value) => setters.setMaxHypothesisItems(String(value)) },
      { key: 'hypothesisAutoFollowupRounds', apply: (value) => setters.setHypothesisAutoFollowupRounds(String(value)) },
      { key: 'hypothesisFollowupUrlsPerRound', apply: (value) => setters.setHypothesisFollowupUrlsPerRound(String(value)) },
      { key: 'learningConfidenceThreshold', apply: (value) => setters.setLearningConfidenceThreshold(String(value)) },
      { key: 'componentLexiconDecayDays', apply: (value) => setters.setComponentLexiconDecayDays(String(value)) },
      { key: 'componentLexiconExpireDays', apply: (value) => setters.setComponentLexiconExpireDays(String(value)) },
      { key: 'fieldAnchorsDecayDays', apply: (value) => setters.setFieldAnchorsDecayDays(String(value)) },
      { key: 'urlMemoryDecayDays', apply: (value) => setters.setUrlMemoryDecayDays(String(value)) },
      { key: 'cseRescueRequiredIteration', apply: (value) => setters.setCseRescueRequiredIteration(String(value)) },
      { key: 'duckduckgoTimeoutMs', apply: (value) => setters.setDuckduckgoTimeoutMs(String(value)) },
      { key: 'runtimeScreencastFps', apply: (value) => setters.setRuntimeScreencastFps(String(value)) },
      { key: 'runtimeScreencastQuality', apply: (value) => setters.setRuntimeScreencastQuality(String(value)) },
      { key: 'runtimeScreencastMaxWidth', apply: (value) => setters.setRuntimeScreencastMaxWidth(String(value)) },
      { key: 'runtimeScreencastMaxHeight', apply: (value) => setters.setRuntimeScreencastMaxHeight(String(value)) },
      { key: 'runtimeTraceFetchRing', apply: (value) => setters.setRuntimeTraceFetchRing(String(value)) },
      { key: 'runtimeTraceLlmRing', apply: (value) => setters.setRuntimeTraceLlmRing(String(value)) },
      { key: 'daemonConcurrency', apply: (value) => setters.setDaemonConcurrency(String(value)) },
      { key: 'daemonGracefulShutdownTimeoutMs', apply: (value) => setters.setDaemonGracefulShutdownTimeoutMs(String(value)) },
      { key: 'importsPollSeconds', apply: (value) => setters.setImportsPollSeconds(String(value)) },
      { key: 'convergenceIdentityFailFastRounds', apply: (value) => setters.setConvergenceIdentityFailFastRounds(String(value)) },
      { key: 'indexingResumeSeedLimit', apply: (value) => setters.setIndexingResumeSeedLimit(String(value)) },
      { key: 'indexingResumePersistLimit', apply: (value) => setters.setIndexingResumePersistLimit(String(value)) },
      { key: 'helperSupportiveMaxSources', apply: (value) => setters.setHelperSupportiveMaxSources(String(value)) },
      { key: 'helperActiveSyncLimit', apply: (value) => setters.setHelperActiveSyncLimit(String(value)) },
      { key: 'fieldRewardHalfLifeDays', apply: (value) => setters.setFieldRewardHalfLifeDays(String(value)) },
      { key: 'driftPollSeconds', apply: (value) => setters.setDriftPollSeconds(String(value)) },
      { key: 'driftScanMaxProducts', apply: (value) => setters.setDriftScanMaxProducts(String(value)) },
      { key: 'reCrawlStaleAfterDays', apply: (value) => setters.setReCrawlStaleAfterDays(String(value)) },
      { key: 'aggressiveConfidenceThreshold', apply: (value) => setters.setAggressiveConfidenceThreshold(String(value)) },
      { key: 'aggressiveMaxSearchQueries', apply: (value) => setters.setAggressiveMaxSearchQueries(String(value)) },
      { key: 'aggressiveEvidenceAuditBatchSize', apply: (value) => setters.setAggressiveEvidenceAuditBatchSize(String(value)) },
      { key: 'aggressiveMaxTimePerProductMs', apply: (value) => setters.setAggressiveMaxTimePerProductMs(String(value)) },
      { key: 'aggressiveThoroughFromRound', apply: (value) => setters.setAggressiveThoroughFromRound(String(value)) },
      { key: 'aggressiveRound1MaxUrls', apply: (value) => setters.setAggressiveRound1MaxUrls(String(value)) },
      { key: 'aggressiveRound1MaxCandidateUrls', apply: (value) => setters.setAggressiveRound1MaxCandidateUrls(String(value)) },
      { key: 'aggressiveLlmMaxCallsPerRound', apply: (value) => setters.setAggressiveLlmMaxCallsPerRound(String(value)) },
      { key: 'aggressiveLlmMaxCallsPerProductTotal', apply: (value) => setters.setAggressiveLlmMaxCallsPerProductTotal(String(value)) },
      { key: 'aggressiveLlmTargetMaxFields', apply: (value) => setters.setAggressiveLlmTargetMaxFields(String(value)) },
      { key: 'aggressiveLlmDiscoveryPasses', apply: (value) => setters.setAggressiveLlmDiscoveryPasses(String(value)) },
      { key: 'aggressiveLlmDiscoveryQueryCap', apply: (value) => setters.setAggressiveLlmDiscoveryQueryCap(String(value)) },
      { key: 'uberMaxRounds', apply: (value) => setters.setUberMaxRounds(String(value)) },
      { key: 'cortexSyncTimeoutMs', apply: (value) => setters.setCortexSyncTimeoutMs(String(value)) },
      { key: 'cortexAsyncPollIntervalMs', apply: (value) => setters.setCortexAsyncPollIntervalMs(String(value)) },
      { key: 'cortexAsyncMaxWaitMs', apply: (value) => setters.setCortexAsyncMaxWaitMs(String(value)) },
      { key: 'cortexEnsureReadyTimeoutMs', apply: (value) => setters.setCortexEnsureReadyTimeoutMs(String(value)) },
      { key: 'cortexStartReadyTimeoutMs', apply: (value) => setters.setCortexStartReadyTimeoutMs(String(value)) },
      { key: 'cortexFailureThreshold', apply: (value) => setters.setCortexFailureThreshold(String(value)) },
      { key: 'cortexCircuitOpenMs', apply: (value) => setters.setCortexCircuitOpenMs(String(value)) },
      { key: 'cortexEscalateConfidenceLt', apply: (value) => setters.setCortexEscalateConfidenceLt(String(value)) },
      { key: 'cortexMaxDeepFieldsPerProduct', apply: (value) => setters.setCortexMaxDeepFieldsPerProduct(String(value)) },
    ],
    booleanBindings: [
      { key: 'discoveryEnabled', apply: setters.setDiscoveryEnabled },
      { key: 'llmPlanDiscoveryQueries', apply: setters.setPhase2LlmEnabled },
      { key: 'phase2LlmEnabled', apply: setters.setPhase2LlmEnabled },
      { key: 'llmSerpRerankEnabled', apply: setters.setPhase3LlmTriageEnabled },
      { key: 'phase3LlmTriageEnabled', apply: setters.setPhase3LlmTriageEnabled },
      { key: 'llmExtractionCacheEnabled', apply: setters.setLlmExtractionCacheEnabled },
      { key: 'llmFallbackEnabled', apply: setters.setLlmFallbackEnabled },
      { key: 'reextractIndexed', apply: setters.setReextractIndexed },
      { key: 'fetchCandidateSources', apply: setters.setFetchCandidateSources },
      { key: 'manufacturerBroadDiscovery', apply: setters.setManufacturerBroadDiscovery },
      { key: 'manufacturerSeedSearchUrls', apply: setters.setManufacturerSeedSearchUrls },
      { key: 'manufacturerDeepResearchEnabled', apply: setters.setManufacturerDeepResearchEnabled },
      { key: 'pdfBackendRouterEnabled', apply: setters.setPdfBackendRouterEnabled },
      { key: 'capturePageScreenshotEnabled', apply: setters.setCapturePageScreenshotEnabled },
      { key: 'runtimeCaptureScreenshots', apply: setters.setRuntimeCaptureScreenshots },
      { key: 'visualAssetCaptureEnabled', apply: setters.setVisualAssetCaptureEnabled },
      { key: 'visualAssetStoreOriginal', apply: setters.setVisualAssetStoreOriginal },
      { key: 'visualAssetPhashEnabled', apply: setters.setVisualAssetPhashEnabled },
      { key: 'chartExtractionEnabled', apply: setters.setChartExtractionEnabled },
      { key: 'articleExtractorV2Enabled', apply: setters.setArticleExtractorV2Enabled },
      { key: 'staticDomExtractorEnabled', apply: setters.setStaticDomExtractorEnabled },
      { key: 'htmlTableExtractorV2', apply: setters.setHtmlTableExtractorV2 },
      { key: 'structuredMetadataExtructEnabled', apply: setters.setStructuredMetadataExtructEnabled },
      { key: 'structuredMetadataExtructCacheEnabled', apply: setters.setStructuredMetadataExtructCacheEnabled },
      { key: 'helperFilesEnabled', apply: setters.setHelperFilesEnabled },
      { key: 'helperSupportiveEnabled', apply: setters.setHelperSupportiveEnabled },
      { key: 'helperSupportiveFillMissing', apply: setters.setHelperSupportiveFillMissing },
      { key: 'helperAutoSeedTargets', apply: setters.setHelperAutoSeedTargets },
      { key: 'driftDetectionEnabled', apply: setters.setDriftDetectionEnabled },
      { key: 'driftAutoRepublish', apply: setters.setDriftAutoRepublish },
      { key: 'aggressiveModeEnabled', apply: setters.setAggressiveModeEnabled },
      { key: 'aggressiveEvidenceAuditEnabled', apply: setters.setAggressiveEvidenceAuditEnabled },
      { key: 'uberAggressiveEnabled', apply: setters.setUberAggressiveEnabled },
      { key: 'cortexEnabled', apply: setters.setCortexEnabled },
      { key: 'cortexAsyncEnabled', apply: setters.setCortexAsyncEnabled },
      { key: 'cortexAutoStart', apply: setters.setCortexAutoStart },
      { key: 'cortexAutoRestartOnAuth', apply: setters.setCortexAutoRestartOnAuth },
      { key: 'cortexEscalateIfConflict', apply: setters.setCortexEscalateIfConflict },
      { key: 'cortexEscalateCriticalOnly', apply: setters.setCortexEscalateCriticalOnly },
      { key: 'allowBelowPassTargetFill', apply: setters.setAllowBelowPassTargetFill },
      { key: 'indexingHelperFilesEnabled', apply: setters.setIndexingHelperFilesEnabled },
      { key: 'disableGoogleCse', apply: setters.setDisableGoogleCse },
      { key: 'cseRescueOnlyMode', apply: setters.setCseRescueOnlyMode },
      { key: 'duckduckgoEnabled', apply: setters.setDuckduckgoEnabled },
      { key: 'scannedPdfOcrEnabled', apply: setters.setScannedPdfOcrEnabled },
      { key: 'scannedPdfOcrPromoteCandidates', apply: setters.setScannedPdfOcrPromoteCandidates },
      { key: 'dynamicCrawleeEnabled', apply: setters.setDynamicCrawleeEnabled },
      { key: 'crawleeHeadless', apply: setters.setCrawleeHeadless },
      { key: 'llmExtractSkipLowSignal', apply: setters.setLlmExtractSkipLowSignal },
      { key: 'llmReasoningMode', apply: setters.setLlmReasoningMode },
      { key: 'llmDisableBudgetGuards', apply: setters.setLlmDisableBudgetGuards },
      { key: 'llmVerifyMode', apply: setters.setLlmVerifyMode },
      { key: 'localMode', apply: setters.setLocalMode },
      { key: 'dryRun', apply: setters.setDryRun },
      { key: 'mirrorToS3', apply: setters.setMirrorToS3 },
      { key: 'mirrorToS3Input', apply: setters.setMirrorToS3Input },
      { key: 'writeMarkdownSummary', apply: setters.setWriteMarkdownSummary },
      { key: 'llmEnabled', apply: setters.setLlmEnabled },
      { key: 'llmWriteSummary', apply: setters.setLlmWriteSummary },
      { key: 'fetchSchedulerEnabled', apply: setters.setFetchSchedulerEnabled },
      { key: 'preferHttpFetcher', apply: setters.setPreferHttpFetcher },
      { key: 'frontierEnableSqlite', apply: setters.setFrontierEnableSqlite },
      { key: 'frontierStripTrackingParams', apply: setters.setFrontierStripTrackingParams },
      { key: 'frontierRepairSearchEnabled', apply: setters.setFrontierRepairSearchEnabled },
      { key: 'autoScrollEnabled', apply: setters.setAutoScrollEnabled },
      { key: 'graphqlReplayEnabled', apply: setters.setGraphqlReplayEnabled },
      { key: 'robotsTxtCompliant', apply: setters.setRobotsTxtCompliant },
      { key: 'runtimeScreencastEnabled', apply: setters.setRuntimeScreencastEnabled },
      { key: 'runtimeTraceEnabled', apply: setters.setRuntimeTraceEnabled },
      { key: 'runtimeTraceLlmPayloads', apply: setters.setRuntimeTraceLlmPayloads },
      { key: 'eventsJsonWrite', apply: setters.setEventsJsonWrite },
      { key: 'indexingSchemaPacketsValidationEnabled', apply: setters.setIndexingSchemaPacketsValidationEnabled },
      { key: 'indexingSchemaPacketsValidationStrict', apply: setters.setIndexingSchemaPacketsValidationStrict },
      { key: 'queueJsonWrite', apply: setters.setQueueJsonWrite },
      { key: 'billingJsonWrite', apply: setters.setBillingJsonWrite },
      { key: 'brainJsonWrite', apply: setters.setBrainJsonWrite },
      { key: 'intelJsonWrite', apply: setters.setIntelJsonWrite },
      { key: 'corpusJsonWrite', apply: setters.setCorpusJsonWrite },
      { key: 'learningJsonWrite', apply: setters.setLearningJsonWrite },
      { key: 'cacheJsonWrite', apply: setters.setCacheJsonWrite },
      { key: 'authoritySnapshotEnabled', apply: setters.setAuthoritySnapshotEnabled },
      { key: 'selfImproveEnabled', apply: setters.setSelfImproveEnabled },
    ],
  };
}

export function hydrateRuntimeSettingsFromBindings(
  source: RuntimeSettings | Record<string, unknown> | undefined,
  dirty: boolean,
  bindings: RuntimeHydrationBindings,
): boolean {
  if (!hasSnapshotData(source) || dirty) return false;
  for (const binding of bindings.stringBindings) {
    const value = source[binding.key];
    if (typeof value !== 'string') continue;
    if (!binding.allowEmpty && !value) continue;
    binding.apply(value);
  }
  for (const binding of bindings.numberBindings) {
    const value = source[binding.key];
    if (typeof value !== 'number') continue;
    binding.apply(value);
  }
  for (const binding of bindings.booleanBindings) {
    const value = source[binding.key];
    if (typeof value !== 'boolean') continue;
    binding.apply(value);
  }
  return true;
}

export function collectRuntimeSettingsPayload(
  input: RuntimeSettingsPayloadSerializerInput,
): RuntimeSettings {
  const {
    resolveModelTokenDefaults,
    runtimeSettingsFallbackBaseline,
  } = input;
  return {
    runProfile: input.runProfile ?? input.profile,
    profile: input.profile,
    searchProvider: input.searchProvider,
    searxngBaseUrl: String(input.searxngBaseUrl || '').trim(),
    bingSearchEndpoint: String(input.bingSearchEndpoint || '').trim(),
    bingSearchKey: String(input.bingSearchKey || '').trim(),
    googleCseCx: String(input.googleCseCx || '').trim(),
    googleCseKey: String(input.googleCseKey || '').trim(),
    llmPlanApiKey: String(input.llmPlanApiKey || '').trim(),
    duckduckgoBaseUrl: String(input.duckduckgoBaseUrl || '').trim(),
    llmModelPlan: input.llmModelPlan || input.phase2LlmModel,
    phase2LlmModel: input.phase2LlmModel,
    llmModelTriage: input.llmModelTriage || input.phase3LlmModel,
    phase3LlmModel: input.phase3LlmModel,
    llmModelFast: input.llmModelFast,
    llmModelReasoning: input.llmModelReasoning,
    llmModelExtract: input.llmModelExtract,
    llmModelValidate: input.llmModelValidate,
    llmModelWrite: input.llmModelWrite,
    needsetEvidenceDecayDays: parseRuntimeInt(
      input.needsetEvidenceDecayDays,
      runtimeSettingsFallbackBaseline.needsetEvidenceDecayDays,
    ),
    needsetEvidenceDecayFloor: parseRuntimeFloat(
      input.needsetEvidenceDecayFloor,
      runtimeSettingsFallbackBaseline.needsetEvidenceDecayFloor,
    ),
    needsetRequiredWeightIdentity: parseRuntimeFloat(
      input.needsetRequiredWeightIdentity,
      runtimeSettingsFallbackBaseline.needsetRequiredWeightIdentity,
    ),
    needsetRequiredWeightCritical: parseRuntimeFloat(
      input.needsetRequiredWeightCritical,
      runtimeSettingsFallbackBaseline.needsetRequiredWeightCritical,
    ),
    needsetRequiredWeightRequired: parseRuntimeFloat(
      input.needsetRequiredWeightRequired,
      runtimeSettingsFallbackBaseline.needsetRequiredWeightRequired,
    ),
    needsetRequiredWeightExpected: parseRuntimeFloat(
      input.needsetRequiredWeightExpected,
      runtimeSettingsFallbackBaseline.needsetRequiredWeightExpected,
    ),
    needsetRequiredWeightOptional: parseRuntimeFloat(
      input.needsetRequiredWeightOptional,
      runtimeSettingsFallbackBaseline.needsetRequiredWeightOptional,
    ),
    needsetMissingMultiplier: parseRuntimeFloat(
      input.needsetMissingMultiplier,
      runtimeSettingsFallbackBaseline.needsetMissingMultiplier,
    ),
    needsetTierDeficitMultiplier: parseRuntimeFloat(
      input.needsetTierDeficitMultiplier,
      runtimeSettingsFallbackBaseline.needsetTierDeficitMultiplier,
    ),
    needsetMinRefsDeficitMultiplier: parseRuntimeFloat(
      input.needsetMinRefsDeficitMultiplier,
      runtimeSettingsFallbackBaseline.needsetMinRefsDeficitMultiplier,
    ),
    needsetConflictMultiplier: parseRuntimeFloat(
      input.needsetConflictMultiplier,
      runtimeSettingsFallbackBaseline.needsetConflictMultiplier,
    ),
    needsetIdentityLockThreshold: parseRuntimeFloat(
      input.needsetIdentityLockThreshold,
      runtimeSettingsFallbackBaseline.needsetIdentityLockThreshold,
    ),
    needsetIdentityProvisionalThreshold: parseRuntimeFloat(
      input.needsetIdentityProvisionalThreshold,
      runtimeSettingsFallbackBaseline.needsetIdentityProvisionalThreshold,
    ),
    needsetDefaultIdentityAuditLimit: parseRuntimeInt(
      input.needsetDefaultIdentityAuditLimit,
      runtimeSettingsFallbackBaseline.needsetDefaultIdentityAuditLimit,
    ),
    consensusMethodWeightNetworkJson: parseRuntimeFloat(
      input.consensusMethodWeightNetworkJson,
      runtimeSettingsFallbackBaseline.consensusMethodWeightNetworkJson,
    ),
    consensusMethodWeightAdapterApi: parseRuntimeFloat(
      input.consensusMethodWeightAdapterApi,
      runtimeSettingsFallbackBaseline.consensusMethodWeightAdapterApi,
    ),
    consensusMethodWeightStructuredMeta: parseRuntimeFloat(
      input.consensusMethodWeightStructuredMeta,
      runtimeSettingsFallbackBaseline.consensusMethodWeightStructuredMeta,
    ),
    consensusMethodWeightPdf: parseRuntimeFloat(
      input.consensusMethodWeightPdf,
      runtimeSettingsFallbackBaseline.consensusMethodWeightPdf,
    ),
    consensusMethodWeightTableKv: parseRuntimeFloat(
      input.consensusMethodWeightTableKv,
      runtimeSettingsFallbackBaseline.consensusMethodWeightTableKv,
    ),
    consensusMethodWeightDom: parseRuntimeFloat(
      input.consensusMethodWeightDom,
      runtimeSettingsFallbackBaseline.consensusMethodWeightDom,
    ),
    consensusMethodWeightLlmExtractBase: parseRuntimeFloat(
      input.consensusMethodWeightLlmExtractBase,
      runtimeSettingsFallbackBaseline.consensusMethodWeightLlmExtractBase,
    ),
    consensusPolicyBonus: parseRuntimeFloat(
      input.consensusPolicyBonus,
      runtimeSettingsFallbackBaseline.consensusPolicyBonus,
    ),
    consensusWeightedMajorityThreshold: parseRuntimeFloat(
      input.consensusWeightedMajorityThreshold,
      runtimeSettingsFallbackBaseline.consensusWeightedMajorityThreshold,
    ),
    consensusStrictAcceptanceDomainCount: parseRuntimeInt(
      input.consensusStrictAcceptanceDomainCount,
      runtimeSettingsFallbackBaseline.consensusStrictAcceptanceDomainCount,
    ),
    consensusRelaxedAcceptanceDomainCount: parseRuntimeInt(
      input.consensusRelaxedAcceptanceDomainCount,
      runtimeSettingsFallbackBaseline.consensusRelaxedAcceptanceDomainCount,
    ),
    consensusInstrumentedFieldThreshold: parseRuntimeInt(
      input.consensusInstrumentedFieldThreshold,
      runtimeSettingsFallbackBaseline.consensusInstrumentedFieldThreshold,
    ),
    consensusConfidenceScoringBase: parseRuntimeFloat(
      input.consensusConfidenceScoringBase,
      runtimeSettingsFallbackBaseline.consensusConfidenceScoringBase,
    ),
    consensusPassTargetIdentityStrong: parseRuntimeInt(
      input.consensusPassTargetIdentityStrong,
      runtimeSettingsFallbackBaseline.consensusPassTargetIdentityStrong,
    ),
    consensusPassTargetNormal: parseRuntimeInt(
      input.consensusPassTargetNormal,
      runtimeSettingsFallbackBaseline.consensusPassTargetNormal,
    ),
    retrievalTierWeightTier1: parseRuntimeFloat(
      input.retrievalTierWeightTier1,
      runtimeSettingsFallbackBaseline.retrievalTierWeightTier1,
    ),
    retrievalTierWeightTier2: parseRuntimeFloat(
      input.retrievalTierWeightTier2,
      runtimeSettingsFallbackBaseline.retrievalTierWeightTier2,
    ),
    retrievalTierWeightTier3: parseRuntimeFloat(
      input.retrievalTierWeightTier3,
      runtimeSettingsFallbackBaseline.retrievalTierWeightTier3,
    ),
    retrievalTierWeightTier4: parseRuntimeFloat(
      input.retrievalTierWeightTier4,
      runtimeSettingsFallbackBaseline.retrievalTierWeightTier4,
    ),
    retrievalTierWeightTier5: parseRuntimeFloat(
      input.retrievalTierWeightTier5,
      runtimeSettingsFallbackBaseline.retrievalTierWeightTier5,
    ),
    retrievalDocKindWeightManualPdf: parseRuntimeFloat(
      input.retrievalDocKindWeightManualPdf,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightManualPdf,
    ),
    retrievalDocKindWeightSpecPdf: parseRuntimeFloat(
      input.retrievalDocKindWeightSpecPdf,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightSpecPdf,
    ),
    retrievalDocKindWeightSupport: parseRuntimeFloat(
      input.retrievalDocKindWeightSupport,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightSupport,
    ),
    retrievalDocKindWeightLabReview: parseRuntimeFloat(
      input.retrievalDocKindWeightLabReview,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightLabReview,
    ),
    retrievalDocKindWeightProductPage: parseRuntimeFloat(
      input.retrievalDocKindWeightProductPage,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightProductPage,
    ),
    retrievalDocKindWeightOther: parseRuntimeFloat(
      input.retrievalDocKindWeightOther,
      runtimeSettingsFallbackBaseline.retrievalDocKindWeightOther,
    ),
    retrievalMethodWeightTable: parseRuntimeFloat(
      input.retrievalMethodWeightTable,
      runtimeSettingsFallbackBaseline.retrievalMethodWeightTable,
    ),
    retrievalMethodWeightKv: parseRuntimeFloat(
      input.retrievalMethodWeightKv,
      runtimeSettingsFallbackBaseline.retrievalMethodWeightKv,
    ),
    retrievalMethodWeightJsonLd: parseRuntimeFloat(
      input.retrievalMethodWeightJsonLd,
      runtimeSettingsFallbackBaseline.retrievalMethodWeightJsonLd,
    ),
    retrievalMethodWeightLlmExtract: parseRuntimeFloat(
      input.retrievalMethodWeightLlmExtract,
      runtimeSettingsFallbackBaseline.retrievalMethodWeightLlmExtract,
    ),
    retrievalMethodWeightHelperSupportive: parseRuntimeFloat(
      input.retrievalMethodWeightHelperSupportive,
      runtimeSettingsFallbackBaseline.retrievalMethodWeightHelperSupportive,
    ),
    retrievalAnchorScorePerMatch: parseRuntimeFloat(
      input.retrievalAnchorScorePerMatch,
      runtimeSettingsFallbackBaseline.retrievalAnchorScorePerMatch,
    ),
    retrievalIdentityScorePerMatch: parseRuntimeFloat(
      input.retrievalIdentityScorePerMatch,
      runtimeSettingsFallbackBaseline.retrievalIdentityScorePerMatch,
    ),
    retrievalUnitMatchBonus: parseRuntimeFloat(
      input.retrievalUnitMatchBonus,
      runtimeSettingsFallbackBaseline.retrievalUnitMatchBonus,
    ),
    retrievalDirectFieldMatchBonus: parseRuntimeFloat(
      input.retrievalDirectFieldMatchBonus,
      runtimeSettingsFallbackBaseline.retrievalDirectFieldMatchBonus,
    ),
    identityGateBaseMatchThreshold: parseRuntimeFloat(
      input.identityGateBaseMatchThreshold,
      runtimeSettingsFallbackBaseline.identityGateBaseMatchThreshold,
    ),
    identityGateEasyAmbiguityReduction: parseRuntimeFloat(
      input.identityGateEasyAmbiguityReduction,
      runtimeSettingsFallbackBaseline.identityGateEasyAmbiguityReduction,
    ),
    identityGateMediumAmbiguityReduction: parseRuntimeFloat(
      input.identityGateMediumAmbiguityReduction,
      runtimeSettingsFallbackBaseline.identityGateMediumAmbiguityReduction,
    ),
    identityGateHardAmbiguityReduction: parseRuntimeFloat(
      input.identityGateHardAmbiguityReduction,
      runtimeSettingsFallbackBaseline.identityGateHardAmbiguityReduction,
    ),
    identityGateVeryHardAmbiguityIncrease: parseRuntimeFloat(
      input.identityGateVeryHardAmbiguityIncrease,
      runtimeSettingsFallbackBaseline.identityGateVeryHardAmbiguityIncrease,
    ),
    identityGateExtraHardAmbiguityIncrease: parseRuntimeFloat(
      input.identityGateExtraHardAmbiguityIncrease,
      runtimeSettingsFallbackBaseline.identityGateExtraHardAmbiguityIncrease,
    ),
    identityGateMissingStrongIdPenalty: parseRuntimeFloat(
      input.identityGateMissingStrongIdPenalty,
      runtimeSettingsFallbackBaseline.identityGateMissingStrongIdPenalty,
    ),
    identityGateHardMissingStrongIdIncrease: parseRuntimeFloat(
      input.identityGateHardMissingStrongIdIncrease,
      runtimeSettingsFallbackBaseline.identityGateHardMissingStrongIdIncrease,
    ),
    identityGateVeryHardMissingStrongIdIncrease: parseRuntimeFloat(
      input.identityGateVeryHardMissingStrongIdIncrease,
      runtimeSettingsFallbackBaseline.identityGateVeryHardMissingStrongIdIncrease,
    ),
    identityGateExtraHardMissingStrongIdIncrease: parseRuntimeFloat(
      input.identityGateExtraHardMissingStrongIdIncrease,
      runtimeSettingsFallbackBaseline.identityGateExtraHardMissingStrongIdIncrease,
    ),
    identityGateNumericTokenBoost: parseRuntimeFloat(
      input.identityGateNumericTokenBoost,
      runtimeSettingsFallbackBaseline.identityGateNumericTokenBoost,
    ),
    identityGateNumericRangeThreshold: parseRuntimeInt(
      input.identityGateNumericRangeThreshold,
      runtimeSettingsFallbackBaseline.identityGateNumericRangeThreshold,
    ),
    qualityGateIdentityThreshold: parseRuntimeFloat(
      input.qualityGateIdentityThreshold,
      runtimeSettingsFallbackBaseline.qualityGateIdentityThreshold,
    ),
    evidenceTextMaxChars: parseRuntimeInt(
      input.evidenceTextMaxChars,
      runtimeSettingsFallbackBaseline.evidenceTextMaxChars,
    ),
    identityGatePublishThreshold: parseRuntimeFloat(
      input.identityGatePublishThreshold,
      runtimeSettingsFallbackBaseline.identityGatePublishThreshold,
    ),
    llmExtractMaxTokens: parseRuntimeInt(
      input.llmExtractMaxTokens,
      runtimeSettingsFallbackBaseline.llmExtractMaxTokens,
    ),
    llmExtractMaxSnippetsPerBatch: parseRuntimeInt(
      input.llmExtractMaxSnippetsPerBatch,
      runtimeSettingsFallbackBaseline.llmExtractMaxSnippetsPerBatch,
    ),
    llmExtractMaxSnippetChars: parseRuntimeInt(
      input.llmExtractMaxSnippetChars,
      runtimeSettingsFallbackBaseline.llmExtractMaxSnippetChars,
    ),
    llmExtractReasoningBudget: parseRuntimeInt(
      input.llmExtractReasoningBudget,
      runtimeSettingsFallbackBaseline.llmExtractReasoningBudget,
    ),
    llmReasoningBudget: parseRuntimeInt(
      input.llmReasoningBudget,
      runtimeSettingsFallbackBaseline.llmReasoningBudget,
    ),
    llmMonthlyBudgetUsd: parseRuntimeFloat(
      input.llmMonthlyBudgetUsd,
      runtimeSettingsFallbackBaseline.llmMonthlyBudgetUsd,
    ),
    llmPerProductBudgetUsd: parseRuntimeFloat(
      input.llmPerProductBudgetUsd,
      runtimeSettingsFallbackBaseline.llmPerProductBudgetUsd,
    ),
    llmMaxCallsPerRound: parseRuntimeInt(
      input.llmMaxCallsPerRound,
      runtimeSettingsFallbackBaseline.llmMaxCallsPerRound,
    ),
    llmMaxOutputTokens: parseRuntimeInt(
      input.llmMaxOutputTokens,
      runtimeSettingsFallbackBaseline.llmMaxOutputTokens,
    ),
    llmVerifySampleRate: parseRuntimeInt(
      input.llmVerifySampleRate,
      runtimeSettingsFallbackBaseline.llmVerifySampleRate,
    ),
    llmMaxBatchesPerProduct: parseRuntimeInt(
      input.llmMaxBatchesPerProduct,
      runtimeSettingsFallbackBaseline.llmMaxBatchesPerProduct,
    ),
    llmMaxEvidenceChars: parseRuntimeInt(
      input.llmMaxEvidenceChars,
      runtimeSettingsFallbackBaseline.llmMaxEvidenceChars,
    ),
    llmMaxTokens: parseRuntimeInt(
      input.llmMaxTokens,
      runtimeSettingsFallbackBaseline.llmMaxTokens,
    ),
    llmTimeoutMs: parseRuntimeInt(
      input.llmTimeoutMs,
      runtimeSettingsFallbackBaseline.llmTimeoutMs,
    ),
    llmCostInputPer1M: parseRuntimeFloat(
      input.llmCostInputPer1M,
      runtimeSettingsFallbackBaseline.llmCostInputPer1M,
    ),
    llmCostOutputPer1M: parseRuntimeFloat(
      input.llmCostOutputPer1M,
      runtimeSettingsFallbackBaseline.llmCostOutputPer1M,
    ),
    llmCostCachedInputPer1M: parseRuntimeFloat(
      input.llmCostCachedInputPer1M,
      runtimeSettingsFallbackBaseline.llmCostCachedInputPer1M,
    ),
    llmPlanFallbackModel: input.llmPlanFallbackModel || input.llmFallbackPlanModel,
    llmFallbackPlanModel: input.llmFallbackPlanModel,
    llmExtractFallbackModel: input.llmExtractFallbackModel || input.llmFallbackExtractModel,
    llmFallbackExtractModel: input.llmFallbackExtractModel,
    llmValidateFallbackModel: input.llmValidateFallbackModel || input.llmFallbackValidateModel,
    llmFallbackValidateModel: input.llmFallbackValidateModel,
    llmWriteFallbackModel: input.llmWriteFallbackModel || input.llmFallbackWriteModel,
    llmFallbackWriteModel: input.llmFallbackWriteModel,
    outputMode: String(input.outputMode || '').trim(),
    localInputRoot: String(input.localInputRoot || '').trim(),
    localOutputRoot: String(input.localOutputRoot || '').trim(),
    runtimeEventsKey: String(input.runtimeEventsKey || '').trim(),
    awsRegion: String(input.awsRegion || '').trim(),
    s3Bucket: String(input.s3Bucket || '').trim(),
    s3InputPrefix: String(input.s3InputPrefix || '').trim(),
    s3OutputPrefix: String(input.s3OutputPrefix || '').trim(),
    eloSupabaseAnonKey: String(input.eloSupabaseAnonKey || '').trim(),
    eloSupabaseEndpoint: String(input.eloSupabaseEndpoint || '').trim(),
    llmProvider: String(input.llmProvider || '').trim(),
    llmBaseUrl: String(input.llmBaseUrl || '').trim(),
    openaiApiKey: String(input.openaiApiKey || '').trim(),
    anthropicApiKey: String(input.anthropicApiKey || '').trim(),
    llmPlanProvider: String(input.llmPlanProvider || '').trim(),
    llmPlanBaseUrl: String(input.llmPlanBaseUrl || '').trim(),
    importsRoot: String(input.importsRoot || '').trim(),
    resumeMode: input.resumeMode,
    scannedPdfOcrBackend: input.scannedPdfOcrBackend,
    fetchConcurrency: parseRuntimeInt(
      input.fetchConcurrency,
      runtimeSettingsFallbackBaseline.fetchConcurrency,
    ),
    perHostMinDelayMs: parseRuntimeInt(
      input.perHostMinDelayMs,
      runtimeSettingsFallbackBaseline.perHostMinDelayMs,
    ),
    llmMaxOutputTokensPlan: clampTokenForModel(
      input.phase2LlmModel,
      input.llmMaxOutputTokensPlan ?? input.llmTokensPlan,
      resolveModelTokenDefaults,
    ),
    llmTokensPlan: clampTokenForModel(
      input.phase2LlmModel,
      input.llmTokensPlan,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensTriage: clampTokenForModel(
      input.phase3LlmModel,
      input.llmMaxOutputTokensTriage ?? input.llmTokensTriage,
      resolveModelTokenDefaults,
    ),
    llmTokensTriage: clampTokenForModel(
      input.phase3LlmModel,
      input.llmTokensTriage,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensFast: clampTokenForModel(
      input.llmModelFast,
      input.llmMaxOutputTokensFast ?? input.llmTokensFast,
      resolveModelTokenDefaults,
    ),
    llmTokensFast: clampTokenForModel(
      input.llmModelFast,
      input.llmTokensFast,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensReasoning: clampTokenForModel(
      input.llmModelReasoning,
      input.llmMaxOutputTokensReasoning ?? input.llmTokensReasoning,
      resolveModelTokenDefaults,
    ),
    llmTokensReasoning: clampTokenForModel(
      input.llmModelReasoning,
      input.llmTokensReasoning,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensExtract: clampTokenForModel(
      input.llmModelExtract,
      input.llmMaxOutputTokensExtract ?? input.llmTokensExtract,
      resolveModelTokenDefaults,
    ),
    llmTokensExtract: clampTokenForModel(
      input.llmModelExtract,
      input.llmTokensExtract,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensValidate: clampTokenForModel(
      input.llmModelValidate,
      input.llmMaxOutputTokensValidate ?? input.llmTokensValidate,
      resolveModelTokenDefaults,
    ),
    llmTokensValidate: clampTokenForModel(
      input.llmModelValidate,
      input.llmTokensValidate,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensWrite: clampTokenForModel(
      input.llmModelWrite,
      input.llmMaxOutputTokensWrite ?? input.llmTokensWrite,
      resolveModelTokenDefaults,
    ),
    llmTokensWrite: clampTokenForModel(
      input.llmModelWrite,
      input.llmTokensWrite,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensPlanFallback: clampTokenForModel(
      input.llmFallbackPlanModel || input.phase2LlmModel,
      input.llmMaxOutputTokensPlanFallback ?? input.llmTokensPlanFallback,
      resolveModelTokenDefaults,
    ),
    llmTokensPlanFallback: clampTokenForModel(
      input.llmFallbackPlanModel || input.phase2LlmModel,
      input.llmTokensPlanFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensExtractFallback: clampTokenForModel(
      input.llmFallbackExtractModel || input.llmModelExtract,
      input.llmMaxOutputTokensExtractFallback ?? input.llmTokensExtractFallback,
      resolveModelTokenDefaults,
    ),
    llmTokensExtractFallback: clampTokenForModel(
      input.llmFallbackExtractModel || input.llmModelExtract,
      input.llmTokensExtractFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensValidateFallback: clampTokenForModel(
      input.llmFallbackValidateModel || input.llmModelValidate,
      input.llmMaxOutputTokensValidateFallback ?? input.llmTokensValidateFallback,
      resolveModelTokenDefaults,
    ),
    llmTokensValidateFallback: clampTokenForModel(
      input.llmFallbackValidateModel || input.llmModelValidate,
      input.llmTokensValidateFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensWriteFallback: clampTokenForModel(
      input.llmFallbackWriteModel || input.llmModelWrite,
      input.llmMaxOutputTokensWriteFallback ?? input.llmTokensWriteFallback,
      resolveModelTokenDefaults,
    ),
    llmTokensWriteFallback: clampTokenForModel(
      input.llmFallbackWriteModel || input.llmModelWrite,
      input.llmTokensWriteFallback,
      resolveModelTokenDefaults,
    ),
    llmExtractionCacheTtlMs: parseRuntimeInt(
      input.llmExtractionCacheTtlMs,
      runtimeSettingsFallbackBaseline.llmExtractionCacheTtlMs,
    ),
    llmMaxCallsPerProductTotal: parseRuntimeInt(
      input.llmMaxCallsPerProductTotal,
      runtimeSettingsFallbackBaseline.llmMaxCallsPerProductTotal,
    ),
    llmMaxCallsPerProductFast: parseRuntimeInt(
      input.llmMaxCallsPerProductFast,
      runtimeSettingsFallbackBaseline.llmMaxCallsPerProductFast,
    ),
    resumeWindowHours: parseRuntimeInt(
      input.resumeWindowHours,
      runtimeSettingsFallbackBaseline.resumeWindowHours,
    ),
    indexingResumeSeedLimit: parseRuntimeInt(
      input.indexingResumeSeedLimit,
      runtimeSettingsFallbackBaseline.indexingResumeSeedLimit,
    ),
    indexingResumePersistLimit: parseRuntimeInt(
      input.indexingResumePersistLimit,
      runtimeSettingsFallbackBaseline.indexingResumePersistLimit,
    ),
    reextractAfterHours: parseRuntimeInt(
      input.reextractAfterHours,
      runtimeSettingsFallbackBaseline.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseRuntimeInt(
      input.scannedPdfOcrMaxPages,
      runtimeSettingsFallbackBaseline.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseRuntimeInt(
      input.scannedPdfOcrMaxPairs,
      runtimeSettingsFallbackBaseline.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseRuntimeInt(
      input.scannedPdfOcrMinCharsPerPage,
      runtimeSettingsFallbackBaseline.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseRuntimeInt(
      input.scannedPdfOcrMinLinesPerPage,
      runtimeSettingsFallbackBaseline.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseRuntimeFloat(
      input.scannedPdfOcrMinConfidence,
      runtimeSettingsFallbackBaseline.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseRuntimeInt(
      input.crawleeRequestHandlerTimeoutSecs,
      runtimeSettingsFallbackBaseline.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseRuntimeInt(
      input.dynamicFetchRetryBudget,
      runtimeSettingsFallbackBaseline.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseRuntimeInt(
      input.dynamicFetchRetryBackoffMs,
      runtimeSettingsFallbackBaseline.dynamicFetchRetryBackoffMs,
    ),
    fetchSchedulerMaxRetries: parseRuntimeInt(
      input.fetchSchedulerMaxRetries,
      runtimeSettingsFallbackBaseline.fetchSchedulerMaxRetries,
    ),
    fetchSchedulerFallbackWaitMs: parseRuntimeInt(
      input.fetchSchedulerFallbackWaitMs,
      runtimeSettingsFallbackBaseline.fetchSchedulerFallbackWaitMs,
    ),
    pageGotoTimeoutMs: parseRuntimeInt(
      input.pageGotoTimeoutMs,
      runtimeSettingsFallbackBaseline.pageGotoTimeoutMs,
    ),
    pageNetworkIdleTimeoutMs: parseRuntimeInt(
      input.pageNetworkIdleTimeoutMs,
      runtimeSettingsFallbackBaseline.pageNetworkIdleTimeoutMs,
    ),
    postLoadWaitMs: parseRuntimeInt(
      input.postLoadWaitMs,
      runtimeSettingsFallbackBaseline.postLoadWaitMs,
    ),
    frontierQueryCooldownSeconds: parseRuntimeInt(
      input.frontierQueryCooldownSeconds,
      runtimeSettingsFallbackBaseline.frontierQueryCooldownSeconds,
    ),
    frontierCooldown404Seconds: parseRuntimeInt(
      input.frontierCooldown404Seconds,
      runtimeSettingsFallbackBaseline.frontierCooldown404Seconds,
    ),
    frontierCooldown404RepeatSeconds: parseRuntimeInt(
      input.frontierCooldown404RepeatSeconds,
      runtimeSettingsFallbackBaseline.frontierCooldown404RepeatSeconds,
    ),
    frontierCooldown410Seconds: parseRuntimeInt(
      input.frontierCooldown410Seconds,
      runtimeSettingsFallbackBaseline.frontierCooldown410Seconds,
    ),
    frontierCooldownTimeoutSeconds: parseRuntimeInt(
      input.frontierCooldownTimeoutSeconds,
      runtimeSettingsFallbackBaseline.frontierCooldownTimeoutSeconds,
    ),
    frontierCooldown403BaseSeconds: parseRuntimeInt(
      input.frontierCooldown403BaseSeconds,
      runtimeSettingsFallbackBaseline.frontierCooldown403BaseSeconds,
    ),
    frontierCooldown429BaseSeconds: parseRuntimeInt(
      input.frontierCooldown429BaseSeconds,
      runtimeSettingsFallbackBaseline.frontierCooldown429BaseSeconds,
    ),
    frontierBackoffMaxExponent: parseRuntimeInt(
      input.frontierBackoffMaxExponent,
      runtimeSettingsFallbackBaseline.frontierBackoffMaxExponent,
    ),
    frontierPathPenaltyNotfoundThreshold: parseRuntimeInt(
      input.frontierPathPenaltyNotfoundThreshold,
      runtimeSettingsFallbackBaseline.frontierPathPenaltyNotfoundThreshold,
    ),
    frontierBlockedDomainThreshold: parseRuntimeInt(
      input.frontierBlockedDomainThreshold,
      runtimeSettingsFallbackBaseline.frontierBlockedDomainThreshold,
    ),
    autoScrollPasses: parseRuntimeInt(
      input.autoScrollPasses,
      runtimeSettingsFallbackBaseline.autoScrollPasses,
    ),
    autoScrollDelayMs: parseRuntimeInt(
      input.autoScrollDelayMs,
      runtimeSettingsFallbackBaseline.autoScrollDelayMs,
    ),
    maxGraphqlReplays: parseRuntimeInt(
      input.maxGraphqlReplays,
      runtimeSettingsFallbackBaseline.maxGraphqlReplays,
    ),
    maxNetworkResponsesPerPage: parseRuntimeInt(
      input.maxNetworkResponsesPerPage,
      runtimeSettingsFallbackBaseline.maxNetworkResponsesPerPage,
    ),
    robotsTxtTimeoutMs: parseRuntimeInt(
      input.robotsTxtTimeoutMs,
      runtimeSettingsFallbackBaseline.robotsTxtTimeoutMs,
    ),
    endpointSignalLimit: parseRuntimeInt(
      input.endpointSignalLimit,
      runtimeSettingsFallbackBaseline.endpointSignalLimit,
    ),
    endpointSuggestionLimit: parseRuntimeInt(
      input.endpointSuggestionLimit,
      runtimeSettingsFallbackBaseline.endpointSuggestionLimit,
    ),
    endpointNetworkScanLimit: parseRuntimeInt(
      input.endpointNetworkScanLimit,
      runtimeSettingsFallbackBaseline.endpointNetworkScanLimit,
    ),
    discoveryMaxQueries: parseRuntimeInt(
      input.discoveryMaxQueries,
      runtimeSettingsFallbackBaseline.discoveryMaxQueries,
    ),
    discoveryResultsPerQuery: parseRuntimeInt(
      input.discoveryResultsPerQuery,
      runtimeSettingsFallbackBaseline.discoveryResultsPerQuery,
    ),
    discoveryMaxDiscovered: parseRuntimeInt(
      input.discoveryMaxDiscovered,
      runtimeSettingsFallbackBaseline.discoveryMaxDiscovered,
    ),
    discoveryQueryConcurrency: parseRuntimeInt(
      input.discoveryQueryConcurrency,
      runtimeSettingsFallbackBaseline.discoveryQueryConcurrency,
    ),
    maxUrlsPerProduct: parseRuntimeInt(
      input.maxUrlsPerProduct,
      runtimeSettingsFallbackBaseline.maxUrlsPerProduct,
    ),
    maxCandidateUrls: parseRuntimeInt(
      input.maxCandidateUrls,
      runtimeSettingsFallbackBaseline.maxCandidateUrls,
    ),
    maxPagesPerDomain: parseRuntimeInt(
      input.maxPagesPerDomain,
      runtimeSettingsFallbackBaseline.maxPagesPerDomain,
    ),
    uberMaxUrlsPerProduct: parseRuntimeInt(
      input.uberMaxUrlsPerProduct,
      runtimeSettingsFallbackBaseline.uberMaxUrlsPerProduct,
    ),
    uberMaxUrlsPerDomain: parseRuntimeInt(
      input.uberMaxUrlsPerDomain,
      runtimeSettingsFallbackBaseline.uberMaxUrlsPerDomain,
    ),
    maxRunSeconds: parseRuntimeInt(
      input.maxRunSeconds,
      runtimeSettingsFallbackBaseline.maxRunSeconds,
    ),
    maxJsonBytes: parseRuntimeInt(
      input.maxJsonBytes,
      runtimeSettingsFallbackBaseline.maxJsonBytes,
    ),
    maxPdfBytes: parseRuntimeInt(
      input.maxPdfBytes,
      runtimeSettingsFallbackBaseline.maxPdfBytes,
    ),
    pdfBackendRouterTimeoutMs: parseRuntimeInt(
      input.pdfBackendRouterTimeoutMs,
      runtimeSettingsFallbackBaseline.pdfBackendRouterTimeoutMs,
    ),
    pdfBackendRouterMaxPages: parseRuntimeInt(
      input.pdfBackendRouterMaxPages,
      runtimeSettingsFallbackBaseline.pdfBackendRouterMaxPages,
    ),
    pdfBackendRouterMaxPairs: parseRuntimeInt(
      input.pdfBackendRouterMaxPairs,
      runtimeSettingsFallbackBaseline.pdfBackendRouterMaxPairs,
    ),
    pdfBackendRouterMaxTextPreviewChars: parseRuntimeInt(
      input.pdfBackendRouterMaxTextPreviewChars,
      runtimeSettingsFallbackBaseline.pdfBackendRouterMaxTextPreviewChars,
    ),
    capturePageScreenshotQuality: parseRuntimeInt(
      input.capturePageScreenshotQuality,
      runtimeSettingsFallbackBaseline.capturePageScreenshotQuality,
    ),
    capturePageScreenshotMaxBytes: parseRuntimeInt(
      input.capturePageScreenshotMaxBytes,
      runtimeSettingsFallbackBaseline.capturePageScreenshotMaxBytes,
    ),
    visualAssetCaptureMaxPerSource: parseRuntimeInt(
      input.visualAssetCaptureMaxPerSource,
      runtimeSettingsFallbackBaseline.visualAssetCaptureMaxPerSource,
    ),
    visualAssetRetentionDays: parseRuntimeInt(
      input.visualAssetRetentionDays,
      runtimeSettingsFallbackBaseline.visualAssetRetentionDays,
    ),
    visualAssetReviewLgMaxSide: parseRuntimeInt(
      input.visualAssetReviewLgMaxSide,
      runtimeSettingsFallbackBaseline.visualAssetReviewLgMaxSide,
    ),
    visualAssetReviewSmMaxSide: parseRuntimeInt(
      input.visualAssetReviewSmMaxSide,
      runtimeSettingsFallbackBaseline.visualAssetReviewSmMaxSide,
    ),
    visualAssetReviewLgQuality: parseRuntimeInt(
      input.visualAssetReviewLgQuality,
      runtimeSettingsFallbackBaseline.visualAssetReviewLgQuality,
    ),
    visualAssetReviewSmQuality: parseRuntimeInt(
      input.visualAssetReviewSmQuality,
      runtimeSettingsFallbackBaseline.visualAssetReviewSmQuality,
    ),
    visualAssetRegionCropMaxSide: parseRuntimeInt(
      input.visualAssetRegionCropMaxSide,
      runtimeSettingsFallbackBaseline.visualAssetRegionCropMaxSide,
    ),
    visualAssetRegionCropQuality: parseRuntimeInt(
      input.visualAssetRegionCropQuality,
      runtimeSettingsFallbackBaseline.visualAssetRegionCropQuality,
    ),
    visualAssetLlmMaxBytes: parseRuntimeInt(
      input.visualAssetLlmMaxBytes,
      runtimeSettingsFallbackBaseline.visualAssetLlmMaxBytes,
    ),
    visualAssetMinWidth: parseRuntimeInt(
      input.visualAssetMinWidth,
      runtimeSettingsFallbackBaseline.visualAssetMinWidth,
    ),
    visualAssetMinHeight: parseRuntimeInt(
      input.visualAssetMinHeight,
      runtimeSettingsFallbackBaseline.visualAssetMinHeight,
    ),
    visualAssetMinSharpness: parseRuntimeFloat(
      input.visualAssetMinSharpness,
      runtimeSettingsFallbackBaseline.visualAssetMinSharpness,
    ),
    visualAssetMinEntropy: parseRuntimeFloat(
      input.visualAssetMinEntropy,
      runtimeSettingsFallbackBaseline.visualAssetMinEntropy,
    ),
    visualAssetMaxPhashDistance: parseRuntimeInt(
      input.visualAssetMaxPhashDistance,
      runtimeSettingsFallbackBaseline.visualAssetMaxPhashDistance,
    ),
    articleExtractorMinChars: parseRuntimeInt(
      input.articleExtractorMinChars,
      runtimeSettingsFallbackBaseline.articleExtractorMinChars,
    ),
    articleExtractorMinScore: parseRuntimeInt(
      input.articleExtractorMinScore,
      runtimeSettingsFallbackBaseline.articleExtractorMinScore,
    ),
    articleExtractorMaxChars: parseRuntimeInt(
      input.articleExtractorMaxChars,
      runtimeSettingsFallbackBaseline.articleExtractorMaxChars,
    ),
    staticDomTargetMatchThreshold: parseRuntimeFloat(
      input.staticDomTargetMatchThreshold,
      runtimeSettingsFallbackBaseline.staticDomTargetMatchThreshold,
    ),
    staticDomMaxEvidenceSnippets: parseRuntimeInt(
      input.staticDomMaxEvidenceSnippets,
      runtimeSettingsFallbackBaseline.staticDomMaxEvidenceSnippets,
    ),
    structuredMetadataExtructTimeoutMs: parseRuntimeInt(
      input.structuredMetadataExtructTimeoutMs,
      runtimeSettingsFallbackBaseline.structuredMetadataExtructTimeoutMs,
    ),
    structuredMetadataExtructMaxItemsPerSurface: parseRuntimeInt(
      input.structuredMetadataExtructMaxItemsPerSurface,
      runtimeSettingsFallbackBaseline.structuredMetadataExtructMaxItemsPerSurface,
    ),
    structuredMetadataExtructCacheLimit: parseRuntimeInt(
      input.structuredMetadataExtructCacheLimit,
      runtimeSettingsFallbackBaseline.structuredMetadataExtructCacheLimit,
    ),
    domSnippetMaxChars: parseRuntimeInt(
      input.domSnippetMaxChars,
      runtimeSettingsFallbackBaseline.domSnippetMaxChars,
    ),
    maxManufacturerUrlsPerProduct: parseRuntimeInt(
      input.maxManufacturerUrlsPerProduct,
      runtimeSettingsFallbackBaseline.maxManufacturerUrlsPerProduct,
    ),
    maxManufacturerPagesPerDomain: parseRuntimeInt(
      input.maxManufacturerPagesPerDomain,
      runtimeSettingsFallbackBaseline.maxManufacturerPagesPerDomain,
    ),
    manufacturerReserveUrls: parseRuntimeInt(
      input.manufacturerReserveUrls,
      runtimeSettingsFallbackBaseline.manufacturerReserveUrls,
    ),
    maxHypothesisItems: parseRuntimeInt(
      input.maxHypothesisItems,
      runtimeSettingsFallbackBaseline.maxHypothesisItems,
    ),
    hypothesisAutoFollowupRounds: parseRuntimeInt(
      input.hypothesisAutoFollowupRounds,
      runtimeSettingsFallbackBaseline.hypothesisAutoFollowupRounds,
    ),
    hypothesisFollowupUrlsPerRound: parseRuntimeInt(
      input.hypothesisFollowupUrlsPerRound,
      runtimeSettingsFallbackBaseline.hypothesisFollowupUrlsPerRound,
    ),
    learningConfidenceThreshold: parseRuntimeFloat(
      input.learningConfidenceThreshold,
      runtimeSettingsFallbackBaseline.learningConfidenceThreshold,
    ),
    componentLexiconDecayDays: parseRuntimeInt(
      input.componentLexiconDecayDays,
      runtimeSettingsFallbackBaseline.componentLexiconDecayDays,
    ),
    componentLexiconExpireDays: parseRuntimeInt(
      input.componentLexiconExpireDays,
      runtimeSettingsFallbackBaseline.componentLexiconExpireDays,
    ),
    fieldAnchorsDecayDays: parseRuntimeInt(
      input.fieldAnchorsDecayDays,
      runtimeSettingsFallbackBaseline.fieldAnchorsDecayDays,
    ),
    urlMemoryDecayDays: parseRuntimeInt(
      input.urlMemoryDecayDays,
      runtimeSettingsFallbackBaseline.urlMemoryDecayDays,
    ),
    cseRescueRequiredIteration: parseRuntimeInt(
      input.cseRescueRequiredIteration,
      runtimeSettingsFallbackBaseline.cseRescueRequiredIteration,
    ),
    duckduckgoTimeoutMs: parseRuntimeInt(
      input.duckduckgoTimeoutMs,
      runtimeSettingsFallbackBaseline.duckduckgoTimeoutMs,
    ),
    runtimeScreencastFps: parseRuntimeInt(
      input.runtimeScreencastFps,
      runtimeSettingsFallbackBaseline.runtimeScreencastFps,
    ),
    runtimeScreencastQuality: parseRuntimeInt(
      input.runtimeScreencastQuality,
      runtimeSettingsFallbackBaseline.runtimeScreencastQuality,
    ),
    runtimeScreencastMaxWidth: parseRuntimeInt(
      input.runtimeScreencastMaxWidth,
      runtimeSettingsFallbackBaseline.runtimeScreencastMaxWidth,
    ),
    runtimeScreencastMaxHeight: parseRuntimeInt(
      input.runtimeScreencastMaxHeight,
      runtimeSettingsFallbackBaseline.runtimeScreencastMaxHeight,
    ),
    runtimeTraceFetchRing: parseRuntimeInt(
      input.runtimeTraceFetchRing,
      runtimeSettingsFallbackBaseline.runtimeTraceFetchRing,
    ),
    runtimeTraceLlmRing: parseRuntimeInt(
      input.runtimeTraceLlmRing,
      runtimeSettingsFallbackBaseline.runtimeTraceLlmRing,
    ),
    daemonConcurrency: parseRuntimeInt(
      input.daemonConcurrency,
      runtimeSettingsFallbackBaseline.daemonConcurrency,
    ),
    daemonGracefulShutdownTimeoutMs: parseRuntimeInt(
      input.daemonGracefulShutdownTimeoutMs,
      runtimeSettingsFallbackBaseline.daemonGracefulShutdownTimeoutMs,
    ),
    importsPollSeconds: parseRuntimeInt(
      input.importsPollSeconds,
      runtimeSettingsFallbackBaseline.importsPollSeconds,
    ),
    convergenceIdentityFailFastRounds: parseRuntimeInt(
      input.convergenceIdentityFailFastRounds,
      runtimeSettingsFallbackBaseline.convergenceIdentityFailFastRounds,
    ),
    helperSupportiveMaxSources: parseRuntimeInt(
      input.helperSupportiveMaxSources,
      runtimeSettingsFallbackBaseline.helperSupportiveMaxSources,
    ),
    helperActiveSyncLimit: parseRuntimeInt(
      input.helperActiveSyncLimit,
      runtimeSettingsFallbackBaseline.helperActiveSyncLimit,
    ),
    fieldRewardHalfLifeDays: parseRuntimeInt(
      input.fieldRewardHalfLifeDays,
      runtimeSettingsFallbackBaseline.fieldRewardHalfLifeDays,
    ),
    driftPollSeconds: parseRuntimeInt(
      input.driftPollSeconds,
      runtimeSettingsFallbackBaseline.driftPollSeconds,
    ),
    driftScanMaxProducts: parseRuntimeInt(
      input.driftScanMaxProducts,
      runtimeSettingsFallbackBaseline.driftScanMaxProducts,
    ),
    reCrawlStaleAfterDays: parseRuntimeInt(
      input.reCrawlStaleAfterDays,
      runtimeSettingsFallbackBaseline.reCrawlStaleAfterDays,
    ),
    aggressiveConfidenceThreshold: parseRuntimeFloat(
      input.aggressiveConfidenceThreshold,
      runtimeSettingsFallbackBaseline.aggressiveConfidenceThreshold,
    ),
    aggressiveMaxSearchQueries: parseRuntimeInt(
      input.aggressiveMaxSearchQueries,
      runtimeSettingsFallbackBaseline.aggressiveMaxSearchQueries,
    ),
    aggressiveEvidenceAuditBatchSize: parseRuntimeInt(
      input.aggressiveEvidenceAuditBatchSize,
      runtimeSettingsFallbackBaseline.aggressiveEvidenceAuditBatchSize,
    ),
    aggressiveMaxTimePerProductMs: parseRuntimeInt(
      input.aggressiveMaxTimePerProductMs,
      runtimeSettingsFallbackBaseline.aggressiveMaxTimePerProductMs,
    ),
    aggressiveThoroughFromRound: parseRuntimeInt(
      input.aggressiveThoroughFromRound,
      runtimeSettingsFallbackBaseline.aggressiveThoroughFromRound,
    ),
    aggressiveRound1MaxUrls: parseRuntimeInt(
      input.aggressiveRound1MaxUrls,
      runtimeSettingsFallbackBaseline.aggressiveRound1MaxUrls,
    ),
    aggressiveRound1MaxCandidateUrls: parseRuntimeInt(
      input.aggressiveRound1MaxCandidateUrls,
      runtimeSettingsFallbackBaseline.aggressiveRound1MaxCandidateUrls,
    ),
    aggressiveLlmMaxCallsPerRound: parseRuntimeInt(
      input.aggressiveLlmMaxCallsPerRound,
      runtimeSettingsFallbackBaseline.aggressiveLlmMaxCallsPerRound,
    ),
    aggressiveLlmMaxCallsPerProductTotal: parseRuntimeInt(
      input.aggressiveLlmMaxCallsPerProductTotal,
      runtimeSettingsFallbackBaseline.aggressiveLlmMaxCallsPerProductTotal,
    ),
    aggressiveLlmTargetMaxFields: parseRuntimeInt(
      input.aggressiveLlmTargetMaxFields,
      runtimeSettingsFallbackBaseline.aggressiveLlmTargetMaxFields,
    ),
    aggressiveLlmDiscoveryPasses: parseRuntimeInt(
      input.aggressiveLlmDiscoveryPasses,
      runtimeSettingsFallbackBaseline.aggressiveLlmDiscoveryPasses,
    ),
    aggressiveLlmDiscoveryQueryCap: parseRuntimeInt(
      input.aggressiveLlmDiscoveryQueryCap,
      runtimeSettingsFallbackBaseline.aggressiveLlmDiscoveryQueryCap,
    ),
    uberMaxRounds: parseRuntimeInt(
      input.uberMaxRounds,
      runtimeSettingsFallbackBaseline.uberMaxRounds,
    ),
    cortexSyncTimeoutMs: parseRuntimeInt(
      input.cortexSyncTimeoutMs,
      runtimeSettingsFallbackBaseline.cortexSyncTimeoutMs,
    ),
    cortexAsyncPollIntervalMs: parseRuntimeInt(
      input.cortexAsyncPollIntervalMs,
      runtimeSettingsFallbackBaseline.cortexAsyncPollIntervalMs,
    ),
    cortexAsyncMaxWaitMs: parseRuntimeInt(
      input.cortexAsyncMaxWaitMs,
      runtimeSettingsFallbackBaseline.cortexAsyncMaxWaitMs,
    ),
    cortexEnsureReadyTimeoutMs: parseRuntimeInt(
      input.cortexEnsureReadyTimeoutMs,
      runtimeSettingsFallbackBaseline.cortexEnsureReadyTimeoutMs,
    ),
    cortexStartReadyTimeoutMs: parseRuntimeInt(
      input.cortexStartReadyTimeoutMs,
      runtimeSettingsFallbackBaseline.cortexStartReadyTimeoutMs,
    ),
    cortexFailureThreshold: parseRuntimeInt(
      input.cortexFailureThreshold,
      runtimeSettingsFallbackBaseline.cortexFailureThreshold,
    ),
    cortexCircuitOpenMs: parseRuntimeInt(
      input.cortexCircuitOpenMs,
      runtimeSettingsFallbackBaseline.cortexCircuitOpenMs,
    ),
    cortexEscalateConfidenceLt: parseRuntimeFloat(
      input.cortexEscalateConfidenceLt,
      runtimeSettingsFallbackBaseline.cortexEscalateConfidenceLt,
    ),
    cortexMaxDeepFieldsPerProduct: parseRuntimeInt(
      input.cortexMaxDeepFieldsPerProduct,
      runtimeSettingsFallbackBaseline.cortexMaxDeepFieldsPerProduct,
    ),
    userAgent: String(input.userAgent || '').trim(),
    pdfPreferredBackend: String(input.pdfPreferredBackend || '').trim(),
    capturePageScreenshotFormat: String(input.capturePageScreenshotFormat || '').trim(),
    capturePageScreenshotSelectors: String(input.capturePageScreenshotSelectors || '').trim(),
    runtimeScreenshotMode: String(input.runtimeScreenshotMode || '').trim(),
    visualAssetReviewFormat: String(input.visualAssetReviewFormat || '').trim(),
    visualAssetHeroSelectorMapJson: String(input.visualAssetHeroSelectorMapJson || '').trim(),
    runtimeControlFile: String(input.runtimeControlFile || '').trim(),
    staticDomMode: String(input.staticDomMode || '').trim(),
    specDbDir: String(input.specDbDir || '').trim(),
    articleExtractorDomainPolicyMapJson: String(input.articleExtractorDomainPolicyMapJson || '').trim(),
    structuredMetadataExtructUrl: String(input.structuredMetadataExtructUrl || '').trim(),
    llmExtractionCacheDir: String(input.llmExtractionCacheDir || '').trim(),
    cortexBaseUrl: String(input.cortexBaseUrl || '').trim(),
    cortexApiKey: String(input.cortexApiKey || '').trim(),
    cortexAsyncBaseUrl: String(input.cortexAsyncBaseUrl || '').trim(),
    cortexAsyncSubmitPath: String(input.cortexAsyncSubmitPath || '').trim(),
    cortexAsyncStatusPath: String(input.cortexAsyncStatusPath || '').trim(),
    cortexModelFast: String(input.cortexModelFast || '').trim(),
    cortexModelAudit: String(input.cortexModelAudit || '').trim(),
    cortexModelDom: String(input.cortexModelDom || '').trim(),
    cortexModelReasoningDeep: String(input.cortexModelReasoningDeep || '').trim(),
    cortexModelVision: String(input.cortexModelVision || '').trim(),
    cortexModelSearchFast: String(input.cortexModelSearchFast || '').trim(),
    cortexModelRerankFast: String(input.cortexModelRerankFast || '').trim(),
    cortexModelSearchDeep: String(input.cortexModelSearchDeep || '').trim(),
    helperFilesRoot: String(input.helperFilesRoot || '').trim(),
    batchStrategy: String(input.batchStrategy || '').trim(),
    frontierDbPath: String(input.frontierDbPath || '').trim(),
    dynamicFetchPolicyMapJson: String(input.dynamicFetchPolicyMapJson || '').trim(),
    searchProfileCapMapJson: String(input.searchProfileCapMapJson || '').trim(),
    serpRerankerWeightMapJson: String(input.serpRerankerWeightMapJson || '').trim(),
    fetchSchedulerInternalsMapJson: parseRuntimeString(input.fetchSchedulerInternalsMapJson),
    retrievalInternalsMapJson: parseRuntimeString(input.retrievalInternalsMapJson),
    evidencePackLimitsMapJson: parseRuntimeString(input.evidencePackLimitsMapJson),
    identityGateThresholdBoundsMapJson: parseRuntimeString(input.identityGateThresholdBoundsMapJson),
    parsingConfidenceBaseMapJson: parseRuntimeString(input.parsingConfidenceBaseMapJson),
    repairDedupeRule: String(input.repairDedupeRule || '').trim(),
    automationQueueStorageEngine: String(input.automationQueueStorageEngine || '').trim(),
    discoveryEnabled: input.discoveryEnabled,
    llmPlanDiscoveryQueries: input.llmPlanDiscoveryQueries ?? input.phase2LlmEnabled,
    phase2LlmEnabled: input.phase2LlmEnabled,
    llmSerpRerankEnabled: input.llmSerpRerankEnabled ?? input.phase3LlmTriageEnabled,
    phase3LlmTriageEnabled: input.phase3LlmTriageEnabled,
    llmExtractionCacheEnabled: input.llmExtractionCacheEnabled,
    llmExtractSkipLowSignal: input.llmExtractSkipLowSignal,
    llmReasoningMode: input.llmReasoningMode,
    llmDisableBudgetGuards: input.llmDisableBudgetGuards,
    llmVerifyMode: input.llmVerifyMode,
    localMode: input.localMode,
    dryRun: input.dryRun,
    mirrorToS3: input.mirrorToS3,
    mirrorToS3Input: input.mirrorToS3Input,
    writeMarkdownSummary: input.writeMarkdownSummary,
    llmEnabled: input.llmEnabled,
    llmWriteSummary: input.llmWriteSummary,
    llmFallbackEnabled: input.llmFallbackEnabled,
    reextractIndexed: input.reextractIndexed,
    fetchCandidateSources: input.fetchCandidateSources,
    manufacturerBroadDiscovery: input.manufacturerBroadDiscovery,
    manufacturerSeedSearchUrls: input.manufacturerSeedSearchUrls,
    manufacturerDeepResearchEnabled: input.manufacturerDeepResearchEnabled,
    pdfBackendRouterEnabled: input.pdfBackendRouterEnabled,
    capturePageScreenshotEnabled: input.capturePageScreenshotEnabled,
    runtimeCaptureScreenshots: input.runtimeCaptureScreenshots,
    visualAssetCaptureEnabled: input.visualAssetCaptureEnabled,
    visualAssetStoreOriginal: input.visualAssetStoreOriginal,
    visualAssetPhashEnabled: input.visualAssetPhashEnabled,
    chartExtractionEnabled: input.chartExtractionEnabled,
    articleExtractorV2Enabled: input.articleExtractorV2Enabled,
    staticDomExtractorEnabled: input.staticDomExtractorEnabled,
    htmlTableExtractorV2: input.htmlTableExtractorV2,
    structuredMetadataExtructEnabled: input.structuredMetadataExtructEnabled,
    structuredMetadataExtructCacheEnabled: input.structuredMetadataExtructCacheEnabled,
    helperFilesEnabled: input.helperFilesEnabled,
    helperSupportiveEnabled: input.helperSupportiveEnabled,
    helperSupportiveFillMissing: input.helperSupportiveFillMissing,
    helperAutoSeedTargets: input.helperAutoSeedTargets,
    driftDetectionEnabled: input.driftDetectionEnabled,
    driftAutoRepublish: input.driftAutoRepublish,
    aggressiveModeEnabled: input.aggressiveModeEnabled,
    aggressiveEvidenceAuditEnabled: input.aggressiveEvidenceAuditEnabled,
    uberAggressiveEnabled: input.uberAggressiveEnabled,
    cortexEnabled: input.cortexEnabled,
    cortexAsyncEnabled: input.cortexAsyncEnabled,
    cortexAutoStart: input.cortexAutoStart,
    cortexAutoRestartOnAuth: input.cortexAutoRestartOnAuth,
    cortexEscalateIfConflict: input.cortexEscalateIfConflict,
    cortexEscalateCriticalOnly: input.cortexEscalateCriticalOnly,
    allowBelowPassTargetFill: input.allowBelowPassTargetFill,
    indexingHelperFilesEnabled: input.indexingHelperFilesEnabled,
    disableGoogleCse: input.disableGoogleCse,
    cseRescueOnlyMode: input.cseRescueOnlyMode,
    duckduckgoEnabled: input.duckduckgoEnabled,
    scannedPdfOcrEnabled: input.scannedPdfOcrEnabled,
    scannedPdfOcrPromoteCandidates: input.scannedPdfOcrPromoteCandidates,
    dynamicCrawleeEnabled: input.dynamicCrawleeEnabled,
    crawleeHeadless: input.crawleeHeadless,
    fetchSchedulerEnabled: input.fetchSchedulerEnabled,
    preferHttpFetcher: input.preferHttpFetcher,
    frontierEnableSqlite: input.frontierEnableSqlite,
    frontierStripTrackingParams: input.frontierStripTrackingParams,
    frontierRepairSearchEnabled: input.frontierRepairSearchEnabled,
    autoScrollEnabled: input.autoScrollEnabled,
    graphqlReplayEnabled: input.graphqlReplayEnabled,
    robotsTxtCompliant: input.robotsTxtCompliant,
    runtimeScreencastEnabled: input.runtimeScreencastEnabled,
    runtimeTraceEnabled: input.runtimeTraceEnabled,
    runtimeTraceLlmPayloads: input.runtimeTraceLlmPayloads,
    eventsJsonWrite: input.eventsJsonWrite,
    indexingSchemaPacketsValidationEnabled: input.indexingSchemaPacketsValidationEnabled,
    indexingSchemaPacketsValidationStrict: input.indexingSchemaPacketsValidationStrict,
    queueJsonWrite: input.queueJsonWrite,
    billingJsonWrite: input.billingJsonWrite,
    brainJsonWrite: input.brainJsonWrite,
    intelJsonWrite: input.intelJsonWrite,
    corpusJsonWrite: input.corpusJsonWrite,
    learningJsonWrite: input.learningJsonWrite,
    cacheJsonWrite: input.cacheJsonWrite,
    authoritySnapshotEnabled: input.authoritySnapshotEnabled,
    selfImproveEnabled: input.selfImproveEnabled,
  };
}
