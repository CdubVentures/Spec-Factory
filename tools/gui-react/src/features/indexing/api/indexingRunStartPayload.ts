import { buildIndexingRunDiscoveryPayload } from './indexingRunDiscoveryPayload';
import { buildIndexingRunLearningPayload } from './indexingRunLearningPayload';
import { buildIndexingRunLlmSettingsPayload } from './indexingRunLlmSettingsPayload';
import { buildIndexingRunModelPayload } from './indexingRunModelPayload';
import { buildIndexingRunOcrPolicyPayload } from './indexingRunOcrPolicyPayload';
import { buildIndexingRunRuntimePayload } from './indexingRunRuntimePayload';
import { LLM_SETTING_LIMITS } from '../../../stores/settingsManifest';
import { deriveIndexingRunStartParsedValues } from './indexingRunStartParsedValues';
import type { RuntimeSettings } from '../../pipeline-settings';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;
const LLM_EXTRACT_MIN_SNIPPET_CHARS = 128;

type StartIndexingRunPayloadValue = string | number | boolean | Record<string, unknown>;
type StartIndexingRunPayloadRecord = Record<string, StartIndexingRunPayloadValue>;

interface StartIndexingRunPayloadParsedValues extends ReturnType<typeof deriveIndexingRunStartParsedValues> {}

interface BuildIndexingRunStartPayloadInput {
  requestedRunId: string;
  category: string;
  productId: string;
  runtimeSettingsPayload: RuntimeSettings;
  parsedValues: StartIndexingRunPayloadParsedValues;
  runControlPayload: StartIndexingRunPayloadRecord;
  llmPolicy?: Record<string, unknown>;
}

const readString = (value: StartIndexingRunPayloadValue | undefined): string => (
  String(value || '').trim()
);

const readBool = (value: StartIndexingRunPayloadValue | undefined): boolean => (
  Boolean(value)
);

// WHY: Extract all serializable values from RuntimeSettings for the POST body.
// This ensures ALL settings keys flow through to the backend snapshot,
// not just the ones that the hand-picked payload builder lists explicitly.
function spreadRuntimeSettings(settings: RuntimeSettings): StartIndexingRunPayloadRecord {
  const result: StartIndexingRunPayloadRecord = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'object') {
      result[key] = value as Record<string, unknown>;
    }
  }
  return result;
}

