import {
  type RuntimeRepairDedupeRule,
  type RuntimeSettingDefaults,
  type SearxngEngine,
} from '../../../stores/settingsManifest';
import { type RuntimeSettings } from './runtimeSettingsAuthority';
import { parseRuntimeLlmTokenCap } from './runtimeSettingsDomain';
import {
  OCR_BACKEND_OPTIONS,
  parseBoundedNumber,
  REPAIR_DEDUPE_RULE_OPTIONS,
  RESUME_MODE_OPTIONS,
  RUNTIME_NUMBER_BOUNDS,
  SEARXNG_ENGINE_OPTIONS,
  type RuntimeDraft,
} from './RuntimeFlowDraftContracts';

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseString(value: unknown, fallback: string, allowEmpty = false): string {
  if (typeof value !== 'string') return fallback;
  if (allowEmpty) return value;
  const token = value.trim();
  return token || fallback;
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  const token = String(value || '').trim();
  if (!token) return fallback;
  return options.includes(token as T[number]) ? (token as T[number]) : fallback;
}

const LEGACY_MIGRATION_MAP: Record<string, string> = {
  dual: 'bing,google',
  google: 'google',
  bing: 'bing',
  searxng: 'bing,google-proxy,duckduckgo',
  none: '',
};

function parseSearchEngines(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw in LEGACY_MIGRATION_MAP) return LEGACY_MIGRATION_MAP[raw];
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const token of tokens) {
    if ((SEARXNG_ENGINE_OPTIONS as readonly string[]).includes(token) && !seen.has(token)) {
      seen.add(token);
      valid.push(token);
    }
  }
  return valid.length > 0 ? valid.join(',') : fallback;
}

