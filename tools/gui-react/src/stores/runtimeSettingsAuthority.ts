import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { autoSaveFingerprint } from './autoSaveFingerprint';
import { RUNTIME_SETTING_DEFAULTS, SETTINGS_AUTOSAVE_DEBOUNCE_MS } from './settingsManifest';
import { createSettingsOptimisticMutationContract } from './settingsMutationContract';
import { publishSettingsPropagation } from './settingsPropagationContract';

export type RuntimeSettings = Record<string, string | number | boolean>;

type RuntimeSettingsPersistResult = {
  ok: boolean;
  applied: RuntimeSettings;
  rejected: Record<string, string>;
};

interface RuntimeSettingsAuthorityOptions {
  payload: RuntimeSettings;
  dirty: boolean;
  autoSaveEnabled: boolean;
  enabled?: boolean;
  onPersisted?: (result: RuntimeSettingsPersistResult) => void;
  onError?: (error: Error | unknown) => void;
}

interface RuntimeSettingsAuthorityResult {
  settings: RuntimeSettings | undefined;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<RuntimeSettings | undefined>;
  saveNow: () => void;
}

interface RuntimeSettingsReaderOptions {
  enabled?: boolean;
}

interface RuntimeSettingsReaderResult {
  settings: RuntimeSettings | undefined;
  isLoading: boolean;
  reload: () => Promise<RuntimeSettings | undefined>;
}

export const RUNTIME_SETTINGS_QUERY_KEY = ['runtime-settings'] as const;

const RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS = [
  'fetchConcurrency',
  'perHostMinDelayMs',
  'crawleeRequestHandlerTimeoutSecs',
  'dynamicFetchRetryBudget',
  'dynamicFetchRetryBackoffMs',
  'fetchSchedulerMaxRetries',
  'fetchSchedulerFallbackWaitMs',
  'pageGotoTimeoutMs',
  'pageNetworkIdleTimeoutMs',
  'postLoadWaitMs',
  'frontierQueryCooldownSeconds',
  'frontierCooldown404Seconds',
  'frontierCooldown404RepeatSeconds',
  'frontierCooldown410Seconds',
  'frontierCooldownTimeoutSeconds',
  'frontierCooldown403BaseSeconds',
  'frontierCooldown429BaseSeconds',
  'frontierBackoffMaxExponent',
  'frontierPathPenaltyNotfoundThreshold',
  'frontierBlockedDomainThreshold',
  'autoScrollPasses',
  'autoScrollDelayMs',
  'maxGraphqlReplays',
  'maxNetworkResponsesPerPage',
  'robotsTxtTimeoutMs',
  'endpointSignalLimit',
  'endpointSuggestionLimit',
  'endpointNetworkScanLimit',
  'discoveryMaxQueries',
  'discoveryResultsPerQuery',
  'discoveryMaxDiscovered',
  'discoveryQueryConcurrency',
  'maxUrlsPerProduct',
  'maxCandidateUrls',
  'maxPagesPerDomain',
  'uberMaxUrlsPerProduct',
  'uberMaxUrlsPerDomain',
  'maxRunSeconds',
  'maxJsonBytes',
  'maxPdfBytes',
  'pdfBackendRouterTimeoutMs',
  'pdfBackendRouterMaxPages',
  'pdfBackendRouterMaxPairs',
  'pdfBackendRouterMaxTextPreviewChars',
  'capturePageScreenshotQuality',
  'capturePageScreenshotMaxBytes',
  'visualAssetCaptureMaxPerSource',
  'visualAssetRetentionDays',
  'visualAssetReviewLgMaxSide',
  'visualAssetReviewSmMaxSide',
  'visualAssetReviewLgQuality',
  'visualAssetReviewSmQuality',
  'visualAssetRegionCropMaxSide',
  'visualAssetRegionCropQuality',
  'visualAssetLlmMaxBytes',
  'visualAssetMinWidth',
  'visualAssetMinHeight',
  'visualAssetMinSharpness',
  'visualAssetMinEntropy',
  'visualAssetMaxPhashDistance',
  'articleExtractorMinChars',
  'articleExtractorMinScore',
  'articleExtractorMaxChars',
  'staticDomTargetMatchThreshold',
  'staticDomMaxEvidenceSnippets',
  'structuredMetadataExtructTimeoutMs',
  'structuredMetadataExtructMaxItemsPerSurface',
  'structuredMetadataExtructCacheLimit',
  'domSnippetMaxChars',
  'llmExtractionCacheTtlMs',
  'llmMaxCallsPerProductTotal',
  'llmMaxCallsPerProductFast',
  'needsetEvidenceDecayDays',
  'needsetEvidenceDecayFloor',
  'needsetRequiredWeightIdentity',
  'needsetRequiredWeightCritical',
  'needsetRequiredWeightRequired',
  'needsetRequiredWeightExpected',
  'needsetRequiredWeightOptional',
  'needsetMissingMultiplier',
  'needsetTierDeficitMultiplier',
  'needsetMinRefsDeficitMultiplier',
  'needsetConflictMultiplier',
  'needsetIdentityLockThreshold',
  'needsetIdentityProvisionalThreshold',
  'needsetDefaultIdentityAuditLimit',
  'consensusMethodWeightNetworkJson',
  'consensusMethodWeightAdapterApi',
  'consensusMethodWeightStructuredMeta',
  'consensusMethodWeightPdf',
  'consensusMethodWeightTableKv',
  'consensusMethodWeightDom',
  'consensusMethodWeightLlmExtractBase',
  'consensusPolicyBonus',
  'consensusWeightedMajorityThreshold',
  'consensusStrictAcceptanceDomainCount',
  'consensusRelaxedAcceptanceDomainCount',
  'consensusInstrumentedFieldThreshold',
  'consensusConfidenceScoringBase',
  'consensusPassTargetIdentityStrong',
  'consensusPassTargetNormal',
  'retrievalTierWeightTier1',
  'retrievalTierWeightTier2',
  'retrievalTierWeightTier3',
  'retrievalTierWeightTier4',
  'retrievalTierWeightTier5',
  'retrievalDocKindWeightManualPdf',
  'retrievalDocKindWeightSpecPdf',
  'retrievalDocKindWeightSupport',
  'retrievalDocKindWeightLabReview',
  'retrievalDocKindWeightProductPage',
  'retrievalDocKindWeightOther',
  'retrievalMethodWeightTable',
  'retrievalMethodWeightKv',
  'retrievalMethodWeightJsonLd',
  'retrievalMethodWeightLlmExtract',
  'retrievalMethodWeightHelperSupportive',
  'retrievalAnchorScorePerMatch',
  'retrievalIdentityScorePerMatch',
  'retrievalUnitMatchBonus',
  'retrievalDirectFieldMatchBonus',
  'evidenceTextMaxChars',
  'llmExtractMaxTokens',
  'llmExtractMaxSnippetsPerBatch',
  'llmExtractMaxSnippetChars',
  'llmExtractReasoningBudget',
  'llmReasoningBudget',
  'llmMonthlyBudgetUsd',
  'llmPerProductBudgetUsd',
  'llmMaxCallsPerRound',
  'llmMaxOutputTokens',
  'llmVerifySampleRate',
  'llmMaxBatchesPerProduct',
  'llmMaxEvidenceChars',
  'llmMaxTokens',
  'llmTimeoutMs',
  'llmCostInputPer1M',
  'llmCostOutputPer1M',
  'llmCostCachedInputPer1M',
  'maxManufacturerUrlsPerProduct',
  'maxManufacturerPagesPerDomain',
  'manufacturerReserveUrls',
  'maxHypothesisItems',
  'hypothesisAutoFollowupRounds',
  'hypothesisFollowupUrlsPerRound',
  'learningConfidenceThreshold',
  'componentLexiconDecayDays',
  'componentLexiconExpireDays',
  'fieldAnchorsDecayDays',
  'urlMemoryDecayDays',
  'cseRescueRequiredIteration',
  'duckduckgoTimeoutMs',
  'runtimeScreencastFps',
  'runtimeScreencastQuality',
  'runtimeScreencastMaxWidth',
  'runtimeScreencastMaxHeight',
  'runtimeTraceFetchRing',
  'runtimeTraceLlmRing',
  'daemonConcurrency',
  'daemonGracefulShutdownTimeoutMs',
  'importsPollSeconds',
  'convergenceIdentityFailFastRounds',
  'identityGatePublishThreshold',
  'identityGateBaseMatchThreshold',
  'identityGateEasyAmbiguityReduction',
  'identityGateMediumAmbiguityReduction',
  'identityGateHardAmbiguityReduction',
  'identityGateVeryHardAmbiguityIncrease',
  'identityGateExtraHardAmbiguityIncrease',
  'identityGateMissingStrongIdPenalty',
  'identityGateHardMissingStrongIdIncrease',
  'identityGateVeryHardMissingStrongIdIncrease',
  'identityGateExtraHardMissingStrongIdIncrease',
  'identityGateNumericTokenBoost',
  'identityGateNumericRangeThreshold',
  'qualityGateIdentityThreshold',
  'indexingResumeSeedLimit',
  'indexingResumePersistLimit',
  'helperSupportiveMaxSources',
  'helperActiveSyncLimit',
  'fieldRewardHalfLifeDays',
  'driftPollSeconds',
  'driftScanMaxProducts',
  'reCrawlStaleAfterDays',
  'aggressiveConfidenceThreshold',
  'aggressiveMaxSearchQueries',
  'aggressiveEvidenceAuditBatchSize',
  'aggressiveMaxTimePerProductMs',
  'aggressiveThoroughFromRound',
  'aggressiveRound1MaxUrls',
  'aggressiveRound1MaxCandidateUrls',
  'aggressiveLlmMaxCallsPerRound',
  'aggressiveLlmMaxCallsPerProductTotal',
  'aggressiveLlmTargetMaxFields',
  'aggressiveLlmDiscoveryPasses',
  'aggressiveLlmDiscoveryQueryCap',
  'uberMaxRounds',
  'cortexSyncTimeoutMs',
  'cortexAsyncPollIntervalMs',
  'cortexAsyncMaxWaitMs',
  'cortexEnsureReadyTimeoutMs',
  'cortexStartReadyTimeoutMs',
  'cortexFailureThreshold',
  'cortexCircuitOpenMs',
  'cortexEscalateConfidenceLt',
  'cortexMaxDeepFieldsPerProduct',
  'scannedPdfOcrMaxPages',
  'scannedPdfOcrMaxPairs',
  'scannedPdfOcrMinCharsPerPage',
  'scannedPdfOcrMinLinesPerPage',
  'scannedPdfOcrMinConfidence',
  'resumeWindowHours',
  'reextractAfterHours',
] as const;

type RuntimeSettingsNumericBaselineKey = (typeof RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS)[number];
type RuntimeSettingsNumericSource = Partial<Record<RuntimeSettingsNumericBaselineKey, unknown>>;

export type RuntimeSettingsNumericBaseline = Record<RuntimeSettingsNumericBaselineKey, number>;