export function buildIndexingRunStartPayload(
  input: BuildIndexingRunStartPayloadInput,
): StartIndexingRunPayloadRecord {
  const {
    requestedRunId,
    category,
    productId,
    runtimeSettingsPayload,
    parsedValues,
    runControlPayload,
    llmPolicy,
  } = input;
  const s = runtimeSettingsPayload;
  const p = parsedValues;

  // WHY: Spread the full runtimeSettingsPayload first so ALL settings keys
  // (including the 17 that were previously dropped: deepseekApiKey, fetchBudgetMs,
  // geminiApiKey, googleSearch*, helperFilesRoot, llmPhaseOverridesJson,
  // llmPlanUseReasoning, llmProviderRegistryJson, manufacturerAutoPromote,
  // searxngMinQueryIntervalMs) flow through to the POST body → backend snapshot.
  // Hand-picked fields below overlay on top with priority because they include
  // min/max enforcement and parsed numeric values from deriveIndexingRunStartParsedValues.
  const runtimePayload: StartIndexingRunPayloadRecord = {
    ...spreadRuntimeSettings(runtimeSettingsPayload),
    requestedRunId: String(requestedRunId || '').trim(),
    category,
    mode: 'indexlab',
    replaceRunning: true,
    productId,
    profile: 'standard',
    fetchConcurrency: p.parsedConcurrency,
    perHostMinDelayMs: p.parsedPerHostMinDelayMs,
    domainRequestRps: Math.max(0, p.parsedDomainRequestRps),
    domainRequestBurst: Math.max(0, p.parsedDomainRequestBurst),
    globalRequestRps: Math.max(0, p.parsedGlobalRequestRps),
    globalRequestBurst: Math.max(0, p.parsedGlobalRequestBurst),
    fetchPerHostConcurrencyCap: Math.max(1, p.parsedFetchPerHostConcurrencyCap),
    dynamicCrawleeEnabled: readBool(s.dynamicCrawleeEnabled),
    crawleeHeadless: readBool(s.crawleeHeadless),
    crawleeRequestHandlerTimeoutSecs: Math.max(0, p.parsedCrawleeTimeout),
    dynamicFetchRetryBudget: Math.max(0, p.parsedRetryBudget),
    dynamicFetchRetryBackoffMs: Math.max(0, p.parsedRetryBackoff),
    fetchSchedulerMaxRetries: Math.max(0, p.parsedFetchSchedulerMaxRetries),
    preferHttpFetcher: readBool(s.preferHttpFetcher),
    pageGotoTimeoutMs: Math.max(0, p.parsedPageGotoTimeoutMs),
    pageNetworkIdleTimeoutMs: Math.max(0, p.parsedPageNetworkIdleTimeoutMs),
    postLoadWaitMs: Math.max(0, p.parsedPostLoadWaitMs),
    frontierDbPath: readString(s.frontierDbPath),
    frontierStripTrackingParams: readBool(s.frontierStripTrackingParams),
    frontierQueryCooldownSeconds: Math.max(0, p.parsedFrontierQueryCooldownSeconds),
    frontierCooldown404Seconds: Math.max(0, p.parsedFrontierCooldown404Seconds),
    frontierCooldown404RepeatSeconds: Math.max(0, p.parsedFrontierCooldown404RepeatSeconds),
    frontierCooldown410Seconds: Math.max(0, p.parsedFrontierCooldown410Seconds),
    frontierCooldownTimeoutSeconds: Math.max(0, p.parsedFrontierCooldownTimeoutSeconds),
    frontierCooldown403BaseSeconds: Math.max(0, p.parsedFrontierCooldown403BaseSeconds),
    frontierCooldown429BaseSeconds: Math.max(0, p.parsedFrontierCooldown429BaseSeconds),
    frontierBackoffMaxExponent: Math.max(1, p.parsedFrontierBackoffMaxExponent),
    frontierPathPenaltyNotfoundThreshold: Math.max(1, p.parsedFrontierPathPenaltyNotfoundThreshold),
    frontierBlockedDomainThreshold: Math.max(1, p.parsedFrontierBlockedDomainThreshold),
    autoScrollEnabled: readBool(s.autoScrollEnabled),
    autoScrollPasses: Math.max(0, p.parsedAutoScrollPasses),
    autoScrollDelayMs: Math.max(0, p.parsedAutoScrollDelayMs),
    graphqlReplayEnabled: readBool(s.graphqlReplayEnabled),
    maxGraphqlReplays: Math.max(0, p.parsedMaxGraphqlReplays),
    maxNetworkResponsesPerPage: Math.max(100, p.parsedMaxNetworkResponsesPerPage),
    robotsTxtCompliant: readBool(s.robotsTxtCompliant),
    robotsTxtTimeoutMs: Math.max(100, p.parsedRobotsTxtTimeoutMs),
    ...buildIndexingRunRuntimePayload({
      runtimeScreencastEnabled: readBool(s.runtimeScreencastEnabled),
      parsedRuntimeScreencastFps: p.parsedRuntimeScreencastFps,
      parsedRuntimeScreencastQuality: p.parsedRuntimeScreencastQuality,
      parsedRuntimeScreencastMaxWidth: p.parsedRuntimeScreencastMaxWidth,
      parsedRuntimeScreencastMaxHeight: p.parsedRuntimeScreencastMaxHeight,
      runtimeTraceEnabled: readBool(s.runtimeTraceEnabled),
      parsedRuntimeTraceFetchRing: p.parsedRuntimeTraceFetchRing,
      parsedRuntimeTraceLlmRing: p.parsedRuntimeTraceLlmRing,
      runtimeTraceLlmPayloads: readBool(s.runtimeTraceLlmPayloads),
      parsedDaemonConcurrency: p.parsedDaemonConcurrency,
      parsedDaemonGracefulShutdownTimeoutMs: p.parsedDaemonGracefulShutdownTimeoutMs,
      importsRoot: readString(s.importsRoot),
      parsedImportsPollSeconds: p.parsedImportsPollSeconds,
      parsedIndexingResumeSeedLimit: p.parsedIndexingResumeSeedLimit,
      parsedIndexingResumePersistLimit: p.parsedIndexingResumePersistLimit,
      eventsJsonWrite: readBool(s.eventsJsonWrite),
      indexingSchemaPacketsValidationEnabled: readBool(s.indexingSchemaPacketsValidationEnabled),
      indexingSchemaPacketsValidationStrict: readBool(s.indexingSchemaPacketsValidationStrict),
    }),
    ...buildIndexingRunOcrPolicyPayload({
      scannedPdfOcrEnabled: readBool(s.scannedPdfOcrEnabled),
      scannedPdfOcrBackend: readString(s.scannedPdfOcrBackend),
      parsedScannedPdfOcrMaxPages: p.parsedScannedPdfOcrMaxPages,
      parsedScannedPdfOcrMaxPairs: p.parsedScannedPdfOcrMaxPairs,
      parsedScannedPdfOcrMinChars: p.parsedScannedPdfOcrMinChars,
      parsedScannedPdfOcrMinLines: p.parsedScannedPdfOcrMinLines,
      parsedScannedPdfOcrMinConfidence: p.parsedScannedPdfOcrMinConfidence,
      dynamicFetchPolicyMapJson: readString(s.dynamicFetchPolicyMapJson),
      searchProfileCapMapJson: readString(s.searchProfileCapMapJson),
      serpRerankerWeightMapJson: readString(s.serpRerankerWeightMapJson),
      fetchSchedulerInternalsMapJson: readString(s.fetchSchedulerInternalsMapJson),
      parsingConfidenceBaseMapJson: readString(s.parsingConfidenceBaseMapJson),
      repairDedupeRule: readString(s.repairDedupeRule),
    }),
    ...buildIndexingRunDiscoveryPayload({
      fetchCandidateSources: readBool(s.fetchCandidateSources),
      parsedDiscoveryMaxQueries: p.parsedDiscoveryMaxQueries,
      parsedDiscoveryMaxDiscovered: p.parsedDiscoveryMaxDiscovered,
      parsedMaxUrlsPerProduct: p.parsedMaxUrlsPerProduct,
      parsedMaxCandidateUrls: p.parsedMaxCandidateUrls,
      parsedMaxPagesPerDomain: p.parsedMaxPagesPerDomain,
      parsedMaxRunSeconds: p.parsedMaxRunSeconds,
      parsedMaxJsonBytes: p.parsedMaxJsonBytes,
      parsedMaxPdfBytes: p.parsedMaxPdfBytes,
    }),
    pdfBackendRouterEnabled: readBool(s.pdfBackendRouterEnabled),
    pdfPreferredBackend: readString(s.pdfPreferredBackend),
    pdfBackendRouterTimeoutMs: Math.max(1000, p.parsedPdfBackendRouterTimeoutMs),
    pdfBackendRouterMaxPages: Math.max(1, p.parsedPdfBackendRouterMaxPages),
    pdfBackendRouterMaxPairs: Math.max(1, p.parsedPdfBackendRouterMaxPairs),
    pdfBackendRouterMaxTextPreviewChars: Math.max(256, p.parsedPdfBackendRouterMaxTextPreviewChars),
    capturePageScreenshotEnabled: readBool(s.capturePageScreenshotEnabled),
    capturePageScreenshotFormat: readString(s.capturePageScreenshotFormat),
    capturePageScreenshotQuality: Math.max(1, p.parsedCapturePageScreenshotQuality),
    capturePageScreenshotMaxBytes: Math.max(1024, p.parsedCapturePageScreenshotMaxBytes),
    capturePageScreenshotSelectors: readString(s.capturePageScreenshotSelectors),
    articleExtractorMinChars: Math.max(50, p.parsedArticleExtractorMinChars),
    articleExtractorMinScore: Math.max(1, p.parsedArticleExtractorMinScore),
    articleExtractorMaxChars: Math.max(256, p.parsedArticleExtractorMaxChars),
    staticDomMode: readString(s.staticDomMode),
    staticDomTargetMatchThreshold: Math.max(0, Math.min(1, p.parsedStaticDomTargetMatchThreshold)),
    staticDomMaxEvidenceSnippets: Math.max(10, p.parsedStaticDomMaxEvidenceSnippets),
    articleExtractorDomainPolicyMapJson: readString(s.articleExtractorDomainPolicyMapJson),
    domSnippetMaxChars: Math.max(600, p.parsedDomSnippetMaxChars),
    runtimeControlFile: readString(s.runtimeControlFile),
    specDbDir: readString(s.specDbDir),
    categoryAuthorityEnabled: readBool(s.categoryAuthorityEnabled),
    categoryAuthorityRoot: readString(s.categoryAuthorityRoot),
    helperSupportiveFillMissing: readBool(s.helperSupportiveFillMissing),
    fieldRewardHalfLifeDays: Math.max(1, p.parsedFieldRewardHalfLifeDays),
    batchStrategy: readString(s.batchStrategy),
    driftDetectionEnabled: readBool(s.driftDetectionEnabled),
    driftPollSeconds: Math.max(60, p.parsedDriftPollSeconds),
    driftScanMaxProducts: Math.max(1, p.parsedDriftScanMaxProducts),
    driftAutoRepublish: readBool(s.driftAutoRepublish),
    reCrawlStaleAfterDays: Math.max(1, p.parsedReCrawlStaleAfterDays),
    outputMode: readString(s.outputMode),
    localMode: readBool(s.localMode),
    dryRun: readBool(s.dryRun),
    mirrorToS3: readBool(s.mirrorToS3),
    mirrorToS3Input: readBool(s.mirrorToS3Input),
    localInputRoot: readString(s.localInputRoot),
    localOutputRoot: readString(s.localOutputRoot),
    runtimeEventsKey: readString(s.runtimeEventsKey),
    writeMarkdownSummary: readBool(s.writeMarkdownSummary),
    awsRegion: readString(s.awsRegion),
    s3Bucket: readString(s.s3Bucket),
    s3InputPrefix: readString(s.s3InputPrefix),
    s3OutputPrefix: readString(s.s3OutputPrefix),
    eloSupabaseAnonKey: readString(s.eloSupabaseAnonKey),
    eloSupabaseEndpoint: readString(s.eloSupabaseEndpoint),
    ...buildIndexingRunLearningPayload({
      llmWriteSummary: readBool(s.llmWriteSummary),
      llmProvider: readString(s.llmProvider),
      llmBaseUrl: readString(s.llmBaseUrl),
      openaiApiKey: readString(s.openaiApiKey),
      anthropicApiKey: readString(s.anthropicApiKey),
      indexingCategoryAuthorityEnabled: readBool(s.indexingCategoryAuthorityEnabled),
      userAgent: readString(s.userAgent),
      selfImproveEnabled: readBool(s.selfImproveEnabled),
      parsedMaxHypothesisItems: p.parsedMaxHypothesisItems,
      parsedHypothesisAutoFollowupRounds: p.parsedHypothesisAutoFollowupRounds,
      parsedHypothesisFollowupUrlsPerRound: p.parsedHypothesisFollowupUrlsPerRound,
      searxngBaseUrl: readString(s.searxngBaseUrl),
      llmPlanProvider: readString(s.llmPlanProvider),
      llmPlanBaseUrl: readString(s.llmPlanBaseUrl),
      llmPlanApiKey: readString(s.llmPlanApiKey),
      llmExtractionCacheDir: readString(s.llmExtractionCacheDir),
      parsedLlmExtractionCacheTtlMs: p.parsedLlmExtractionCacheTtlMs,
      parsedLlmMaxCallsPerProductTotal: p.parsedLlmMaxCallsPerProductTotal,
      parsedLlmExtractMaxSnippetsPerBatch: p.parsedLlmExtractMaxSnippetsPerBatch,
      parsedLlmExtractMaxSnippetChars: p.parsedLlmExtractMaxSnippetChars,
      llmExtractMinSnippetChars: LLM_EXTRACT_MIN_SNIPPET_CHARS,
      llmExtractSkipLowSignal: readBool(s.llmExtractSkipLowSignal),
      llmReasoningMode: readString(s.llmReasoningMode),
      parsedLlmReasoningBudget: p.parsedLlmReasoningBudget,
      parsedLlmMonthlyBudgetUsd: p.parsedLlmMonthlyBudgetUsd,
      parsedLlmPerProductBudgetUsd: p.parsedLlmPerProductBudgetUsd,
    }),
    ...buildIndexingRunLlmSettingsPayload({
      parsedLlmMaxCallsPerRound: p.parsedLlmMaxCallsPerRound,
      parsedLlmMaxOutputTokens: p.parsedLlmMaxOutputTokens,
      llmMinOutputTokens: LLM_MIN_OUTPUT_TOKENS,
      parsedLlmVerifySampleRate: p.parsedLlmVerifySampleRate,
      parsedLlmMaxBatchesPerProduct: p.parsedLlmMaxBatchesPerProduct,
      parsedLlmMaxEvidenceChars: p.parsedLlmMaxEvidenceChars,
      parsedLlmMaxTokens: p.parsedLlmMaxTokens,
      parsedLlmTimeoutMs: p.parsedLlmTimeoutMs,
      parsedLlmCostInputPer1M: p.parsedLlmCostInputPer1M,
      parsedLlmCostOutputPer1M: p.parsedLlmCostOutputPer1M,
      parsedLlmCostCachedInputPer1M: p.parsedLlmCostCachedInputPer1M,
      llmVerifyMode: readString(s.llmVerifyMode),
      parsedEndpointSignalLimit: p.parsedEndpointSignalLimit,
      parsedEndpointSuggestionLimit: p.parsedEndpointSuggestionLimit,
      parsedEndpointNetworkScanLimit: p.parsedEndpointNetworkScanLimit,
    }),
    ...buildIndexingRunModelPayload({
      searchEngines: readString(s.searchEngines ?? s.searchProvider),
      searchEnginesFallback: readString(s.searchEnginesFallback),
      llmModelPlan: readString(s.llmModelPlan),
      llmMaxOutputTokensPlan: Number(s.llmMaxOutputTokensPlan || 0),
      llmModelReasoning: readString(s.llmModelReasoning),
      llmMaxOutputTokensReasoning: Number(s.llmMaxOutputTokensReasoning || 0),
      llmPlanFallbackModel: readString(s.llmPlanFallbackModel),
      llmReasoningFallbackModel: readString(s.llmReasoningFallbackModel),
      llmMaxOutputTokensPlanFallback: Number(s.llmMaxOutputTokensPlanFallback || 0),
      llmMaxOutputTokensReasoningFallback: Number(s.llmMaxOutputTokensReasoningFallback || 0),
    }),
    ...runControlPayload,
    // WHY: Composite LlmPolicy sent as one field. The backend disassembles it
    // to flat keys for env overrides. This replaces individual flat-key forwarding.
    ...(llmPolicy ? { llmPolicy } : {}),
  };

  return runtimePayload;
}
