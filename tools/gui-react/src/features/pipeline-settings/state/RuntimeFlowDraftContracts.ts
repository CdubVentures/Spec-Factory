import { type RuntimeSettingDefaults } from '../../../stores/settingsManifest';

export const SEARCH_PROVIDER_OPTIONS = ['searxng', 'bing', 'google', 'dual'] as const;
export const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;
export const RESUME_MODE_OPTIONS = ['auto', 'force_resume', 'start_over'] as const;
export const REPAIR_DEDUPE_RULE_OPTIONS = ['domain_once', 'domain_and_status', 'none'] as const;
export const AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS = ['sqlite', 'memory'] as const;

export type RuntimeDraft = Omit<RuntimeSettingDefaults, 'runtimeAutoSaveEnabled'>;

export interface NumberBound {
  min: number;
  max: number;
  int?: boolean;
}

export const RUNTIME_NUMBER_BOUNDS: Record<
  | 'fetchConcurrency'
  | 'perHostMinDelayMs'
  | 'searchGlobalRps'
  | 'searchGlobalBurst'
  | 'searchPerHostRps'
  | 'searchPerHostBurst'
  | 'domainRequestRps'
  | 'domainRequestBurst'
  | 'globalRequestRps'
  | 'globalRequestBurst'
  | 'fetchPerHostConcurrencyCap'
  | 'crawleeRequestHandlerTimeoutSecs'
  | 'dynamicFetchRetryBudget'
  | 'dynamicFetchRetryBackoffMs'
  | 'fetchSchedulerMaxRetries'
  | 'fetchSchedulerFallbackWaitMs'
  | 'pageGotoTimeoutMs'
  | 'pageNetworkIdleTimeoutMs'
  | 'postLoadWaitMs'
  | 'frontierQueryCooldownSeconds'
  | 'frontierCooldown404Seconds'
  | 'frontierCooldown404RepeatSeconds'
  | 'frontierCooldown410Seconds'
  | 'frontierCooldownTimeoutSeconds'
  | 'frontierCooldown403BaseSeconds'
  | 'frontierCooldown429BaseSeconds'
  | 'frontierBackoffMaxExponent'
  | 'frontierPathPenaltyNotfoundThreshold'
  | 'frontierBlockedDomainThreshold'
  | 'autoScrollPasses'
  | 'autoScrollDelayMs'
  | 'maxGraphqlReplays'
  | 'maxNetworkResponsesPerPage'
  | 'robotsTxtTimeoutMs'
  | 'runtimeScreencastFps'
  | 'runtimeScreencastQuality'
  | 'runtimeScreencastMaxWidth'
  | 'runtimeScreencastMaxHeight'
  | 'endpointSignalLimit'
  | 'endpointSuggestionLimit'
  | 'endpointNetworkScanLimit'
  | 'discoveryMaxQueries'
  | 'discoveryMaxDiscovered'
  | 'maxUrlsPerProduct'
  | 'maxCandidateUrls'
  | 'serpTriageMaxUrls'
  | 'maxPagesPerDomain'
  | 'maxRunSeconds'
  | 'maxJsonBytes'
  | 'maxPdfBytes'
  | 'pdfBackendRouterTimeoutMs'
  | 'pdfBackendRouterMaxPages'
  | 'pdfBackendRouterMaxPairs'
  | 'pdfBackendRouterMaxTextPreviewChars'
  | 'capturePageScreenshotQuality'
  | 'capturePageScreenshotMaxBytes'
  | 'articleExtractorMinChars'
  | 'articleExtractorMinScore'
  | 'articleExtractorMaxChars'
  | 'staticDomTargetMatchThreshold'
  | 'staticDomMaxEvidenceSnippets'
  | 'structuredMetadataExtructTimeoutMs'
  | 'structuredMetadataExtructMaxItemsPerSurface'
  | 'structuredMetadataExtructCacheLimit'
  | 'domSnippetMaxChars'
  | 'llmExtractionCacheTtlMs'
  | 'llmMaxCallsPerProductTotal'
  | 'llmMaxCallsPerProductFast'
  | 'consensusMethodWeightNetworkJson'
  | 'consensusMethodWeightAdapterApi'
  | 'consensusMethodWeightStructuredMeta'
  | 'consensusMethodWeightPdf'
  | 'consensusMethodWeightTableKv'
  | 'consensusMethodWeightDom'
  | 'consensusMethodWeightLlmExtractBase'
  | 'consensusPolicyBonus'
  | 'consensusWeightedMajorityThreshold'
  | 'consensusStrictAcceptanceDomainCount'
  | 'consensusRelaxedAcceptanceDomainCount'
  | 'consensusInstrumentedFieldThreshold'
  | 'consensusConfidenceScoringBase'
  | 'consensusPassTargetIdentityStrong'
  | 'consensusPassTargetNormal'
  | 'retrievalTierWeightTier1'
  | 'retrievalTierWeightTier2'
  | 'retrievalTierWeightTier3'
  | 'retrievalTierWeightTier4'
  | 'retrievalTierWeightTier5'
  | 'retrievalDocKindWeightManualPdf'
  | 'retrievalDocKindWeightSpecPdf'
  | 'retrievalDocKindWeightSupport'
  | 'retrievalDocKindWeightLabReview'
  | 'retrievalDocKindWeightProductPage'
  | 'retrievalDocKindWeightOther'
  | 'retrievalMethodWeightTable'
  | 'retrievalMethodWeightKv'
  | 'retrievalMethodWeightJsonLd'
  | 'retrievalMethodWeightLlmExtract'
  | 'retrievalMethodWeightHelperSupportive'
  | 'retrievalAnchorScorePerMatch'
  | 'retrievalIdentityScorePerMatch'
  | 'retrievalUnitMatchBonus'
  | 'retrievalDirectFieldMatchBonus'
  | 'identityGateBaseMatchThreshold'
  | 'qualityGateIdentityThreshold'
  | 'evidenceTextMaxChars'
  | 'llmExtractMaxTokens'
  | 'llmExtractMaxSnippetsPerBatch'
  | 'llmExtractMaxSnippetChars'
  | 'llmExtractReasoningBudget'
  | 'llmReasoningBudget'
  | 'llmMonthlyBudgetUsd'
  | 'llmPerProductBudgetUsd'
  | 'llmMaxCallsPerRound'
  | 'llmMaxOutputTokens'
  | 'llmVerifySampleRate'
  | 'llmMaxBatchesPerProduct'
  | 'llmMaxEvidenceChars'
  | 'llmMaxTokens'
  | 'llmTimeoutMs'
  | 'llmCostInputPer1M'
  | 'llmCostOutputPer1M'
  | 'llmCostCachedInputPer1M'
  | 'maxManufacturerUrlsPerProduct'
  | 'maxManufacturerPagesPerDomain'
  | 'manufacturerReserveUrls'
  | 'maxHypothesisItems'
  | 'hypothesisAutoFollowupRounds'
  | 'hypothesisFollowupUrlsPerRound'
  | 'runtimeTraceFetchRing'
  | 'runtimeTraceLlmRing'
  | 'daemonConcurrency'
  | 'daemonGracefulShutdownTimeoutMs'
  | 'importsPollSeconds'
  | 'identityGatePublishThreshold'
  | 'indexingResumeSeedLimit'
  | 'indexingResumePersistLimit'
  | 'helperSupportiveMaxSources'
  | 'helperActiveSyncLimit'
  | 'fieldRewardHalfLifeDays'
  | 'driftPollSeconds'
  | 'driftScanMaxProducts'
  | 'reCrawlStaleAfterDays'
  | 'cortexSyncTimeoutMs'
  | 'cortexAsyncPollIntervalMs'
  | 'cortexAsyncMaxWaitMs'
  | 'cortexEnsureReadyTimeoutMs'
  | 'cortexStartReadyTimeoutMs'
  | 'cortexFailureThreshold'
  | 'cortexCircuitOpenMs'
  | 'cortexEscalateConfidenceLt'
  | 'cortexMaxDeepFieldsPerProduct'
  | 'scannedPdfOcrMaxPages'
  | 'scannedPdfOcrMaxPairs'
  | 'scannedPdfOcrMinCharsPerPage'
  | 'scannedPdfOcrMinLinesPerPage'
  | 'scannedPdfOcrMinConfidence'
  | 'resumeWindowHours'
  | 'reextractAfterHours'
  | 'fetchBudgetMs',
  NumberBound