export const RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS = Object.freeze({
  fetchConcurrency: RUNTIME_SETTING_DEFAULTS.fetchConcurrency,
  perHostMinDelayMs: RUNTIME_SETTING_DEFAULTS.perHostMinDelayMs,
  crawleeRequestHandlerTimeoutSecs: RUNTIME_SETTING_DEFAULTS.crawleeRequestHandlerTimeoutSecs,
  dynamicFetchRetryBudget: RUNTIME_SETTING_DEFAULTS.dynamicFetchRetryBudget,
  dynamicFetchRetryBackoffMs: RUNTIME_SETTING_DEFAULTS.dynamicFetchRetryBackoffMs,
  fetchSchedulerMaxRetries: RUNTIME_SETTING_DEFAULTS.fetchSchedulerMaxRetries,
  fetchSchedulerFallbackWaitMs: RUNTIME_SETTING_DEFAULTS.fetchSchedulerFallbackWaitMs,
  pageGotoTimeoutMs: RUNTIME_SETTING_DEFAULTS.pageGotoTimeoutMs,
  pageNetworkIdleTimeoutMs: RUNTIME_SETTING_DEFAULTS.pageNetworkIdleTimeoutMs,
  postLoadWaitMs: RUNTIME_SETTING_DEFAULTS.postLoadWaitMs,
  frontierQueryCooldownSeconds: RUNTIME_SETTING_DEFAULTS.frontierQueryCooldownSeconds,
  frontierCooldown404Seconds: RUNTIME_SETTING_DEFAULTS.frontierCooldown404Seconds,
  frontierCooldown404RepeatSeconds: RUNTIME_SETTING_DEFAULTS.frontierCooldown404RepeatSeconds,
  frontierCooldown410Seconds: RUNTIME_SETTING_DEFAULTS.frontierCooldown410Seconds,
  frontierCooldownTimeoutSeconds: RUNTIME_SETTING_DEFAULTS.frontierCooldownTimeoutSeconds,
  frontierCooldown403BaseSeconds: RUNTIME_SETTING_DEFAULTS.frontierCooldown403BaseSeconds,
  frontierCooldown429BaseSeconds: RUNTIME_SETTING_DEFAULTS.frontierCooldown429BaseSeconds,
  frontierBackoffMaxExponent: RUNTIME_SETTING_DEFAULTS.frontierBackoffMaxExponent,
  frontierPathPenaltyNotfoundThreshold: RUNTIME_SETTING_DEFAULTS.frontierPathPenaltyNotfoundThreshold,
  frontierBlockedDomainThreshold: RUNTIME_SETTING_DEFAULTS.frontierBlockedDomainThreshold,
  autoScrollPasses: RUNTIME_SETTING_DEFAULTS.autoScrollPasses,
  autoScrollDelayMs: RUNTIME_SETTING_DEFAULTS.autoScrollDelayMs,
  maxGraphqlReplays: RUNTIME_SETTING_DEFAULTS.maxGraphqlReplays,
  maxNetworkResponsesPerPage: RUNTIME_SETTING_DEFAULTS.maxNetworkResponsesPerPage,
  robotsTxtTimeoutMs: RUNTIME_SETTING_DEFAULTS.robotsTxtTimeoutMs,
  endpointSignalLimit: RUNTIME_SETTING_DEFAULTS.endpointSignalLimit,
  endpointSuggestionLimit: RUNTIME_SETTING_DEFAULTS.endpointSuggestionLimit,
  endpointNetworkScanLimit: RUNTIME_SETTING_DEFAULTS.endpointNetworkScanLimit,
  discoveryMaxQueries: RUNTIME_SETTING_DEFAULTS.discoveryMaxQueries,
  discoveryResultsPerQuery: RUNTIME_SETTING_DEFAULTS.discoveryResultsPerQuery,
  discoveryMaxDiscovered: RUNTIME_SETTING_DEFAULTS.discoveryMaxDiscovered,
  discoveryQueryConcurrency: RUNTIME_SETTING_DEFAULTS.discoveryQueryConcurrency,
  maxUrlsPerProduct: RUNTIME_SETTING_DEFAULTS.maxUrlsPerProduct,
  maxCandidateUrls: RUNTIME_SETTING_DEFAULTS.maxCandidateUrls,
  maxPagesPerDomain: RUNTIME_SETTING_DEFAULTS.maxPagesPerDomain,
  uberMaxUrlsPerProduct: RUNTIME_SETTING_DEFAULTS.uberMaxUrlsPerProduct,
  uberMaxUrlsPerDomain: RUNTIME_SETTING_DEFAULTS.uberMaxUrlsPerDomain,
  maxRunSeconds: RUNTIME_SETTING_DEFAULTS.maxRunSeconds,
  maxJsonBytes: RUNTIME_SETTING_DEFAULTS.maxJsonBytes,
  maxPdfBytes: RUNTIME_SETTING_DEFAULTS.maxPdfBytes,
  pdfBackendRouterTimeoutMs: RUNTIME_SETTING_DEFAULTS.pdfBackendRouterTimeoutMs,
  pdfBackendRouterMaxPages: RUNTIME_SETTING_DEFAULTS.pdfBackendRouterMaxPages,
  pdfBackendRouterMaxPairs: RUNTIME_SETTING_DEFAULTS.pdfBackendRouterMaxPairs,
  pdfBackendRouterMaxTextPreviewChars: RUNTIME_SETTING_DEFAULTS.pdfBackendRouterMaxTextPreviewChars,
  capturePageScreenshotQuality: RUNTIME_SETTING_DEFAULTS.capturePageScreenshotQuality,
  capturePageScreenshotMaxBytes: RUNTIME_SETTING_DEFAULTS.capturePageScreenshotMaxBytes,
  visualAssetCaptureMaxPerSource: RUNTIME_SETTING_DEFAULTS.visualAssetCaptureMaxPerSource,
  visualAssetRetentionDays: RUNTIME_SETTING_DEFAULTS.visualAssetRetentionDays,
  visualAssetReviewLgMaxSide: RUNTIME_SETTING_DEFAULTS.visualAssetReviewLgMaxSide,
  visualAssetReviewSmMaxSide: RUNTIME_SETTING_DEFAULTS.visualAssetReviewSmMaxSide,
  visualAssetReviewLgQuality: RUNTIME_SETTING_DEFAULTS.visualAssetReviewLgQuality,
  visualAssetReviewSmQuality: RUNTIME_SETTING_DEFAULTS.visualAssetReviewSmQuality,
  visualAssetRegionCropMaxSide: RUNTIME_SETTING_DEFAULTS.visualAssetRegionCropMaxSide,
  visualAssetRegionCropQuality: RUNTIME_SETTING_DEFAULTS.visualAssetRegionCropQuality,
  visualAssetLlmMaxBytes: RUNTIME_SETTING_DEFAULTS.visualAssetLlmMaxBytes,
  visualAssetMinWidth: RUNTIME_SETTING_DEFAULTS.visualAssetMinWidth,
  visualAssetMinHeight: RUNTIME_SETTING_DEFAULTS.visualAssetMinHeight,
  visualAssetMinSharpness: RUNTIME_SETTING_DEFAULTS.visualAssetMinSharpness,
  visualAssetMinEntropy: RUNTIME_SETTING_DEFAULTS.visualAssetMinEntropy,
  visualAssetMaxPhashDistance: RUNTIME_SETTING_DEFAULTS.visualAssetMaxPhashDistance,
  articleExtractorMinChars: RUNTIME_SETTING_DEFAULTS.articleExtractorMinChars,
  articleExtractorMinScore: RUNTIME_SETTING_DEFAULTS.articleExtractorMinScore,
  articleExtractorMaxChars: RUNTIME_SETTING_DEFAULTS.articleExtractorMaxChars,
  staticDomTargetMatchThreshold: RUNTIME_SETTING_DEFAULTS.staticDomTargetMatchThreshold,
  staticDomMaxEvidenceSnippets: RUNTIME_SETTING_DEFAULTS.staticDomMaxEvidenceSnippets,
  structuredMetadataExtructTimeoutMs: RUNTIME_SETTING_DEFAULTS.structuredMetadataExtructTimeoutMs,
  structuredMetadataExtructMaxItemsPerSurface: RUNTIME_SETTING_DEFAULTS.structuredMetadataExtructMaxItemsPerSurface,
  structuredMetadataExtructCacheLimit: RUNTIME_SETTING_DEFAULTS.structuredMetadataExtructCacheLimit,
  domSnippetMaxChars: RUNTIME_SETTING_DEFAULTS.domSnippetMaxChars,
  llmExtractionCacheTtlMs: RUNTIME_SETTING_DEFAULTS.llmExtractionCacheTtlMs,
  llmMaxCallsPerProductTotal: RUNTIME_SETTING_DEFAULTS.llmMaxCallsPerProductTotal,
  llmMaxCallsPerProductFast: RUNTIME_SETTING_DEFAULTS.llmMaxCallsPerProductFast,
  needsetEvidenceDecayDays: RUNTIME_SETTING_DEFAULTS.needsetEvidenceDecayDays,
  needsetEvidenceDecayFloor: RUNTIME_SETTING_DEFAULTS.needsetEvidenceDecayFloor,
  needsetRequiredWeightIdentity: RUNTIME_SETTING_DEFAULTS.needsetRequiredWeightIdentity,
  needsetRequiredWeightCritical: RUNTIME_SETTING_DEFAULTS.needsetRequiredWeightCritical,
  needsetRequiredWeightRequired: RUNTIME_SETTING_DEFAULTS.needsetRequiredWeightRequired,
  needsetRequiredWeightExpected: RUNTIME_SETTING_DEFAULTS.needsetRequiredWeightExpected,
  needsetRequiredWeightOptional: RUNTIME_SETTING_DEFAULTS.needsetRequiredWeightOptional,
  needsetMissingMultiplier: RUNTIME_SETTING_DEFAULTS.needsetMissingMultiplier,
  needsetTierDeficitMultiplier: RUNTIME_SETTING_DEFAULTS.needsetTierDeficitMultiplier,
  needsetMinRefsDeficitMultiplier: RUNTIME_SETTING_DEFAULTS.needsetMinRefsDeficitMultiplier,
  needsetConflictMultiplier: RUNTIME_SETTING_DEFAULTS.needsetConflictMultiplier,
  needsetIdentityLockThreshold: RUNTIME_SETTING_DEFAULTS.needsetIdentityLockThreshold,
  needsetIdentityProvisionalThreshold: RUNTIME_SETTING_DEFAULTS.needsetIdentityProvisionalThreshold,
  needsetDefaultIdentityAuditLimit: RUNTIME_SETTING_DEFAULTS.needsetDefaultIdentityAuditLimit,
  consensusMethodWeightNetworkJson: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightNetworkJson,
  consensusMethodWeightAdapterApi: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightAdapterApi,
  consensusMethodWeightStructuredMeta: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightStructuredMeta,
  consensusMethodWeightPdf: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightPdf,
  consensusMethodWeightTableKv: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightTableKv,
  consensusMethodWeightDom: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightDom,
  consensusMethodWeightLlmExtractBase: RUNTIME_SETTING_DEFAULTS.consensusMethodWeightLlmExtractBase,
  consensusPolicyBonus: RUNTIME_SETTING_DEFAULTS.consensusPolicyBonus,
  consensusWeightedMajorityThreshold: RUNTIME_SETTING_DEFAULTS.consensusWeightedMajorityThreshold,
  consensusStrictAcceptanceDomainCount: RUNTIME_SETTING_DEFAULTS.consensusStrictAcceptanceDomainCount,
  consensusRelaxedAcceptanceDomainCount: RUNTIME_SETTING_DEFAULTS.consensusRelaxedAcceptanceDomainCount,
  consensusInstrumentedFieldThreshold: RUNTIME_SETTING_DEFAULTS.consensusInstrumentedFieldThreshold,
  consensusConfidenceScoringBase: RUNTIME_SETTING_DEFAULTS.consensusConfidenceScoringBase,
  consensusPassTargetIdentityStrong: RUNTIME_SETTING_DEFAULTS.consensusPassTargetIdentityStrong,
  consensusPassTargetNormal: RUNTIME_SETTING_DEFAULTS.consensusPassTargetNormal,
  retrievalTierWeightTier1: RUNTIME_SETTING_DEFAULTS.retrievalTierWeightTier1,
  retrievalTierWeightTier2: RUNTIME_SETTING_DEFAULTS.retrievalTierWeightTier2,
  retrievalTierWeightTier3: RUNTIME_SETTING_DEFAULTS.retrievalTierWeightTier3,
  retrievalTierWeightTier4: RUNTIME_SETTING_DEFAULTS.retrievalTierWeightTier4,
  retrievalTierWeightTier5: RUNTIME_SETTING_DEFAULTS.retrievalTierWeightTier5,
  retrievalDocKindWeightManualPdf: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightManualPdf,
  retrievalDocKindWeightSpecPdf: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightSpecPdf,
  retrievalDocKindWeightSupport: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightSupport,
  retrievalDocKindWeightLabReview: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightLabReview,
  retrievalDocKindWeightProductPage: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightProductPage,
  retrievalDocKindWeightOther: RUNTIME_SETTING_DEFAULTS.retrievalDocKindWeightOther,
  retrievalMethodWeightTable: RUNTIME_SETTING_DEFAULTS.retrievalMethodWeightTable,
  retrievalMethodWeightKv: RUNTIME_SETTING_DEFAULTS.retrievalMethodWeightKv,
  retrievalMethodWeightJsonLd: RUNTIME_SETTING_DEFAULTS.retrievalMethodWeightJsonLd,
  retrievalMethodWeightLlmExtract: RUNTIME_SETTING_DEFAULTS.retrievalMethodWeightLlmExtract,
  retrievalMethodWeightHelperSupportive: RUNTIME_SETTING_DEFAULTS.retrievalMethodWeightHelperSupportive,
  retrievalAnchorScorePerMatch: RUNTIME_SETTING_DEFAULTS.retrievalAnchorScorePerMatch,
  retrievalIdentityScorePerMatch: RUNTIME_SETTING_DEFAULTS.retrievalIdentityScorePerMatch,
  retrievalUnitMatchBonus: RUNTIME_SETTING_DEFAULTS.retrievalUnitMatchBonus,
  retrievalDirectFieldMatchBonus: RUNTIME_SETTING_DEFAULTS.retrievalDirectFieldMatchBonus,
  evidenceTextMaxChars: RUNTIME_SETTING_DEFAULTS.evidenceTextMaxChars,
  llmExtractMaxTokens: RUNTIME_SETTING_DEFAULTS.llmExtractMaxTokens,
  llmExtractMaxSnippetsPerBatch: RUNTIME_SETTING_DEFAULTS.llmExtractMaxSnippetsPerBatch,
  llmExtractMaxSnippetChars: RUNTIME_SETTING_DEFAULTS.llmExtractMaxSnippetChars,
  llmExtractReasoningBudget: RUNTIME_SETTING_DEFAULTS.llmExtractReasoningBudget,
  llmReasoningBudget: RUNTIME_SETTING_DEFAULTS.llmReasoningBudget,
  llmMonthlyBudgetUsd: RUNTIME_SETTING_DEFAULTS.llmMonthlyBudgetUsd,
  llmPerProductBudgetUsd: RUNTIME_SETTING_DEFAULTS.llmPerProductBudgetUsd,
  llmMaxCallsPerRound: RUNTIME_SETTING_DEFAULTS.llmMaxCallsPerRound,
  llmMaxOutputTokens: RUNTIME_SETTING_DEFAULTS.llmMaxOutputTokens,
  llmVerifySampleRate: RUNTIME_SETTING_DEFAULTS.llmVerifySampleRate,
  llmMaxBatchesPerProduct: RUNTIME_SETTING_DEFAULTS.llmMaxBatchesPerProduct,
  llmMaxEvidenceChars: RUNTIME_SETTING_DEFAULTS.llmMaxEvidenceChars,
  llmMaxTokens: RUNTIME_SETTING_DEFAULTS.llmMaxTokens,
  llmTimeoutMs: RUNTIME_SETTING_DEFAULTS.llmTimeoutMs,
  llmCostInputPer1M: RUNTIME_SETTING_DEFAULTS.llmCostInputPer1M,
  llmCostOutputPer1M: RUNTIME_SETTING_DEFAULTS.llmCostOutputPer1M,
  llmCostCachedInputPer1M: RUNTIME_SETTING_DEFAULTS.llmCostCachedInputPer1M,
  maxManufacturerUrlsPerProduct: RUNTIME_SETTING_DEFAULTS.maxManufacturerUrlsPerProduct,
  maxManufacturerPagesPerDomain: RUNTIME_SETTING_DEFAULTS.maxManufacturerPagesPerDomain,
  manufacturerReserveUrls: RUNTIME_SETTING_DEFAULTS.manufacturerReserveUrls,
  maxHypothesisItems: RUNTIME_SETTING_DEFAULTS.maxHypothesisItems,
  hypothesisAutoFollowupRounds: RUNTIME_SETTING_DEFAULTS.hypothesisAutoFollowupRounds,
  hypothesisFollowupUrlsPerRound: RUNTIME_SETTING_DEFAULTS.hypothesisFollowupUrlsPerRound,
  learningConfidenceThreshold: RUNTIME_SETTING_DEFAULTS.learningConfidenceThreshold,
  componentLexiconDecayDays: RUNTIME_SETTING_DEFAULTS.componentLexiconDecayDays,
  componentLexiconExpireDays: RUNTIME_SETTING_DEFAULTS.componentLexiconExpireDays,
  fieldAnchorsDecayDays: RUNTIME_SETTING_DEFAULTS.fieldAnchorsDecayDays,
  urlMemoryDecayDays: RUNTIME_SETTING_DEFAULTS.urlMemoryDecayDays,
  cseRescueRequiredIteration: RUNTIME_SETTING_DEFAULTS.cseRescueRequiredIteration,
  duckduckgoTimeoutMs: RUNTIME_SETTING_DEFAULTS.duckduckgoTimeoutMs,
  runtimeScreencastFps: RUNTIME_SETTING_DEFAULTS.runtimeScreencastFps,
  runtimeScreencastQuality: RUNTIME_SETTING_DEFAULTS.runtimeScreencastQuality,
  runtimeScreencastMaxWidth: RUNTIME_SETTING_DEFAULTS.runtimeScreencastMaxWidth,
  runtimeScreencastMaxHeight: RUNTIME_SETTING_DEFAULTS.runtimeScreencastMaxHeight,
  runtimeTraceFetchRing: RUNTIME_SETTING_DEFAULTS.runtimeTraceFetchRing,
  runtimeTraceLlmRing: RUNTIME_SETTING_DEFAULTS.runtimeTraceLlmRing,
  daemonConcurrency: RUNTIME_SETTING_DEFAULTS.daemonConcurrency,
  daemonGracefulShutdownTimeoutMs: RUNTIME_SETTING_DEFAULTS.daemonGracefulShutdownTimeoutMs,
  importsPollSeconds: RUNTIME_SETTING_DEFAULTS.importsPollSeconds,
  convergenceIdentityFailFastRounds: RUNTIME_SETTING_DEFAULTS.convergenceIdentityFailFastRounds,
  identityGatePublishThreshold: RUNTIME_SETTING_DEFAULTS.identityGatePublishThreshold,
  identityGateBaseMatchThreshold: RUNTIME_SETTING_DEFAULTS.identityGateBaseMatchThreshold,
  identityGateEasyAmbiguityReduction: RUNTIME_SETTING_DEFAULTS.identityGateEasyAmbiguityReduction,
  identityGateMediumAmbiguityReduction: RUNTIME_SETTING_DEFAULTS.identityGateMediumAmbiguityReduction,
  identityGateHardAmbiguityReduction: RUNTIME_SETTING_DEFAULTS.identityGateHardAmbiguityReduction,
  identityGateVeryHardAmbiguityIncrease: RUNTIME_SETTING_DEFAULTS.identityGateVeryHardAmbiguityIncrease,
  identityGateExtraHardAmbiguityIncrease: RUNTIME_SETTING_DEFAULTS.identityGateExtraHardAmbiguityIncrease,
  identityGateMissingStrongIdPenalty: RUNTIME_SETTING_DEFAULTS.identityGateMissingStrongIdPenalty,
  identityGateHardMissingStrongIdIncrease: RUNTIME_SETTING_DEFAULTS.identityGateHardMissingStrongIdIncrease,
  identityGateVeryHardMissingStrongIdIncrease: RUNTIME_SETTING_DEFAULTS.identityGateVeryHardMissingStrongIdIncrease,
  identityGateExtraHardMissingStrongIdIncrease: RUNTIME_SETTING_DEFAULTS.identityGateExtraHardMissingStrongIdIncrease,
  identityGateNumericTokenBoost: RUNTIME_SETTING_DEFAULTS.identityGateNumericTokenBoost,
  identityGateNumericRangeThreshold: RUNTIME_SETTING_DEFAULTS.identityGateNumericRangeThreshold,
  qualityGateIdentityThreshold: RUNTIME_SETTING_DEFAULTS.qualityGateIdentityThreshold,
  indexingResumeSeedLimit: RUNTIME_SETTING_DEFAULTS.indexingResumeSeedLimit,
  indexingResumePersistLimit: RUNTIME_SETTING_DEFAULTS.indexingResumePersistLimit,
  helperSupportiveMaxSources: RUNTIME_SETTING_DEFAULTS.helperSupportiveMaxSources,
  helperActiveSyncLimit: RUNTIME_SETTING_DEFAULTS.helperActiveSyncLimit,
  fieldRewardHalfLifeDays: RUNTIME_SETTING_DEFAULTS.fieldRewardHalfLifeDays,
  driftPollSeconds: RUNTIME_SETTING_DEFAULTS.driftPollSeconds,
  driftScanMaxProducts: RUNTIME_SETTING_DEFAULTS.driftScanMaxProducts,
  reCrawlStaleAfterDays: RUNTIME_SETTING_DEFAULTS.reCrawlStaleAfterDays,
  aggressiveConfidenceThreshold: RUNTIME_SETTING_DEFAULTS.aggressiveConfidenceThreshold,
  aggressiveMaxSearchQueries: RUNTIME_SETTING_DEFAULTS.aggressiveMaxSearchQueries,
  aggressiveEvidenceAuditBatchSize: RUNTIME_SETTING_DEFAULTS.aggressiveEvidenceAuditBatchSize,
  aggressiveMaxTimePerProductMs: RUNTIME_SETTING_DEFAULTS.aggressiveMaxTimePerProductMs,
  aggressiveThoroughFromRound: RUNTIME_SETTING_DEFAULTS.aggressiveThoroughFromRound,
  aggressiveRound1MaxUrls: RUNTIME_SETTING_DEFAULTS.aggressiveRound1MaxUrls,
  aggressiveRound1MaxCandidateUrls: RUNTIME_SETTING_DEFAULTS.aggressiveRound1MaxCandidateUrls,
  aggressiveLlmMaxCallsPerRound: RUNTIME_SETTING_DEFAULTS.aggressiveLlmMaxCallsPerRound,
  aggressiveLlmMaxCallsPerProductTotal: RUNTIME_SETTING_DEFAULTS.aggressiveLlmMaxCallsPerProductTotal,
  aggressiveLlmTargetMaxFields: RUNTIME_SETTING_DEFAULTS.aggressiveLlmTargetMaxFields,
  aggressiveLlmDiscoveryPasses: RUNTIME_SETTING_DEFAULTS.aggressiveLlmDiscoveryPasses,
  aggressiveLlmDiscoveryQueryCap: RUNTIME_SETTING_DEFAULTS.aggressiveLlmDiscoveryQueryCap,
  uberMaxRounds: RUNTIME_SETTING_DEFAULTS.uberMaxRounds,
  cortexSyncTimeoutMs: RUNTIME_SETTING_DEFAULTS.cortexSyncTimeoutMs,
  cortexAsyncPollIntervalMs: RUNTIME_SETTING_DEFAULTS.cortexAsyncPollIntervalMs,
  cortexAsyncMaxWaitMs: RUNTIME_SETTING_DEFAULTS.cortexAsyncMaxWaitMs,
  cortexEnsureReadyTimeoutMs: RUNTIME_SETTING_DEFAULTS.cortexEnsureReadyTimeoutMs,
  cortexStartReadyTimeoutMs: RUNTIME_SETTING_DEFAULTS.cortexStartReadyTimeoutMs,
  cortexFailureThreshold: RUNTIME_SETTING_DEFAULTS.cortexFailureThreshold,
  cortexCircuitOpenMs: RUNTIME_SETTING_DEFAULTS.cortexCircuitOpenMs,
  cortexEscalateConfidenceLt: RUNTIME_SETTING_DEFAULTS.cortexEscalateConfidenceLt,
  cortexMaxDeepFieldsPerProduct: RUNTIME_SETTING_DEFAULTS.cortexMaxDeepFieldsPerProduct,
  scannedPdfOcrMaxPages: RUNTIME_SETTING_DEFAULTS.scannedPdfOcrMaxPages,
  scannedPdfOcrMaxPairs: RUNTIME_SETTING_DEFAULTS.scannedPdfOcrMaxPairs,
  scannedPdfOcrMinCharsPerPage: RUNTIME_SETTING_DEFAULTS.scannedPdfOcrMinCharsPerPage,
  scannedPdfOcrMinLinesPerPage: RUNTIME_SETTING_DEFAULTS.scannedPdfOcrMinLinesPerPage,
  scannedPdfOcrMinConfidence: RUNTIME_SETTING_DEFAULTS.scannedPdfOcrMinConfidence,
  resumeWindowHours: RUNTIME_SETTING_DEFAULTS.resumeWindowHours,
  reextractAfterHours: RUNTIME_SETTING_DEFAULTS.reextractAfterHours,
} satisfies RuntimeSettingsNumericBaseline);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readNumericSetting(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readRuntimeSettingsNumericBaseline(
  source: RuntimeSettingsNumericSource | undefined,
  fallback: RuntimeSettingsNumericBaseline = RUNTIME_SETTINGS_NUMERIC_BASELINE_DEFAULTS,
): RuntimeSettingsNumericBaseline {
  const baseline = {} as RuntimeSettingsNumericBaseline;
  for (const key of RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS) {
    baseline[key] = readNumericSetting(source?.[key], fallback[key]);
  }
  return baseline;
}

export function runtimeSettingsNumericBaselineEqual(
  a: RuntimeSettingsNumericBaseline,
  b: RuntimeSettingsNumericBaseline,
) {
  return RUNTIME_SETTINGS_NUMERIC_BASELINE_KEYS.every((key) => a[key] === b[key]);
}

export function readRuntimeSettingsSnapshot(queryClient: QueryClient): RuntimeSettings | undefined {
  const cached = queryClient.getQueryData<unknown>(RUNTIME_SETTINGS_QUERY_KEY);
  if (!isObject(cached)) return undefined;
  const settings: RuntimeSettings = {};
  for (const [key, value] of Object.entries(cached)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      settings[key] = value;
    }
  }
  return settings;
}

