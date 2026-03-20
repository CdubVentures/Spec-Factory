import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { collectRuntimeSettingsPayload } from '../runtimeSettingsPayload.ts';
import type { RuntimeSettingsPayloadSerializerInput } from '../runtimeSettingsDomainTypes.ts';
import type { RuntimeModelTokenDefaults } from '../runtimeSettingsDomainTypes.ts';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const MODEL_LIMITS: Record<string, RuntimeModelTokenDefaults> = {
  'gpt-4o': { default_output_tokens: 4096, max_output_tokens: 16384 },
  'gpt-4o-mini': { default_output_tokens: 2048, max_output_tokens: 8192 },
  'claude-sonnet': { default_output_tokens: 4096, max_output_tokens: 16384 },
  'claude-haiku': { default_output_tokens: 2048, max_output_tokens: 4096 },
  'deepseek-r1': { default_output_tokens: 4096, max_output_tokens: 32768 },
  'deepseek-v3': { default_output_tokens: 2048, max_output_tokens: 8192 },
};

const FALLBACK_MODEL = { default_output_tokens: 4096, max_output_tokens: 16384 };

function resolveModelTokenDefaults(model: string): RuntimeModelTokenDefaults {
  return MODEL_LIMITS[model] ?? FALLBACK_MODEL;
}

function makeBaselineZeros(): Record<string, number> {
  return new Proxy({} as Record<string, number>, {
    get: () => 0,
  });
}