> = {
  fetchBudgetMs: { min: 5000, max: 300_000, int: true },
  fetchConcurrency: { min: 1, max: 128, int: true },
  perHostMinDelayMs: { min: 0, max: 120_000, int: true },
  searchGlobalRps: { min: 0, max: 100, int: true },
  searchGlobalBurst: { min: 0, max: 1000, int: true },
  searchPerHostRps: { min: 0, max: 100, int: true },
  searchPerHostBurst: { min: 0, max: 1000, int: true },
  domainRequestRps: { min: 0, max: 100, int: true },
  domainRequestBurst: { min: 0, max: 1000, int: true },
  globalRequestRps: { min: 0, max: 100, int: true },
  globalRequestBurst: { min: 0, max: 1000, int: true },
  fetchPerHostConcurrencyCap: { min: 1, max: 64, int: true },
  crawleeRequestHandlerTimeoutSecs: { min: 0, max: 300, int: true },
  dynamicFetchRetryBudget: { min: 0, max: 30, int: true },
  dynamicFetchRetryBackoffMs: { min: 0, max: 120_000, int: true },
  fetchSchedulerMaxRetries: { min: 0, max: 20, int: true },
  fetchSchedulerFallbackWaitMs: { min: 0, max: 600_000, int: true },
  pageGotoTimeoutMs: { min: 0, max: 120_000, int: true },
  pageNetworkIdleTimeoutMs: { min: 0, max: 60_000, int: true },
  postLoadWaitMs: { min: 0, max: 60_000, int: true },
  frontierQueryCooldownSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown404Seconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown404RepeatSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown410Seconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldownTimeoutSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown403BaseSeconds: { min: 0, max: 86_400, int: true },
  frontierCooldown429BaseSeconds: { min: 0, max: 86_400, int: true },
  frontierBackoffMaxExponent: { min: 1, max: 12, int: true },
  frontierPathPenaltyNotfoundThreshold: { min: 1, max: 50, int: true },
  frontierBlockedDomainThreshold: { min: 1, max: 50, int: true },
  autoScrollPasses: { min: 0, max: 20, int: true },
  autoScrollDelayMs: { min: 0, max: 10_000, int: true },
  maxGraphqlReplays: { min: 0, max: 20, int: true },
  maxNetworkResponsesPerPage: { min: 100, max: 10_000, int: true },
  robotsTxtTimeoutMs: { min: 100, max: 120_000, int: true },
  runtimeScreencastFps: { min: 1, max: 60, int: true },
  runtimeScreencastQuality: { min: 10, max: 100, int: true },
  runtimeScreencastMaxWidth: { min: 320, max: 3840, int: true },
  runtimeScreencastMaxHeight: { min: 240, max: 2160, int: true },
  identityGatePublishThreshold: { min: 0, max: 1 },
  helperSupportiveMaxSources: { min: 0, max: 100, int: true },
  helperActiveSyncLimit: { min: 0, max: 5000, int: true },
  fieldRewardHalfLifeDays: { min: 1, max: 365, int: true },
  driftPollSeconds: { min: 60, max: 604_800, int: true },
  driftScanMaxProducts: { min: 1, max: 10_000, int: true },
  cortexSyncTimeoutMs: { min: 1000, max: 600_000, int: true },
  cortexAsyncPollIntervalMs: { min: 250, max: 120_000, int: true },
  cortexAsyncMaxWaitMs: { min: 1000, max: 3_600_000, int: true },
  cortexEnsureReadyTimeoutMs: { min: 1000, max: 300_000, int: true },
  cortexStartReadyTimeoutMs: { min: 1000, max: 300_000, int: true },
  cortexFailureThreshold: { min: 1, max: 20, int: true },
  cortexCircuitOpenMs: { min: 1000, max: 600_000, int: true },
  cortexEscalateConfidenceLt: { min: 0, max: 1 },
  cortexMaxDeepFieldsPerProduct: { min: 1, max: 200, int: true },
  endpointSignalLimit: { min: 1, max: 500, int: true },
  endpointSuggestionLimit: { min: 1, max: 200, int: true },
  endpointNetworkScanLimit: { min: 50, max: 10_000, int: true },
  discoveryMaxQueries: { min: 1, max: 100, int: true },
  discoveryMaxDiscovered: { min: 1, max: 2000, int: true },
  maxUrlsPerProduct: { min: 1, max: 1000, int: true },
  maxCandidateUrls: { min: 1, max: 5000, int: true },
  serpTriageMaxUrls: { min: 5, max: 30, int: true },
  maxPagesPerDomain: { min: 1, max: 100, int: true },
  maxRunSeconds: { min: 30, max: 86_400, int: true },
  maxJsonBytes: { min: 1024, max: 100_000_000, int: true },
  maxPdfBytes: { min: 1024, max: 100_000_000, int: true },
  pdfBackendRouterTimeoutMs: { min: 1000, max: 600_000, int: true },
  pdfBackendRouterMaxPages: { min: 1, max: 1000, int: true },
  pdfBackendRouterMaxPairs: { min: 1, max: 100_000, int: true },
  pdfBackendRouterMaxTextPreviewChars: { min: 256, max: 200_000, int: true },
  capturePageScreenshotQuality: { min: 1, max: 100, int: true },
  capturePageScreenshotMaxBytes: { min: 1024, max: 100_000_000, int: true },
  articleExtractorMinChars: { min: 50, max: 200_000, int: true },
  articleExtractorMinScore: { min: 1, max: 100, int: true },
  articleExtractorMaxChars: { min: 256, max: 500_000, int: true },
  staticDomTargetMatchThreshold: { min: 0, max: 1 },
  staticDomMaxEvidenceSnippets: { min: 10, max: 500, int: true },
  structuredMetadataExtructTimeoutMs: { min: 250, max: 15_000, int: true },
  structuredMetadataExtructMaxItemsPerSurface: { min: 1, max: 1000, int: true },
  structuredMetadataExtructCacheLimit: { min: 32, max: 5000, int: true },
  domSnippetMaxChars: { min: 600, max: 20_000, int: true },
  llmExtractionCacheTtlMs: { min: 60_000, max: 31_536_000_000, int: true },
  llmMaxCallsPerProductTotal: { min: 1, max: 100, int: true },
  llmMaxCallsPerProductFast: { min: 0, max: 100, int: true },
  consensusMethodWeightNetworkJson: { min: 0, max: 2 },
  consensusMethodWeightAdapterApi: { min: 0, max: 2 },
  consensusMethodWeightStructuredMeta: { min: 0, max: 2 },
  consensusMethodWeightPdf: { min: 0, max: 2 },
  consensusMethodWeightTableKv: { min: 0, max: 2 },
  consensusMethodWeightDom: { min: 0, max: 2 },
  consensusMethodWeightLlmExtractBase: { min: 0, max: 2 },
  consensusPolicyBonus: { min: -5, max: 5 },
  consensusWeightedMajorityThreshold: { min: 1, max: 10 },
  consensusStrictAcceptanceDomainCount: { min: 1, max: 50, int: true },
  consensusRelaxedAcceptanceDomainCount: { min: 1, max: 50, int: true },
  consensusInstrumentedFieldThreshold: { min: 1, max: 50, int: true },
  consensusConfidenceScoringBase: { min: 0, max: 1 },
  consensusPassTargetIdentityStrong: { min: 1, max: 50, int: true },
  consensusPassTargetNormal: { min: 1, max: 50, int: true },
  retrievalTierWeightTier1: { min: 0, max: 10 },
  retrievalTierWeightTier2: { min: 0, max: 10 },
  retrievalTierWeightTier3: { min: 0, max: 10 },
  retrievalTierWeightTier4: { min: 0, max: 10 },
  retrievalTierWeightTier5: { min: 0, max: 10 },
  retrievalDocKindWeightManualPdf: { min: 0, max: 10 },
  retrievalDocKindWeightSpecPdf: { min: 0, max: 10 },
  retrievalDocKindWeightSupport: { min: 0, max: 10 },
  retrievalDocKindWeightLabReview: { min: 0, max: 10 },
  retrievalDocKindWeightProductPage: { min: 0, max: 10 },
  retrievalDocKindWeightOther: { min: 0, max: 10 },
  retrievalMethodWeightTable: { min: 0, max: 10 },
  retrievalMethodWeightKv: { min: 0, max: 10 },
  retrievalMethodWeightJsonLd: { min: 0, max: 10 },
  retrievalMethodWeightLlmExtract: { min: 0, max: 10 },
  retrievalMethodWeightHelperSupportive: { min: 0, max: 10 },
  retrievalAnchorScorePerMatch: { min: 0, max: 2 },
  retrievalIdentityScorePerMatch: { min: 0, max: 2 },
  retrievalUnitMatchBonus: { min: 0, max: 2 },
  retrievalDirectFieldMatchBonus: { min: 0, max: 2 },
  identityGateBaseMatchThreshold: { min: 0, max: 1 },
  qualityGateIdentityThreshold: { min: 0, max: 1 },
  evidenceTextMaxChars: { min: 200, max: 200_000, int: true },
  llmExtractMaxTokens: { min: 128, max: 262_144, int: true },
  llmExtractMaxSnippetsPerBatch: { min: 1, max: 50, int: true },
  llmExtractMaxSnippetChars: { min: 100, max: 200_000, int: true },
  llmExtractReasoningBudget: { min: 128, max: 262_144, int: true },
  llmReasoningBudget: { min: 128, max: 262_144, int: true },
  llmMonthlyBudgetUsd: { min: 0, max: 100_000 },
  llmPerProductBudgetUsd: { min: 0, max: 1000 },
  llmMaxCallsPerRound: { min: 1, max: 200, int: true },
  llmMaxOutputTokens: { min: 128, max: 262_144, int: true },
  llmVerifySampleRate: { min: 1, max: 1000, int: true },
  llmMaxBatchesPerProduct: { min: 1, max: 100, int: true },
  llmMaxEvidenceChars: { min: 1000, max: 500_000, int: true },
  llmMaxTokens: { min: 128, max: 262_144, int: true },
  llmTimeoutMs: { min: 1000, max: 600_000, int: true },
  llmCostInputPer1M: { min: 0, max: 1000 },
  llmCostOutputPer1M: { min: 0, max: 1000 },
  llmCostCachedInputPer1M: { min: 0, max: 1000 },
  maxManufacturerUrlsPerProduct: { min: 1, max: 1000, int: true },
  maxManufacturerPagesPerDomain: { min: 1, max: 200, int: true },
  manufacturerReserveUrls: { min: 0, max: 1000, int: true },
  maxHypothesisItems: { min: 1, max: 1000, int: true },
  hypothesisAutoFollowupRounds: { min: 0, max: 10, int: true },
  hypothesisFollowupUrlsPerRound: { min: 1, max: 200, int: true },
  runtimeTraceFetchRing: { min: 10, max: 2000, int: true },
  runtimeTraceLlmRing: { min: 10, max: 2000, int: true },
  daemonConcurrency: { min: 1, max: 128, int: true },
  daemonGracefulShutdownTimeoutMs: { min: 1000, max: 600_000, int: true },
  importsPollSeconds: { min: 1, max: 3600, int: true },
  indexingResumeSeedLimit: { min: 1, max: 10_000, int: true },
  indexingResumePersistLimit: { min: 1, max: 100_000, int: true },
  scannedPdfOcrMaxPages: { min: 1, max: 500, int: true },
  scannedPdfOcrMaxPairs: { min: 1, max: 500, int: true },
  scannedPdfOcrMinCharsPerPage: { min: 0, max: 50_000, int: true },
  scannedPdfOcrMinLinesPerPage: { min: 0, max: 10_000, int: true },
  scannedPdfOcrMinConfidence: { min: 0, max: 1 },
  resumeWindowHours: { min: 0, max: 8_760, int: true },
  reextractAfterHours: { min: 0, max: 8_760, int: true },
  reCrawlStaleAfterDays: { min: 1, max: 3650, int: true },
};

export function toRuntimeDraft(defaults: RuntimeSettingDefaults): RuntimeDraft {
  const { runtimeAutoSaveEnabled: _runtimeAutoSaveEnabled, ...draft } = defaults;
  return draft;
}

export function runtimeDraftEqual(a: RuntimeDraft, b: RuntimeDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function parseBoundedNumber(value: unknown, fallback: number, bounds: NumberBound): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
  return bounds.int ? Math.round(clamped) : clamped;
}