export function readRuntimeSettingsBootstrap<T extends object>(
  queryClient: QueryClient,
  defaults: T,
): T {
  const snapshot = readRuntimeSettingsSnapshot(queryClient);
  return {
    ...defaults,
    ...(snapshot || {}),
  } as T;
}

export function useRuntimeSettingsBootstrap<T extends object>(defaults: T): T {
  const queryClient = useQueryClient();
  return useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, defaults),
    [queryClient, defaults],
  );
}

function normalizeRejected(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const rejected: Record<string, string> = {};
  for (const [key, reason] of Object.entries(value)) {
    rejected[key] = String(reason || 'rejected');
  }
  return rejected;
}

export function useRuntimeSettingsReader({
  enabled = true,
}: RuntimeSettingsReaderOptions = {}): RuntimeSettingsReaderResult {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: RUNTIME_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
    enabled,
  });

  async function reload() {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
    }
    return result.data;
  }

  return {
    settings,
    isLoading,
    reload,
  };
}

function normalizeRuntimeSaveResult(
  response: unknown,
  fallbackPayload: RuntimeSettings,
  previousPayload: RuntimeSettings,
) {
  const responseObj = isObject(response) ? response as Record<string, unknown> : {};
  const responseApplied = isObject(responseObj.applied) ? responseObj.applied : fallbackPayload;
  const rejected = normalizeRejected(responseObj.rejected);
  const hasRejected = Object.keys(rejected).length > 0;
  const applied = {
    ...previousPayload,
    ...(responseApplied as Record<string, unknown>),
  } as RuntimeSettings;
  return {
    ok: responseObj.ok !== false && !hasRejected,
    applied,
    rejected,
  } as RuntimeSettingsPersistResult;
}