function makeInput(
  overrides: Partial<RuntimeSettingsPayloadSerializerInput> = {},
): RuntimeSettingsPayloadSerializerInput {
  return {
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: '',
    llmPlanApiKey: '',
    llmModelPlan: 'gpt-4o',
    llmModelReasoning: 'claude-sonnet',
    llmExtractMaxSnippetsPerBatch: 5,
    llmExtractMaxSnippetChars: 3000,
    llmReasoningBudget: 0,
    llmMonthlyBudgetUsd: 100,
    llmPerProductBudgetUsd: 5,
    llmMaxCallsPerRound: 10,
    llmMaxOutputTokens: 4096,
    llmVerifySampleRate: 0,
    llmMaxBatchesPerProduct: 3,
    llmMaxEvidenceChars: 2000,
    llmMaxTokens: 128000,
    llmTimeoutMs: 30000,
    llmCostInputPer1M: 2.5,
    llmCostOutputPer1M: 10,
    llmCostCachedInputPer1M: 1.25,
    llmPlanFallbackModel: 'gpt-4o-mini',
    llmReasoningFallbackModel: 'claude-haiku',
    outputMode: 'local',
    localInputRoot: '',
    localOutputRoot: '',
    runtimeEventsKey: '',
    s3InputPrefix: '',
    s3OutputPrefix: '',
    eloSupabaseAnonKey: '',
    eloSupabaseEndpoint: '',
    llmProvider: 'openai',
    llmBaseUrl: '',
    openaiApiKey: '',
    anthropicApiKey: '',
    geminiApiKey: '',
    deepseekApiKey: '',
    llmPlanProvider: '',
    llmPlanBaseUrl: '',
    importsRoot: '',
    resumeMode: 'off',
    scannedPdfOcrBackend: 'tesseract',
    fetchConcurrency: 5,
    perHostMinDelayMs: 500,
    searxngMinQueryIntervalMs: 1000,
    domainRequestRps: 2,
    domainRequestBurst: 5,
    globalRequestRps: 10,
    globalRequestBurst: 20,
    fetchPerHostConcurrencyCap: 2,
    llmMaxOutputTokensPlan: 4096,
    llmMaxOutputTokensReasoning: 4096,
    llmMaxOutputTokensPlanFallback: 4096,
    llmMaxOutputTokensReasoningFallback: 4096,
    llmExtractionCacheTtlMs: 0,
    llmMaxCallsPerProductTotal: 100,
    resumeWindowHours: 24,
    reextractAfterHours: 0,
    scannedPdfOcrMaxPages: 10,
    scannedPdfOcrMaxPairs: 5,
    scannedPdfOcrMinCharsPerPage: 100,
    scannedPdfOcrMinLinesPerPage: 5,
    scannedPdfOcrMinConfidence: 0.8,
    crawleeRequestHandlerTimeoutSecs: 60,
    dynamicFetchRetryBudget: 3,
    dynamicFetchRetryBackoffMs: 1000,
    fetchSchedulerMaxRetries: 3,
    pageGotoTimeoutMs: 30000,
    pageNetworkIdleTimeoutMs: 5000,
    postLoadWaitMs: 1000,
    frontierDbPath: '',
    frontierQueryCooldownSeconds: 60,
    frontierCooldown404Seconds: 3600,
    frontierCooldown404RepeatSeconds: 86400,
    frontierCooldown410Seconds: 604800,
    frontierCooldownTimeoutSeconds: 300,
    frontierCooldown403BaseSeconds: 3600,
    frontierCooldown429BaseSeconds: 60,
    frontierBackoffMaxExponent: 5,
    frontierPathPenaltyNotfoundThreshold: 3,
    frontierBlockedDomainThreshold: 5,
    autoScrollPasses: 0,
    autoScrollDelayMs: 500,
    maxGraphqlReplays: 0,
    maxNetworkResponsesPerPage: 500,
    robotsTxtTimeoutMs: 5000,
    endpointSignalLimit: 50,
    endpointSuggestionLimit: 20,
    endpointNetworkScanLimit: 100,
    searchProfileQueryCap: 10,
    searchPlannerQueryCap: 50,
    maxUrlsPerProduct: 20,
    maxCandidateUrls: 100,
    maxPagesPerDomain: 10,
    maxRunSeconds: 600,
    maxJsonBytes: 1048576,
    maxPdfBytes: 10485760,
    pdfBackendRouterTimeoutMs: 15000,
    pdfBackendRouterMaxPages: 50,
    pdfBackendRouterMaxPairs: 10,
    pdfBackendRouterMaxTextPreviewChars: 5000,
    capturePageScreenshotQuality: 80,
    capturePageScreenshotMaxBytes: 524288,
    articleExtractorMinChars: 200,
    articleExtractorMinScore: 20,
    articleExtractorMaxChars: 50000,
    staticDomTargetMatchThreshold: 0.7,
    staticDomMaxEvidenceSnippets: 20,
    domSnippetMaxChars: 2000,
    maxHypothesisItems: 10,
    hypothesisAutoFollowupRounds: 0,
    hypothesisFollowupUrlsPerRound: 3,
    runtimeScreencastFps: 1,
    runtimeScreencastQuality: 50,
    runtimeScreencastMaxWidth: 1280,
    runtimeScreencastMaxHeight: 720,
    runtimeTraceFetchRing: 100,
    runtimeTraceLlmRing: 50,
    daemonConcurrency: 1,
    importsPollSeconds: 30,
    indexingResumeSeedLimit: 100,
    indexingResumePersistLimit: 1000,
    fieldRewardHalfLifeDays: 30,
    driftPollSeconds: 300,
    driftScanMaxProducts: 10,
    reCrawlStaleAfterDays: 7,
    dynamicFetchPolicyMapJson: '',
    searchProfileCapMapJson: '',
    serpRerankerWeightMapJson: '',
    userAgent: '',
    pdfPreferredBackend: '',
    capturePageScreenshotFormat: 'jpeg',
    capturePageScreenshotSelectors: '',
    runtimeControlFile: '',
    staticDomMode: 'auto',
    specDbDir: '',
    articleExtractorDomainPolicyMapJson: '',
    llmExtractionCacheDir: '',
    categoryAuthorityRoot: '',
    batchStrategy: '',
    discoveryEnabled: true,
    reextractIndexed: false,
    fetchCandidateSources: true,
    pdfBackendRouterEnabled: false,
    capturePageScreenshotEnabled: false,
    categoryAuthorityEnabled: false,
    helperSupportiveFillMissing: false,
    driftDetectionEnabled: false,
    driftAutoRepublish: false,
    indexingCategoryAuthorityEnabled: false,
    scannedPdfOcrEnabled: false,
    dynamicCrawleeEnabled: false,
    crawleeHeadless: true,
    llmExtractSkipLowSignal: false,
    llmReasoningMode: false,
    llmPlanUseReasoning: false,
    llmVerifyMode: false,
    localMode: true,
    dryRun: false,
    mirrorToS3: false,
    mirrorToS3Input: false,
    writeMarkdownSummary: false,
    llmWriteSummary: false,
    preferHttpFetcher: false,
    frontierStripTrackingParams: true,
    autoScrollEnabled: false,
    graphqlReplayEnabled: false,
    robotsTxtCompliant: true,
    runtimeScreencastEnabled: false,
    runtimeTraceEnabled: false,
    runtimeTraceLlmPayloads: false,
    eventsJsonWrite: true,
    indexingSchemaPacketsValidationEnabled: false,
    indexingSchemaPacketsValidationStrict: false,
    selfImproveEnabled: false,
    runtimeSettingsFallbackBaseline: makeBaselineZeros() as never,
    resolveModelTokenDefaults,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Fix 1: Fallback token clamping uses correct (fallback) model        */
/* ------------------------------------------------------------------ */

describe('collectRuntimeSettingsPayload — fallback token clamping', () => {
  it('clamps plan fallback tokens against fallback model, not primary', () => {
    // gpt-4o max=16384, gpt-4o-mini max=8192
    // Setting 12000 tokens: should be clamped to 8192 by fallback model limit
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: 'gpt-4o-mini',
      llmMaxOutputTokensPlanFallback: 12000,
    }));
    strictEqual(result.llmMaxOutputTokensPlanFallback, 8192);
  });

  it('clamps reasoning fallback tokens against fallback model, not primary', () => {
    // claude-sonnet max=16384, claude-haiku max=4096
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelReasoning: 'claude-sonnet',
      llmReasoningFallbackModel: 'claude-haiku',
      llmMaxOutputTokensReasoningFallback: 10000,
    }));
    strictEqual(result.llmMaxOutputTokensReasoningFallback, 4096);
  });

  it('falls back to primary model when no fallback model is configured', () => {
    // If no fallback model set, clamping should use primary model limits
    const result = collectRuntimeSettingsPayload(makeInput({
      llmModelPlan: 'gpt-4o',
      llmPlanFallbackModel: '',
      llmMaxOutputTokensPlanFallback: 12000,
    }));
    // Should clamp to gpt-4o max (16384), so 12000 passes through
    strictEqual(result.llmMaxOutputTokensPlanFallback, 12000);
  });
});

