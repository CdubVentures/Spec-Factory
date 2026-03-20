import type {
  RuntimeOcrBackend,
  RuntimeRepairDedupeRule,
  RuntimeResumeMode,
} from '../../../stores/settingsManifest';
import type { RuntimeSettings } from './runtimeSettingsAuthority';
import type {
  RuntimeHydrationBindingSetters,
  RuntimeHydrationBindings,
} from './runtimeSettingsDomainTypes';

function hasSnapshotData(
  source: RuntimeSettings | Record<string, unknown> | undefined,
): source is Record<string, unknown> {
  return Boolean(source) && typeof source === 'object' && !Array.isArray(source);
}

export function createRuntimeHydrationBindings(
  setters: RuntimeHydrationBindingSetters,
): RuntimeHydrationBindings {
  return {
    stringBindings: [
      {
        key: 'searchEngines',
        allowEmpty: true,
        apply: setters.setSearchEngines,
      },
      {
        key: 'searchProvider',
        allowEmpty: true,
        apply: setters.setSearchEngines,
      },
      {
        key: 'searchEnginesFallback',
        allowEmpty: true,
        apply: setters.setSearchEnginesFallback,
      },
      {
        key: 'googleSearchProxyUrlsJson',
        allowEmpty: true,
        apply: setters.setGoogleSearchProxyUrlsJson,
      },
      {
        key: 'serperApiKey',
        allowEmpty: true,
        apply: setters.setSerperApiKey,
      },
      {
        key: 'searxngBaseUrl',
        allowEmpty: true,
        apply: setters.setSearxngBaseUrl,
      },
      {
        key: 'llmPlanApiKey',
        allowEmpty: true,
        apply: setters.setLlmPlanApiKey,
      },
      { key: 'llmModelPlan', apply: setters.setLlmModelPlan },
      { key: 'phase2LlmModel', apply: setters.setLlmModelPlan },
      { key: 'llmModelReasoning', apply: setters.setLlmModelReasoning },
      { key: 'llmPlanFallbackModel', allowEmpty: true, apply: setters.setLlmPlanFallbackModel },
      { key: 'llmReasoningFallbackModel', allowEmpty: true, apply: setters.setLlmReasoningFallbackModel },
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
        key: 'geminiApiKey',
        allowEmpty: true,
        apply: setters.setGeminiApiKey,
      },
      {
        key: 'deepseekApiKey',
        allowEmpty: true,
        apply: setters.setDeepseekApiKey,
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
        key: 'llmProviderRegistryJson',
        allowEmpty: true,
        apply: (value) => setters.setLlmProviderRegistryJson?.(value),
      },
      {
        key: 'llmPhaseOverridesJson',
        allowEmpty: true,
        apply: (value) => setters.setLlmPhaseOverridesJson?.(value),
      },
      {
        key: 'fetchSchedulerInternalsMapJson',
        allowEmpty: true,
        apply: (value) => setters.setFetchSchedulerInternalsMapJson?.(value),
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
        key: 'llmExtractionCacheDir',
        allowEmpty: true,
        apply: setters.setLlmExtractionCacheDir,
      },
      {
        key: 'categoryAuthorityRoot',
        allowEmpty: true,
        apply: setters.setHelperFilesRoot,
      },
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
      { key: 'fetchBudgetMs', apply: (value) => setters.setFetchBudgetMs?.(String(value)) },
      { key: 'fetchConcurrency', apply: (value) => setters.setFetchConcurrency(String(value)) },
      { key: 'perHostMinDelayMs', apply: (value) => setters.setPerHostMinDelayMs(String(value)) },
      { key: 'searxngMinQueryIntervalMs', apply: (value) => setters.setSearxngMinQueryIntervalMs(String(value)) },
      { key: 'googleSearchTimeoutMs', apply: (value) => setters.setGoogleSearchTimeoutMs(String(value)) },
      { key: 'googleSearchMinQueryIntervalMs', apply: (value) => setters.setGoogleSearchMinQueryIntervalMs(String(value)) },
      { key: 'googleSearchMaxRetries', apply: (value) => setters.setGoogleSearchMaxRetries(String(value)) },
      { key: 'serperResultCount', apply: (value) => setters.setSerperResultCount(String(value)) },
      { key: 'searchMaxRetries', apply: (value) => setters.setSearchMaxRetries(String(value)) },
      { key: 'domainRequestRps', apply: (value) => setters.setDomainRequestRps(String(value)) },
      { key: 'domainRequestBurst', apply: (value) => setters.setDomainRequestBurst(String(value)) },
      { key: 'globalRequestRps', apply: (value) => setters.setGlobalRequestRps(String(value)) },
      { key: 'globalRequestBurst', apply: (value) => setters.setGlobalRequestBurst(String(value)) },
      { key: 'fetchPerHostConcurrencyCap', apply: (value) => setters.setFetchPerHostConcurrencyCap(String(value)) },
      { key: 'llmMaxOutputTokensPlan', apply: setters.setLlmMaxOutputTokensPlan },
      { key: 'llmTokensPlan', apply: setters.setLlmMaxOutputTokensPlan },
      { key: 'llmMaxOutputTokensReasoning', apply: setters.setLlmMaxOutputTokensReasoning },
      { key: 'llmTokensReasoning', apply: setters.setLlmMaxOutputTokensReasoning },
      { key: 'llmMaxOutputTokensPlanFallback', apply: setters.setLlmMaxOutputTokensPlanFallback },
      { key: 'llmTokensPlanFallback', apply: setters.setLlmMaxOutputTokensPlanFallback },
      { key: 'llmMaxOutputTokensReasoningFallback', apply: setters.setLlmMaxOutputTokensReasoningFallback },
      { key: 'llmTokensReasoningFallback', apply: setters.setLlmMaxOutputTokensReasoningFallback },
      { key: 'llmExtractMaxSnippetsPerBatch', apply: (value) => setters.setLlmExtractMaxSnippetsPerBatch(String(value)) },
      { key: 'llmExtractMaxSnippetChars', apply: (value) => setters.setLlmExtractMaxSnippetChars(String(value)) },
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
      { key: 'discoveryMaxDiscovered', apply: (value) => setters.setDiscoveryMaxDiscovered(String(value)) },
      { key: 'maxUrlsPerProduct', apply: (value) => setters.setMaxUrlsPerProduct(String(value)) },
      { key: 'maxCandidateUrls', apply: (value) => setters.setMaxCandidateUrls(String(value)) },
      { key: 'maxPagesPerDomain', apply: (value) => setters.setMaxPagesPerDomain(String(value)) },
      { key: 'maxRunSeconds', apply: (value) => setters.setMaxRunSeconds(String(value)) },
      { key: 'maxJsonBytes', apply: (value) => setters.setMaxJsonBytes(String(value)) },
      { key: 'maxPdfBytes', apply: (value) => setters.setMaxPdfBytes(String(value)) },
      { key: 'pdfBackendRouterTimeoutMs', apply: (value) => setters.setPdfBackendRouterTimeoutMs(String(value)) },
      { key: 'pdfBackendRouterMaxPages', apply: (value) => setters.setPdfBackendRouterMaxPages(String(value)) },
      { key: 'pdfBackendRouterMaxPairs', apply: (value) => setters.setPdfBackendRouterMaxPairs(String(value)) },
      { key: 'pdfBackendRouterMaxTextPreviewChars', apply: (value) => setters.setPdfBackendRouterMaxTextPreviewChars(String(value)) },
      { key: 'capturePageScreenshotQuality', apply: (value) => setters.setCapturePageScreenshotQuality(String(value)) },
      { key: 'capturePageScreenshotMaxBytes', apply: (value) => setters.setCapturePageScreenshotMaxBytes(String(value)) },
      { key: 'articleExtractorMinChars', apply: (value) => setters.setArticleExtractorMinChars(String(value)) },
      { key: 'articleExtractorMinScore', apply: (value) => setters.setArticleExtractorMinScore(String(value)) },
      { key: 'articleExtractorMaxChars', apply: (value) => setters.setArticleExtractorMaxChars(String(value)) },
      { key: 'staticDomTargetMatchThreshold', apply: (value) => setters.setStaticDomTargetMatchThreshold(String(value)) },
      { key: 'staticDomMaxEvidenceSnippets', apply: (value) => setters.setStaticDomMaxEvidenceSnippets(String(value)) },
      { key: 'domSnippetMaxChars', apply: (value) => setters.setDomSnippetMaxChars(String(value)) },
      { key: 'maxHypothesisItems', apply: (value) => setters.setMaxHypothesisItems(String(value)) },
      { key: 'hypothesisAutoFollowupRounds', apply: (value) => setters.setHypothesisAutoFollowupRounds(String(value)) },
      { key: 'hypothesisFollowupUrlsPerRound', apply: (value) => setters.setHypothesisFollowupUrlsPerRound(String(value)) },
      { key: 'runtimeScreencastFps', apply: (value) => setters.setRuntimeScreencastFps(String(value)) },
      { key: 'runtimeScreencastQuality', apply: (value) => setters.setRuntimeScreencastQuality(String(value)) },
      { key: 'runtimeScreencastMaxWidth', apply: (value) => setters.setRuntimeScreencastMaxWidth(String(value)) },
      { key: 'runtimeScreencastMaxHeight', apply: (value) => setters.setRuntimeScreencastMaxHeight(String(value)) },
      { key: 'runtimeTraceFetchRing', apply: (value) => setters.setRuntimeTraceFetchRing(String(value)) },
      { key: 'runtimeTraceLlmRing', apply: (value) => setters.setRuntimeTraceLlmRing(String(value)) },
      { key: 'daemonConcurrency', apply: (value) => setters.setDaemonConcurrency(String(value)) },
      { key: 'importsPollSeconds', apply: (value) => setters.setImportsPollSeconds(String(value)) },
      { key: 'indexingResumeSeedLimit', apply: (value) => setters.setIndexingResumeSeedLimit(String(value)) },
      { key: 'indexingResumePersistLimit', apply: (value) => setters.setIndexingResumePersistLimit(String(value)) },
      { key: 'fieldRewardHalfLifeDays', apply: (value) => setters.setFieldRewardHalfLifeDays(String(value)) },
      { key: 'driftPollSeconds', apply: (value) => setters.setDriftPollSeconds(String(value)) },
      { key: 'driftScanMaxProducts', apply: (value) => setters.setDriftScanMaxProducts(String(value)) },
      { key: 'reCrawlStaleAfterDays', apply: (value) => setters.setReCrawlStaleAfterDays(String(value)) },
    ],
    booleanBindings: [
      { key: 'discoveryEnabled', apply: setters.setDiscoveryEnabled },
      { key: 'reextractIndexed', apply: setters.setReextractIndexed },
      { key: 'fetchCandidateSources', apply: setters.setFetchCandidateSources },
      { key: 'manufacturerAutoPromote', apply: (value) => setters.setManufacturerAutoPromote?.(value) },
      { key: 'pdfBackendRouterEnabled', apply: setters.setPdfBackendRouterEnabled },
      { key: 'capturePageScreenshotEnabled', apply: setters.setCapturePageScreenshotEnabled },
      { key: 'categoryAuthorityEnabled', apply: setters.setCategoryAuthorityEnabled },
      { key: 'indexingCategoryAuthorityEnabled', apply: setters.setIndexingCategoryAuthorityEnabled },
      { key: 'helperSupportiveFillMissing', apply: setters.setHelperSupportiveFillMissing },
      { key: 'driftDetectionEnabled', apply: setters.setDriftDetectionEnabled },
      { key: 'driftAutoRepublish', apply: setters.setDriftAutoRepublish },
      { key: 'scannedPdfOcrEnabled', apply: setters.setScannedPdfOcrEnabled },
      { key: 'dynamicCrawleeEnabled', apply: setters.setDynamicCrawleeEnabled },
      { key: 'crawleeHeadless', apply: setters.setCrawleeHeadless },
      { key: 'googleSearchScreenshotsEnabled', apply: setters.setGoogleSearchScreenshotsEnabled },
      { key: 'llmExtractSkipLowSignal', apply: setters.setLlmExtractSkipLowSignal },
      { key: 'llmReasoningMode', apply: setters.setLlmReasoningMode },
      { key: 'llmPlanUseReasoning', apply: setters.setLlmPlanUseReasoning },
      { key: 'llmVerifyMode', apply: setters.setLlmVerifyMode },
      { key: 'localMode', apply: setters.setLocalMode },
      { key: 'dryRun', apply: setters.setDryRun },
      { key: 'mirrorToS3', apply: setters.setMirrorToS3 },
      { key: 'mirrorToS3Input', apply: setters.setMirrorToS3Input },
      { key: 'writeMarkdownSummary', apply: setters.setWriteMarkdownSummary },
      { key: 'llmWriteSummary', apply: setters.setLlmWriteSummary },
      { key: 'preferHttpFetcher', apply: setters.setPreferHttpFetcher },
      { key: 'frontierStripTrackingParams', apply: setters.setFrontierStripTrackingParams },
      { key: 'autoScrollEnabled', apply: setters.setAutoScrollEnabled },
      { key: 'graphqlReplayEnabled', apply: setters.setGraphqlReplayEnabled },
      { key: 'robotsTxtCompliant', apply: setters.setRobotsTxtCompliant },
      { key: 'runtimeScreencastEnabled', apply: setters.setRuntimeScreencastEnabled },
      { key: 'runtimeTraceEnabled', apply: setters.setRuntimeTraceEnabled },
      { key: 'runtimeTraceLlmPayloads', apply: setters.setRuntimeTraceLlmPayloads },
      { key: 'eventsJsonWrite', apply: setters.setEventsJsonWrite },
      { key: 'indexingSchemaPacketsValidationEnabled', apply: setters.setIndexingSchemaPacketsValidationEnabled },
      { key: 'indexingSchemaPacketsValidationStrict', apply: setters.setIndexingSchemaPacketsValidationStrict },
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