export function useRuntimeSettingsAuthority({
  payload,
  dirty,
  autoSaveEnabled,
  enabled = true,
  onPersisted,
  onError,
}: RuntimeSettingsAuthorityOptions): RuntimeSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const payloadFingerprint = autoSaveFingerprint(payload);

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: RUNTIME_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
    enabled,
  });

  const payloadRef = useRef(payload);
  const payloadFingerprintRef = useRef(payloadFingerprint);
  const dirtyRef = useRef(dirty);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
  payloadRef.current = payload;
  payloadFingerprintRef.current = payloadFingerprint;
  dirtyRef.current = dirty;
  autoSaveEnabledRef.current = autoSaveEnabled;

  const applyRuntimeSaveResult = (result: RuntimeSettingsPersistResult, emitState = true) => {
    queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.applied);
    if (emitState) {
      onPersisted?.(result);
    }
  };

  const recordPersistSuccess = (nextPayload: RuntimeSettings) => {
    const savedFingerprint = autoSaveFingerprint(nextPayload);
    lastAutoSavedFingerprintRef.current = savedFingerprint;
    lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
    publishSettingsPropagation({ domain: 'runtime' });
  };

  const persistRuntimeSettings = async (nextPayload: RuntimeSettings, emitState = true) => {
    try {
      const response = await api.put<{ ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> }>(
        '/runtime-settings',
        nextPayload,
      );
      const result = normalizeRuntimeSaveResult(
        response,
        nextPayload,
        queryClient.getQueryData<RuntimeSettings>(RUNTIME_SETTINGS_QUERY_KEY) || nextPayload,
      );
      applyRuntimeSaveResult(result, emitState);
      recordPersistSuccess(nextPayload);
      return result;
    } catch (error) {
      if (emitState) {
        onError?.(error);
      } else {
        console.error('Runtime settings autosave failed:', error);
      }
      return undefined;
    }
  };

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      RuntimeSettings,
      { ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> },
      RuntimeSettings,
      RuntimeSettingsPersistResult
    >({
      queryClient,
      queryKey: RUNTIME_SETTINGS_QUERY_KEY,
      mutationFn: (nextPayload) =>
        api.put<{ ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> }>(
          '/runtime-settings',
          nextPayload,
        ),
      toOptimisticData: (nextPayload) => nextPayload,
      toAppliedData: (response, nextPayload, previousData) =>
        normalizeRuntimeSaveResult(response, nextPayload, previousData || nextPayload).applied,
      toPersistedResult: (response, nextPayload, previousData) =>
        normalizeRuntimeSaveResult(response, nextPayload, previousData || nextPayload),
      onPersisted: (result, nextPayload) => {
        applyRuntimeSaveResult(result);
        recordPersistSuccess(nextPayload);
      },
      onError,
    }),
  );
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!autoSaveEnabled || !dirty || !payloadFingerprint) return;
    if (payloadFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextPayload = payloadRef.current;
    lastAutoSaveAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      saveMutate(nextPayload);
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime);
    return () => clearTimeout(timer);
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutate]);

  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !autoSaveEnabledRef.current) return;
      const nextFingerprint = payloadFingerprintRef.current;
      if (!nextFingerprint) return;
      if (nextFingerprint === lastAutoSavedFingerprintRef.current) return;
      if (nextFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
      lastAutoSaveAttemptFingerprintRef.current = nextFingerprint;
      void persistRuntimeSettings(payloadRef.current, false);
    };
  }, []);

  async function reload() {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
      const loadedFingerprint = autoSaveFingerprint(result.data);
      lastAutoSavedFingerprintRef.current = loadedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = loadedFingerprint;
    }
    return result.data;
  }

  function saveNow() {
    saveMutation.mutate(payloadRef.current);
  }

  return {
    settings,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
  };
}