export function normalizeRuntimeDraft(
  source: RuntimeSettings | undefined,
  fallback: RuntimeSettingDefaults,
): RuntimeDraft {
  const raw = source || {};
  return {
    searchEngines: parseSearchEngines(raw.searchEngines ?? raw.searchProvider, fallback.searchEngines),
    searchEnginesFallback: parseSearchEngines(raw.searchEnginesFallback, fallback.searchEnginesFallback),
    searxngBaseUrl: parseString(raw.searxngBaseUrl, fallback.searxngBaseUrl, true),
    llmPlanApiKey: parseString(raw.llmPlanApiKey, fallback.llmPlanApiKey, true),
    llmModelPlan: parseString(raw.llmModelPlan ?? raw.phase2LlmModel, fallback.llmModelPlan),
    llmModelReasoning: parseString(raw.llmModelReasoning, fallback.llmModelReasoning),
    llmPlanFallbackModel: parseString(raw.llmPlanFallbackModel, fallback.llmPlanFallbackModel, true),
    llmReasoningFallbackModel: parseString(raw.llmReasoningFallbackModel, fallback.llmReasoningFallbackModel, true),
    llmPlanUseReasoning: parseBoolean(raw.llmPlanUseReasoning, fallback.llmPlanUseReasoning),
    outputMode: parseString(raw.outputMode, fallback.outputMode, true),
    localInputRoot: parseString(raw.localInputRoot, fallback.localInputRoot, true),
    localOutputRoot: parseString(raw.localOutputRoot, fallback.localOutputRoot, true),
    runtimeEventsKey: parseString(raw.runtimeEventsKey, fallback.runtimeEventsKey, true),
    awsRegion: parseString(raw.awsRegion, fallback.awsRegion, true),
    s3Bucket: parseString(raw.s3Bucket, fallback.s3Bucket, true),
    s3InputPrefix: parseString(raw.s3InputPrefix, fallback.s3InputPrefix, true),
    s3OutputPrefix: parseString(raw.s3OutputPrefix, fallback.s3OutputPrefix, true),
    eloSupabaseAnonKey: parseString(raw.eloSupabaseAnonKey, fallback.eloSupabaseAnonKey, true),
    eloSupabaseEndpoint: parseString(raw.eloSupabaseEndpoint, fallback.eloSupabaseEndpoint, true),
    llmProvider: parseString(raw.llmProvider, fallback.llmProvider, true),
    llmBaseUrl: parseString(raw.llmBaseUrl, fallback.llmBaseUrl, true),
    openaiApiKey: parseString(raw.openaiApiKey, fallback.openaiApiKey, true),
    anthropicApiKey: parseString(raw.anthropicApiKey, fallback.anthropicApiKey, true),
    geminiApiKey: parseString(raw.geminiApiKey, fallback.geminiApiKey, true),
    deepseekApiKey: parseString(raw.deepseekApiKey, fallback.deepseekApiKey, true),
    llmPlanProvider: parseString(raw.llmPlanProvider, fallback.llmPlanProvider, true),
    llmPlanBaseUrl: parseString(raw.llmPlanBaseUrl, fallback.llmPlanBaseUrl, true),
    importsRoot: parseString(raw.importsRoot, fallback.importsRoot, true),
    llmExtractionCacheDir: parseString(raw.llmExtractionCacheDir, fallback.llmExtractionCacheDir, true),
    resumeMode: parseEnum(raw.resumeMode, RESUME_MODE_OPTIONS, fallback.resumeMode),
    scannedPdfOcrBackend: parseEnum(raw.scannedPdfOcrBackend, OCR_BACKEND_OPTIONS, fallback.scannedPdfOcrBackend),
    fetchBudgetMs: parseBoundedNumber(
      raw.fetchBudgetMs,
      fallback.fetchBudgetMs,
      RUNTIME_NUMBER_BOUNDS.fetchBudgetMs,
    ),
    fetchConcurrency: parseBoundedNumber(
      raw.fetchConcurrency,
      fallback.fetchConcurrency,
      RUNTIME_NUMBER_BOUNDS.fetchConcurrency,
    ),
    perHostMinDelayMs: parseBoundedNumber(
      raw.perHostMinDelayMs,
      fallback.perHostMinDelayMs,
      RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs,
    ),
    searxngMinQueryIntervalMs: parseBoundedNumber(
      raw.searxngMinQueryIntervalMs,
      fallback.searxngMinQueryIntervalMs,
      RUNTIME_NUMBER_BOUNDS.searxngMinQueryIntervalMs,
    ),
    googleSearchProxyUrlsJson: parseString(raw.googleSearchProxyUrlsJson, fallback.googleSearchProxyUrlsJson, true),
    googleSearchTimeoutMs: parseBoundedNumber(
      raw.googleSearchTimeoutMs,
      fallback.googleSearchTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.googleSearchTimeoutMs,
    ),
    googleSearchMinQueryIntervalMs: parseBoundedNumber(
      raw.googleSearchMinQueryIntervalMs,
      fallback.googleSearchMinQueryIntervalMs,
      RUNTIME_NUMBER_BOUNDS.googleSearchMinQueryIntervalMs,
    ),
    googleSearchMaxRetries: parseBoundedNumber(
      raw.googleSearchMaxRetries,
      fallback.googleSearchMaxRetries,
      RUNTIME_NUMBER_BOUNDS.googleSearchMaxRetries,
    ),
    googleSearchScreenshotsEnabled: parseBoolean(raw.googleSearchScreenshotsEnabled, fallback.googleSearchScreenshotsEnabled),
    domainRequestRps: parseBoundedNumber(
      raw.domainRequestRps,
      fallback.domainRequestRps,
      RUNTIME_NUMBER_BOUNDS.domainRequestRps,
    ),
    domainRequestBurst: parseBoundedNumber(
      raw.domainRequestBurst,
      fallback.domainRequestBurst,
      RUNTIME_NUMBER_BOUNDS.domainRequestBurst,
    ),
    globalRequestRps: parseBoundedNumber(
      raw.globalRequestRps,
      fallback.globalRequestRps,
      RUNTIME_NUMBER_BOUNDS.globalRequestRps,
    ),
    globalRequestBurst: parseBoundedNumber(
      raw.globalRequestBurst,
      fallback.globalRequestBurst,
      RUNTIME_NUMBER_BOUNDS.globalRequestBurst,
    ),
    fetchPerHostConcurrencyCap: parseBoundedNumber(
      raw.fetchPerHostConcurrencyCap,
      fallback.fetchPerHostConcurrencyCap,
      RUNTIME_NUMBER_BOUNDS.fetchPerHostConcurrencyCap,
    ),
    llmMaxOutputTokensPlan: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensPlan ?? raw.llmTokensPlan) || fallback.llmMaxOutputTokensPlan,
    llmMaxOutputTokensReasoning: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensReasoning ?? raw.llmTokensReasoning) || fallback.llmMaxOutputTokensReasoning,
    llmMaxOutputTokensPlanFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensPlanFallback ?? raw.llmTokensPlanFallback) || fallback.llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensReasoningFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensReasoningFallback ?? raw.llmTokensReasoningFallback) || fallback.llmMaxOutputTokensReasoningFallback,
    resumeWindowHours: parseBoundedNumber(
      raw.resumeWindowHours,
      fallback.resumeWindowHours,
      RUNTIME_NUMBER_BOUNDS.resumeWindowHours,
    ),
    indexingResumeSeedLimit: parseBoundedNumber(
      raw.indexingResumeSeedLimit,
      fallback.indexingResumeSeedLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit,
    ),
    indexingResumePersistLimit: parseBoundedNumber(
      raw.indexingResumePersistLimit,
      fallback.indexingResumePersistLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit,
    ),
    reextractAfterHours: parseBoundedNumber(
      raw.reextractAfterHours,
      fallback.reextractAfterHours,
      RUNTIME_NUMBER_BOUNDS.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseBoundedNumber(
      raw.scannedPdfOcrMaxPages,
      fallback.scannedPdfOcrMaxPages,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseBoundedNumber(
      raw.scannedPdfOcrMaxPairs,
      fallback.scannedPdfOcrMaxPairs,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinCharsPerPage,
      fallback.scannedPdfOcrMinCharsPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinLinesPerPage,
      fallback.scannedPdfOcrMinLinesPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseBoundedNumber(
      raw.scannedPdfOcrMinConfidence,
      fallback.scannedPdfOcrMinConfidence,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseBoundedNumber(
      raw.crawleeRequestHandlerTimeoutSecs,
      fallback.crawleeRequestHandlerTimeoutSecs,
      RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseBoundedNumber(
      raw.dynamicFetchRetryBudget,
      fallback.dynamicFetchRetryBudget,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseBoundedNumber(
      raw.dynamicFetchRetryBackoffMs,
      fallback.dynamicFetchRetryBackoffMs,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs,
    ),
    fetchSchedulerMaxRetries: parseBoundedNumber(
      raw.fetchSchedulerMaxRetries,
      fallback.fetchSchedulerMaxRetries,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries,
    ),
    fetchSchedulerFallbackWaitMs: parseBoundedNumber(
      raw.fetchSchedulerFallbackWaitMs,
      fallback.fetchSchedulerFallbackWaitMs,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs,
    ),
    pageGotoTimeoutMs: parseBoundedNumber(
      raw.pageGotoTimeoutMs,
      fallback.pageGotoTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs,
    ),
    pageNetworkIdleTimeoutMs: parseBoundedNumber(
      raw.pageNetworkIdleTimeoutMs,
      fallback.pageNetworkIdleTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs,
    ),
    postLoadWaitMs: parseBoundedNumber(
      raw.postLoadWaitMs,
      fallback.postLoadWaitMs,
      RUNTIME_NUMBER_BOUNDS.postLoadWaitMs,
    ),
    frontierDbPath: parseString(raw.frontierDbPath, fallback.frontierDbPath, true),
    frontierQueryCooldownSeconds: parseBoundedNumber(
      raw.frontierQueryCooldownSeconds,
      fallback.frontierQueryCooldownSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds,
    ),
    frontierCooldown404Seconds: parseBoundedNumber(
      raw.frontierCooldown404Seconds,
      fallback.frontierCooldown404Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds,
    ),
    frontierCooldown404RepeatSeconds: parseBoundedNumber(
      raw.frontierCooldown404RepeatSeconds,
      fallback.frontierCooldown404RepeatSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds,
    ),
    frontierCooldown410Seconds: parseBoundedNumber(
      raw.frontierCooldown410Seconds,
      fallback.frontierCooldown410Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds,
    ),
    frontierCooldownTimeoutSeconds: parseBoundedNumber(
      raw.frontierCooldownTimeoutSeconds,
      fallback.frontierCooldownTimeoutSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds,
    ),
    frontierCooldown403BaseSeconds: parseBoundedNumber(
      raw.frontierCooldown403BaseSeconds,
      fallback.frontierCooldown403BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds,
    ),
    frontierCooldown429BaseSeconds: parseBoundedNumber(
      raw.frontierCooldown429BaseSeconds,
      fallback.frontierCooldown429BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds,
    ),
    frontierBackoffMaxExponent: parseBoundedNumber(
      raw.frontierBackoffMaxExponent,
      fallback.frontierBackoffMaxExponent,
      RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent,
    ),
    frontierPathPenaltyNotfoundThreshold: parseBoundedNumber(
      raw.frontierPathPenaltyNotfoundThreshold,
      fallback.frontierPathPenaltyNotfoundThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold,
    ),
    frontierBlockedDomainThreshold: parseBoundedNumber(
      raw.frontierBlockedDomainThreshold,
      fallback.frontierBlockedDomainThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold,
    ),
    autoScrollPasses: parseBoundedNumber(
      raw.autoScrollPasses,
      fallback.autoScrollPasses,
      RUNTIME_NUMBER_BOUNDS.autoScrollPasses,
    ),
    autoScrollDelayMs: parseBoundedNumber(
      raw.autoScrollDelayMs,
      fallback.autoScrollDelayMs,
      RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs,
    ),
    maxGraphqlReplays: parseBoundedNumber(
      raw.maxGraphqlReplays,
      fallback.maxGraphqlReplays,
      RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays,
    ),
    maxNetworkResponsesPerPage: parseBoundedNumber(
      raw.maxNetworkResponsesPerPage,
      fallback.maxNetworkResponsesPerPage,
      RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage,
    ),
    robotsTxtTimeoutMs: parseBoundedNumber(
      raw.robotsTxtTimeoutMs,
      fallback.robotsTxtTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs,
    ),
    endpointSignalLimit: parseBoundedNumber(
      raw.endpointSignalLimit,
      fallback.endpointSignalLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSignalLimit,
    ),
    endpointSuggestionLimit: parseBoundedNumber(
      raw.endpointSuggestionLimit,
      fallback.endpointSuggestionLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit,
    ),
    endpointNetworkScanLimit: parseBoundedNumber(
      raw.endpointNetworkScanLimit,
      fallback.endpointNetworkScanLimit,
      RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit,
    ),
    discoveryMaxQueries: parseBoundedNumber(
      raw.discoveryMaxQueries,
      fallback.discoveryMaxQueries,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries,
    ),
    discoveryMaxDiscovered: parseBoundedNumber(
      raw.discoveryMaxDiscovered,
      fallback.discoveryMaxDiscovered,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered,
    ),
    maxUrlsPerProduct: parseBoundedNumber(
      raw.maxUrlsPerProduct,
      fallback.maxUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct,
    ),
    maxCandidateUrls: parseBoundedNumber(
      raw.maxCandidateUrls,
      fallback.maxCandidateUrls,
      RUNTIME_NUMBER_BOUNDS.maxCandidateUrls,
    ),
    maxPagesPerDomain: parseBoundedNumber(
      raw.maxPagesPerDomain,
      fallback.maxPagesPerDomain,
      RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain,
    ),
    maxRunSeconds: parseBoundedNumber(
      raw.maxRunSeconds,
      fallback.maxRunSeconds,
      RUNTIME_NUMBER_BOUNDS.maxRunSeconds,
    ),
    maxJsonBytes: parseBoundedNumber(
      raw.maxJsonBytes,
      fallback.maxJsonBytes,
      RUNTIME_NUMBER_BOUNDS.maxJsonBytes,
    ),
    maxPdfBytes: parseBoundedNumber(
      raw.maxPdfBytes,
      fallback.maxPdfBytes,
      RUNTIME_NUMBER_BOUNDS.maxPdfBytes,
    ),
    pdfBackendRouterTimeoutMs: parseBoundedNumber(
      raw.pdfBackendRouterTimeoutMs,
      fallback.pdfBackendRouterTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs,
    ),
    pdfBackendRouterMaxPages: parseBoundedNumber(
      raw.pdfBackendRouterMaxPages,
      fallback.pdfBackendRouterMaxPages,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages,
    ),
    pdfBackendRouterMaxPairs: parseBoundedNumber(
      raw.pdfBackendRouterMaxPairs,
      fallback.pdfBackendRouterMaxPairs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs,
    ),
    pdfBackendRouterMaxTextPreviewChars: parseBoundedNumber(
      raw.pdfBackendRouterMaxTextPreviewChars,
      fallback.pdfBackendRouterMaxTextPreviewChars,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars,
    ),
    capturePageScreenshotQuality: parseBoundedNumber(
      raw.capturePageScreenshotQuality,
      fallback.capturePageScreenshotQuality,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality,
    ),
    capturePageScreenshotMaxBytes: parseBoundedNumber(
      raw.capturePageScreenshotMaxBytes,
      fallback.capturePageScreenshotMaxBytes,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes,
    ),
    articleExtractorMinChars: parseBoundedNumber(
      raw.articleExtractorMinChars,
      fallback.articleExtractorMinChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars,
    ),
    articleExtractorMinScore: parseBoundedNumber(
      raw.articleExtractorMinScore,
      fallback.articleExtractorMinScore,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore,
    ),
    articleExtractorMaxChars: parseBoundedNumber(
      raw.articleExtractorMaxChars,
      fallback.articleExtractorMaxChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars,
    ),
    staticDomTargetMatchThreshold: parseBoundedNumber(
      raw.staticDomTargetMatchThreshold,
      fallback.staticDomTargetMatchThreshold,
      RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold,
    ),
    staticDomMaxEvidenceSnippets: parseBoundedNumber(
      raw.staticDomMaxEvidenceSnippets,
      fallback.staticDomMaxEvidenceSnippets,
      RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets,
    ),
    domSnippetMaxChars: parseBoundedNumber(
      raw.domSnippetMaxChars,
      fallback.domSnippetMaxChars,
      RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars,
    ),
    llmExtractionCacheTtlMs: parseBoundedNumber(
      raw.llmExtractionCacheTtlMs,
      fallback.llmExtractionCacheTtlMs,
      RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs,
    ),
    llmMaxCallsPerProductTotal: parseBoundedNumber(
      raw.llmMaxCallsPerProductTotal,
      fallback.llmMaxCallsPerProductTotal,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal,
    ),
    llmExtractMaxSnippetsPerBatch: parseBoundedNumber(
      raw.llmExtractMaxSnippetsPerBatch,
      fallback.llmExtractMaxSnippetsPerBatch,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch,
    ),
    llmExtractMaxSnippetChars: parseBoundedNumber(
      raw.llmExtractMaxSnippetChars,
      fallback.llmExtractMaxSnippetChars,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars,
    ),
    llmReasoningBudget: parseBoundedNumber(
      raw.llmReasoningBudget,
      fallback.llmReasoningBudget,
      RUNTIME_NUMBER_BOUNDS.llmReasoningBudget,
    ),
    llmMonthlyBudgetUsd: parseBoundedNumber(
      raw.llmMonthlyBudgetUsd,
      fallback.llmMonthlyBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd,
    ),
    llmPerProductBudgetUsd: parseBoundedNumber(
      raw.llmPerProductBudgetUsd,
      fallback.llmPerProductBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd,
    ),
    llmMaxCallsPerRound: parseBoundedNumber(
      raw.llmMaxCallsPerRound,
      fallback.llmMaxCallsPerRound,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound,
    ),
    llmMaxOutputTokens: parseBoundedNumber(
      raw.llmMaxOutputTokens,
      fallback.llmMaxOutputTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens,
    ),
    llmVerifySampleRate: parseBoundedNumber(
      raw.llmVerifySampleRate,
      fallback.llmVerifySampleRate,
      RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate,
    ),
    llmMaxBatchesPerProduct: parseBoundedNumber(
      raw.llmMaxBatchesPerProduct,
      fallback.llmMaxBatchesPerProduct,
      RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct,
    ),
    llmMaxEvidenceChars: parseBoundedNumber(
      raw.llmMaxEvidenceChars,
      fallback.llmMaxEvidenceChars,
      RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars,
    ),
    llmMaxTokens: parseBoundedNumber(
      raw.llmMaxTokens,
      fallback.llmMaxTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxTokens,
    ),
    llmTimeoutMs: parseBoundedNumber(
      raw.llmTimeoutMs,
      fallback.llmTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.llmTimeoutMs,
    ),
    llmCostInputPer1M: parseBoundedNumber(
      raw.llmCostInputPer1M,
      fallback.llmCostInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M,
    ),
    llmCostOutputPer1M: parseBoundedNumber(
      raw.llmCostOutputPer1M,
      fallback.llmCostOutputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M,
    ),
    llmCostCachedInputPer1M: parseBoundedNumber(
      raw.llmCostCachedInputPer1M,
      fallback.llmCostCachedInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M,
    ),
    maxHypothesisItems: parseBoundedNumber(
      raw.maxHypothesisItems,
      fallback.maxHypothesisItems,
      RUNTIME_NUMBER_BOUNDS.maxHypothesisItems,
    ),
    hypothesisAutoFollowupRounds: parseBoundedNumber(
      raw.hypothesisAutoFollowupRounds,
      fallback.hypothesisAutoFollowupRounds,
      RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds,
    ),
    hypothesisFollowupUrlsPerRound: parseBoundedNumber(
      raw.hypothesisFollowupUrlsPerRound,
      fallback.hypothesisFollowupUrlsPerRound,
      RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound,
    ),
    runtimeScreencastFps: parseBoundedNumber(
      raw.runtimeScreencastFps,
      fallback.runtimeScreencastFps,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps,
    ),
    runtimeScreencastQuality: parseBoundedNumber(
      raw.runtimeScreencastQuality,
      fallback.runtimeScreencastQuality,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality,
    ),
    runtimeScreencastMaxWidth: parseBoundedNumber(
      raw.runtimeScreencastMaxWidth,
      fallback.runtimeScreencastMaxWidth,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth,
    ),
    runtimeScreencastMaxHeight: parseBoundedNumber(
      raw.runtimeScreencastMaxHeight,
      fallback.runtimeScreencastMaxHeight,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight,
    ),
    runtimeTraceFetchRing: parseBoundedNumber(
      raw.runtimeTraceFetchRing,
      fallback.runtimeTraceFetchRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing,
    ),
    runtimeTraceLlmRing: parseBoundedNumber(
      raw.runtimeTraceLlmRing,
      fallback.runtimeTraceLlmRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing,
    ),
    daemonConcurrency: parseBoundedNumber(
      raw.daemonConcurrency,
      fallback.daemonConcurrency,
      RUNTIME_NUMBER_BOUNDS.daemonConcurrency,
    ),
    daemonGracefulShutdownTimeoutMs: parseNumber(raw.daemonGracefulShutdownTimeoutMs, fallback.daemonGracefulShutdownTimeoutMs),
    importsPollSeconds: parseBoundedNumber(
      raw.importsPollSeconds,
      fallback.importsPollSeconds,
      RUNTIME_NUMBER_BOUNDS.importsPollSeconds,
    ),
    fieldRewardHalfLifeDays: parseBoundedNumber(
      raw.fieldRewardHalfLifeDays,
      fallback.fieldRewardHalfLifeDays,
      RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays,
    ),
    driftPollSeconds: parseBoundedNumber(
      raw.driftPollSeconds,
      fallback.driftPollSeconds,
      RUNTIME_NUMBER_BOUNDS.driftPollSeconds,
    ),
    driftScanMaxProducts: parseBoundedNumber(
      raw.driftScanMaxProducts,
      fallback.driftScanMaxProducts,
      RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts,
    ),
    reCrawlStaleAfterDays: parseBoundedNumber(
      raw.reCrawlStaleAfterDays,
      fallback.reCrawlStaleAfterDays,
      RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays,
    ),
    userAgent: parseString(raw.userAgent, fallback.userAgent, true),
    pdfPreferredBackend: parseString(raw.pdfPreferredBackend, fallback.pdfPreferredBackend, true),
    capturePageScreenshotFormat: parseString(raw.capturePageScreenshotFormat, fallback.capturePageScreenshotFormat, true),
    capturePageScreenshotSelectors: parseString(raw.capturePageScreenshotSelectors, fallback.capturePageScreenshotSelectors, true),
    runtimeControlFile: parseString(raw.runtimeControlFile, fallback.runtimeControlFile, true),
    staticDomMode: parseString(raw.staticDomMode, fallback.staticDomMode, true),
    specDbDir: parseString(raw.specDbDir, fallback.specDbDir, true),
    articleExtractorDomainPolicyMapJson: parseString(raw.articleExtractorDomainPolicyMapJson, fallback.articleExtractorDomainPolicyMapJson, true),
    categoryAuthorityRoot: parseString(
      raw.categoryAuthorityRoot ?? raw.helperFilesRoot,
      fallback.categoryAuthorityRoot,
      true,
    ),
    helperFilesRoot: parseString(
      raw.helperFilesRoot ?? raw.categoryAuthorityRoot,
      fallback.helperFilesRoot,
      true,
    ),
    batchStrategy: parseString(raw.batchStrategy, fallback.batchStrategy, true),
    dynamicFetchPolicyMapJson: parseString(raw.dynamicFetchPolicyMapJson, fallback.dynamicFetchPolicyMapJson, true),
    searchProfileCapMapJson: parseString(raw.searchProfileCapMapJson, fallback.searchProfileCapMapJson, true),
    serpRerankerWeightMapJson: parseString(raw.serpRerankerWeightMapJson, fallback.serpRerankerWeightMapJson, true),
    llmProviderRegistryJson: parseString(raw.llmProviderRegistryJson, fallback.llmProviderRegistryJson, true),
    llmPhaseOverridesJson: parseString(raw.llmPhaseOverridesJson, fallback.llmPhaseOverridesJson, true),
    fetchSchedulerInternalsMapJson: parseString(raw.fetchSchedulerInternalsMapJson, fallback.fetchSchedulerInternalsMapJson, true),
    parsingConfidenceBaseMapJson: parseString(raw.parsingConfidenceBaseMapJson, fallback.parsingConfidenceBaseMapJson, true),
    repairDedupeRule: parseString(raw.repairDedupeRule, fallback.repairDedupeRule, true) as RuntimeRepairDedupeRule,
    scannedPdfOcrEnabled: parseBoolean(raw.scannedPdfOcrEnabled, fallback.scannedPdfOcrEnabled),
    llmExtractSkipLowSignal: parseBoolean(raw.llmExtractSkipLowSignal, fallback.llmExtractSkipLowSignal),
    llmReasoningMode: parseBoolean(raw.llmReasoningMode, fallback.llmReasoningMode),
    llmVerifyMode: parseBoolean(raw.llmVerifyMode, fallback.llmVerifyMode),
    localMode: parseBoolean(raw.localMode, fallback.localMode),
    dryRun: parseBoolean(raw.dryRun, fallback.dryRun),
    mirrorToS3: parseBoolean(raw.mirrorToS3, fallback.mirrorToS3),
    mirrorToS3Input: parseBoolean(raw.mirrorToS3Input, fallback.mirrorToS3Input),
    writeMarkdownSummary: parseBoolean(raw.writeMarkdownSummary, fallback.writeMarkdownSummary),
    llmWriteSummary: parseBoolean(raw.llmWriteSummary, fallback.llmWriteSummary),
    reextractIndexed: parseBoolean(raw.reextractIndexed, fallback.reextractIndexed),
    fetchCandidateSources: parseBoolean(raw.fetchCandidateSources, fallback.fetchCandidateSources),
    pdfBackendRouterEnabled: parseBoolean(raw.pdfBackendRouterEnabled, fallback.pdfBackendRouterEnabled),
    capturePageScreenshotEnabled: parseBoolean(raw.capturePageScreenshotEnabled, fallback.capturePageScreenshotEnabled),
    categoryAuthorityEnabled: parseBoolean(
      raw.categoryAuthorityEnabled ?? raw.helperFilesEnabled,
      fallback.categoryAuthorityEnabled,
    ),
    helperSupportiveFillMissing: parseBoolean(raw.helperSupportiveFillMissing, fallback.helperSupportiveFillMissing),
    driftDetectionEnabled: parseBoolean(raw.driftDetectionEnabled, fallback.driftDetectionEnabled),
    driftAutoRepublish: parseBoolean(raw.driftAutoRepublish, fallback.driftAutoRepublish),
    indexingCategoryAuthorityEnabled: parseBoolean(
      raw.indexingCategoryAuthorityEnabled ?? raw.indexingHelperFilesEnabled,
      fallback.indexingCategoryAuthorityEnabled,
    ),
    discoveryEnabled: parseBoolean(raw.discoveryEnabled, fallback.discoveryEnabled),
    manufacturerAutoPromote: parseBoolean(raw.manufacturerAutoPromote, fallback.manufacturerAutoPromote),
    dynamicCrawleeEnabled: parseBoolean(raw.dynamicCrawleeEnabled, fallback.dynamicCrawleeEnabled),
    crawleeHeadless: parseBoolean(raw.crawleeHeadless, fallback.crawleeHeadless),
    preferHttpFetcher: parseBoolean(raw.preferHttpFetcher, fallback.preferHttpFetcher),
    frontierStripTrackingParams: parseBoolean(raw.frontierStripTrackingParams, fallback.frontierStripTrackingParams),
    autoScrollEnabled: parseBoolean(raw.autoScrollEnabled, fallback.autoScrollEnabled),
    graphqlReplayEnabled: parseBoolean(raw.graphqlReplayEnabled, fallback.graphqlReplayEnabled),
    robotsTxtCompliant: parseBoolean(raw.robotsTxtCompliant, fallback.robotsTxtCompliant),
    runtimeScreencastEnabled: parseBoolean(raw.runtimeScreencastEnabled, fallback.runtimeScreencastEnabled),
    runtimeTraceEnabled: parseBoolean(raw.runtimeTraceEnabled, fallback.runtimeTraceEnabled),
    runtimeTraceLlmPayloads: parseBoolean(raw.runtimeTraceLlmPayloads, fallback.runtimeTraceLlmPayloads),
    eventsJsonWrite: parseBoolean(raw.eventsJsonWrite, fallback.eventsJsonWrite),
    indexingSchemaPacketsValidationEnabled: parseBoolean(raw.indexingSchemaPacketsValidationEnabled, fallback.indexingSchemaPacketsValidationEnabled),
    indexingSchemaPacketsValidationStrict: parseBoolean(raw.indexingSchemaPacketsValidationStrict, fallback.indexingSchemaPacketsValidationStrict),
    selfImproveEnabled: parseBoolean(raw.selfImproveEnabled, fallback.selfImproveEnabled),
  };
}



