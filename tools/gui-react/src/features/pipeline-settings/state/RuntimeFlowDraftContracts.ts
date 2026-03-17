import { type RuntimeSettingDefaults } from '../../../stores/settingsManifest';

export const SEARCH_PROVIDER_OPTIONS = ['searxng', 'bing', 'google', 'dual'] as const;
export const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;
export const RESUME_MODE_OPTIONS = ['auto', 'force_resume', 'start_over'] as const;
export const REPAIR_DEDUPE_RULE_OPTIONS = ['domain_once', 'domain_and_status', 'none'] as const;
export type RuntimeDraft = Omit<RuntimeSettingDefaults, 'runtimeAutoSaveEnabled'>;

export interface NumberBound {
  min: number;
  max: number;
  int?: boolean;
}

export const RUNTIME_NUMBER_BOUNDS: Record<
  | 'fetchConcurrency'
  | 'perHostMinDelayMs'
  | 'searxngMinQueryIntervalMs'
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
  | 'domSnippetMaxChars'
  | 'llmExtractionCacheTtlMs'
  | 'llmMaxCallsPerProductTotal'
  | 'llmMaxCallsPerProductFast'
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
  | 'maxHypothesisItems'
  | 'hypothesisAutoFollowupRounds'
  | 'hypothesisFollowupUrlsPerRound'
  | 'runtimeTraceFetchRing'
  | 'runtimeTraceLlmRing'
  | 'daemonConcurrency'
  | 'importsPollSeconds'
  | 'indexingResumeSeedLimit'
  | 'indexingResumePersistLimit'
  | 'fieldRewardHalfLifeDays'
  | 'driftPollSeconds'
  | 'driftScanMaxProducts'
  | 'reCrawlStaleAfterDays'
  | 'scannedPdfOcrMaxPages'
  | 'scannedPdfOcrMaxPairs'
  | 'scannedPdfOcrMinCharsPerPage'
  | 'scannedPdfOcrMinLinesPerPage'
  | 'scannedPdfOcrMinConfidence'
  | 'llmMaxOutputTokensReasoningFallback'
  | 'resumeWindowHours'
  | 'reextractAfterHours'
  | 'fetchBudgetMs',
  NumberBound
> = {
  fetchBudgetMs: { min: 5000, max: 300_000, int: true },
  fetchConcurrency: { min: 1, max: 128, int: true },
  perHostMinDelayMs: { min: 0, max: 120_000, int: true },
  searxngMinQueryIntervalMs: { min: 0, max: 30_000, int: true },
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
  fieldRewardHalfLifeDays: { min: 1, max: 365, int: true },
  driftPollSeconds: { min: 60, max: 604_800, int: true },
  driftScanMaxProducts: { min: 1, max: 10_000, int: true },
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
  domSnippetMaxChars: { min: 600, max: 20_000, int: true },
  llmExtractionCacheTtlMs: { min: 60_000, max: 31_536_000_000, int: true },
  llmMaxCallsPerProductTotal: { min: 1, max: 100, int: true },
  llmMaxCallsPerProductFast: { min: 0, max: 100, int: true },
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
  maxHypothesisItems: { min: 1, max: 1000, int: true },
  hypothesisAutoFollowupRounds: { min: 0, max: 10, int: true },
  hypothesisFollowupUrlsPerRound: { min: 1, max: 200, int: true },
  runtimeTraceFetchRing: { min: 10, max: 2000, int: true },
  runtimeTraceLlmRing: { min: 10, max: 2000, int: true },
  daemonConcurrency: { min: 1, max: 128, int: true },
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
  llmMaxOutputTokensReasoningFallback: { min: 128, max: 262_144, int: true },
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
