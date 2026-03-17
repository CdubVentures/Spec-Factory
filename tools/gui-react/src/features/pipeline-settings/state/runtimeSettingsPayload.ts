import type { RuntimeSettings } from './runtimeSettingsAuthority';
import type { RuntimeSettingsPayloadSerializerInput } from './runtimeSettingsDomainTypes';
import {
  clampTokenForModel,
  parseRuntimeFloat,
  parseRuntimeInt,
  parseRuntimeString,
} from './runtimeSettingsParsing';

export function collectRuntimeSettingsPayload(
  input: RuntimeSettingsPayloadSerializerInput,
): RuntimeSettings {
  const {
    resolveModelTokenDefaults,
    runtimeSettingsFallbackBaseline,
  } = input;
  return {
    runProfile: 'standard',
    profile: 'standard',
    searchProvider: input.searchProvider,
    searxngBaseUrl: String(input.searxngBaseUrl || '').trim(),
    llmPlanApiKey: String(input.llmPlanApiKey || '').trim(),
    llmModelPlan: input.llmModelPlan,
    llmModelTriage: input.llmModelTriage,
    llmModelFast: input.llmModelFast,
    llmModelReasoning: input.llmModelReasoning,
    llmModelExtract: input.llmModelExtract,
    llmModelValidate: input.llmModelValidate,
    llmModelWrite: input.llmModelWrite,
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
    llmPlanFallbackModel: input.llmPlanFallbackModel || '',
    llmReasoningFallbackModel: input.llmReasoningFallbackModel || '',
    llmExtractFallbackModel: input.llmExtractFallbackModel || '',
    llmValidateFallbackModel: input.llmValidateFallbackModel || '',
    llmWriteFallbackModel: input.llmWriteFallbackModel || '',
    outputMode: String(input.outputMode || '').trim(),
    localInputRoot: String(input.localInputRoot || '').trim(),
    localOutputRoot: String(input.localOutputRoot || '').trim(),
    runtimeEventsKey: String(input.runtimeEventsKey || '').trim(),
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
    llmExtractProvider: String(input.llmExtractProvider || '').trim(),
    llmExtractBaseUrl: String(input.llmExtractBaseUrl || '').trim(),
    llmExtractApiKey: String(input.llmExtractApiKey || '').trim(),
    llmValidateProvider: String(input.llmValidateProvider || '').trim(),
    llmValidateBaseUrl: String(input.llmValidateBaseUrl || '').trim(),
    llmValidateApiKey: String(input.llmValidateApiKey || '').trim(),
    llmWriteProvider: String(input.llmWriteProvider || '').trim(),
    llmWriteBaseUrl: String(input.llmWriteBaseUrl || '').trim(),
    llmWriteApiKey: String(input.llmWriteApiKey || '').trim(),
    importsRoot: String(input.importsRoot || '').trim(),
    resumeMode: input.resumeMode,
    scannedPdfOcrBackend: input.scannedPdfOcrBackend,
    fetchBudgetMs: parseRuntimeInt(
      input.fetchBudgetMs,
      runtimeSettingsFallbackBaseline.fetchBudgetMs,
    ),
    fetchConcurrency: parseRuntimeInt(
      input.fetchConcurrency,
      runtimeSettingsFallbackBaseline.fetchConcurrency,
    ),
    perHostMinDelayMs: parseRuntimeInt(
      input.perHostMinDelayMs,
      runtimeSettingsFallbackBaseline.perHostMinDelayMs,
    ),
    searxngMinQueryIntervalMs: parseRuntimeInt(
      input.searxngMinQueryIntervalMs,
      runtimeSettingsFallbackBaseline.searxngMinQueryIntervalMs,
    ),
    domainRequestRps: parseRuntimeInt(
      input.domainRequestRps,
      runtimeSettingsFallbackBaseline.domainRequestRps,
    ),
    domainRequestBurst: parseRuntimeInt(
      input.domainRequestBurst,
      runtimeSettingsFallbackBaseline.domainRequestBurst,
    ),
    globalRequestRps: parseRuntimeInt(
      input.globalRequestRps,
      runtimeSettingsFallbackBaseline.globalRequestRps,
    ),
    globalRequestBurst: parseRuntimeInt(
      input.globalRequestBurst,
      runtimeSettingsFallbackBaseline.globalRequestBurst,
    ),
    fetchPerHostConcurrencyCap: parseRuntimeInt(
      input.fetchPerHostConcurrencyCap,
      runtimeSettingsFallbackBaseline.fetchPerHostConcurrencyCap,
    ),
    llmMaxOutputTokensPlan: clampTokenForModel(
      input.llmModelPlan,
      input.llmMaxOutputTokensPlan,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensTriage: clampTokenForModel(
      input.llmModelTriage,
      input.llmMaxOutputTokensTriage,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensFast: clampTokenForModel(
      input.llmModelFast,
      input.llmMaxOutputTokensFast,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensReasoning: clampTokenForModel(
      input.llmModelReasoning,
      input.llmMaxOutputTokensReasoning,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensExtract: clampTokenForModel(
      input.llmModelExtract,
      input.llmMaxOutputTokensExtract,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensValidate: clampTokenForModel(
      input.llmModelValidate,
      input.llmMaxOutputTokensValidate,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensWrite: clampTokenForModel(
      input.llmModelWrite,
      input.llmMaxOutputTokensWrite,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensPlanFallback: clampTokenForModel(
      input.llmModelPlan,
      input.llmMaxOutputTokensPlanFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensReasoningFallback: clampTokenForModel(
      input.llmModelReasoning,
      input.llmMaxOutputTokensReasoningFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensExtractFallback: clampTokenForModel(
      input.llmModelExtract,
      input.llmMaxOutputTokensExtractFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensValidateFallback: clampTokenForModel(
      input.llmModelValidate,
      input.llmMaxOutputTokensValidateFallback,
      resolveModelTokenDefaults,
    ),
    llmMaxOutputTokensWriteFallback: clampTokenForModel(
      input.llmModelWrite,
      input.llmMaxOutputTokensWriteFallback,
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
    discoveryMaxDiscovered: parseRuntimeInt(
      input.discoveryMaxDiscovered,
      runtimeSettingsFallbackBaseline.discoveryMaxDiscovered,
    ),
    maxUrlsPerProduct: parseRuntimeInt(
      input.maxUrlsPerProduct,
      runtimeSettingsFallbackBaseline.maxUrlsPerProduct,
    ),
    maxCandidateUrls: parseRuntimeInt(
      input.maxCandidateUrls,
      runtimeSettingsFallbackBaseline.maxCandidateUrls,
    ),
    serpTriageMaxUrls: parseRuntimeInt(
      input.serpTriageMaxUrls,
      runtimeSettingsFallbackBaseline.serpTriageMaxUrls,
    ),
    maxPagesPerDomain: parseRuntimeInt(
      input.maxPagesPerDomain,
      runtimeSettingsFallbackBaseline.maxPagesPerDomain,
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
    domSnippetMaxChars: parseRuntimeInt(
      input.domSnippetMaxChars,
      runtimeSettingsFallbackBaseline.domSnippetMaxChars,
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
    importsPollSeconds: parseRuntimeInt(
      input.importsPollSeconds,
      runtimeSettingsFallbackBaseline.importsPollSeconds,
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
    runtimeControlFile: String(input.runtimeControlFile || '').trim(),
    staticDomMode: String(input.staticDomMode || '').trim(),
    specDbDir: String(input.specDbDir || '').trim(),
    articleExtractorDomainPolicyMapJson: String(input.articleExtractorDomainPolicyMapJson || '').trim(),
    llmExtractionCacheDir: String(input.llmExtractionCacheDir || '').trim(),
    cortexBaseUrl: String(input.cortexBaseUrl || '').trim(),
    cortexApiKey: String(input.cortexApiKey || '').trim(),
    cortexAsyncBaseUrl: String(input.cortexAsyncBaseUrl || '').trim(),
    cortexAsyncSubmitPath: String(input.cortexAsyncSubmitPath || '').trim(),
    cortexAsyncStatusPath: String(input.cortexAsyncStatusPath || '').trim(),
    cortexModelFast: String(input.cortexModelFast || '').trim(),
    cortexModelDom: String(input.cortexModelDom || '').trim(),
    cortexModelReasoningDeep: String(input.cortexModelReasoningDeep || '').trim(),
    cortexModelVision: String(input.cortexModelVision || '').trim(),
    cortexModelSearchFast: String(input.cortexModelSearchFast || '').trim(),
    cortexModelRerankFast: String(input.cortexModelRerankFast || '').trim(),
    categoryAuthorityRoot: String(input.categoryAuthorityRoot || '').trim(),
    batchStrategy: String(input.batchStrategy || '').trim(),
    frontierDbPath: String(input.frontierDbPath || '').trim(),
    dynamicFetchPolicyMapJson: String(input.dynamicFetchPolicyMapJson || '').trim(),
    searchProfileCapMapJson: String(input.searchProfileCapMapJson || '').trim(),
    serpRerankerWeightMapJson: String(input.serpRerankerWeightMapJson || '').trim(),
    llmProviderRegistryJson: String(input.llmProviderRegistryJson || '').trim(),
    llmPhaseOverridesJson: String(input.llmPhaseOverridesJson || '').trim(),
    fetchSchedulerInternalsMapJson: parseRuntimeString(input.fetchSchedulerInternalsMapJson),
    parsingConfidenceBaseMapJson: parseRuntimeString(input.parsingConfidenceBaseMapJson),
    repairDedupeRule: String(input.repairDedupeRule || '').trim(),
    discoveryEnabled: input.discoveryEnabled,
    llmExtractionCacheEnabled: input.llmExtractionCacheEnabled,
    llmExtractSkipLowSignal: input.llmExtractSkipLowSignal,
    llmReasoningMode: input.llmReasoningMode,
    llmPlanUseReasoning: input.llmPlanUseReasoning,
    llmTriageUseReasoning: input.llmTriageUseReasoning,
    llmDisableBudgetGuards: input.llmDisableBudgetGuards,
    llmVerifyMode: input.llmVerifyMode,
    localMode: input.localMode,
    dryRun: input.dryRun,
    mirrorToS3: input.mirrorToS3,
    mirrorToS3Input: input.mirrorToS3Input,
    writeMarkdownSummary: input.writeMarkdownSummary,
    llmWriteSummary: input.llmWriteSummary,
    reextractIndexed: input.reextractIndexed,
    fetchCandidateSources: input.fetchCandidateSources,
    manufacturerAutoPromote: input.manufacturerAutoPromote ?? true,
    pdfBackendRouterEnabled: input.pdfBackendRouterEnabled,
    capturePageScreenshotEnabled: input.capturePageScreenshotEnabled,
    articleExtractorV2Enabled: input.articleExtractorV2Enabled,
    staticDomExtractorEnabled: input.staticDomExtractorEnabled,
    htmlTableExtractorV2: input.htmlTableExtractorV2,
    categoryAuthorityEnabled: input.categoryAuthorityEnabled,
    helperFilesRoot: String(input.helperFilesRoot || 'category_authority').trim(),
    helperSupportiveFillMissing: input.helperSupportiveFillMissing,
    driftDetectionEnabled: input.driftDetectionEnabled,
    driftAutoRepublish: input.driftAutoRepublish,
    cortexEnabled: input.cortexEnabled,
    cortexAsyncEnabled: input.cortexAsyncEnabled,
    cortexAutoStart: input.cortexAutoStart,
    cortexEscalateIfConflict: input.cortexEscalateIfConflict,
    cortexEscalateCriticalOnly: input.cortexEscalateCriticalOnly,
    indexingCategoryAuthorityEnabled: input.indexingCategoryAuthorityEnabled,
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
    intelJsonWrite: input.intelJsonWrite,
    corpusJsonWrite: input.corpusJsonWrite,
    learningJsonWrite: input.learningJsonWrite,
    cacheJsonWrite: input.cacheJsonWrite,
    authoritySnapshotEnabled: input.authoritySnapshotEnabled,
    selfImproveEnabled: input.selfImproveEnabled,
  };
}
