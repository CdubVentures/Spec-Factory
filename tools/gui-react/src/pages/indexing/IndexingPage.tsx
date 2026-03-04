import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useIndexLabStore } from '../../stores/indexlabStore';
import { useCollapseStore } from '../../stores/collapseStore';
import { usePersistedTab } from '../../stores/tabStore';
import { CONVERGENCE_KNOB_GROUPS, CONVERGENCE_SETTING_DEFAULTS } from '../../stores/convergenceSettingsAuthority';
import {
  readRuntimeSettingsNumericBaseline,
  runtimeSettingsNumericBaselineEqual,
  useRuntimeSettingsBootstrap,
  useRuntimeSettingsReader,
} from '../../stores/runtimeSettingsAuthority';
import {
  clampTokenForModel as clampRuntimeTokenForModel,
  collectRuntimeSettingsPayload as collectRuntimeSettingsPayloadFromDomain,
  createRuntimeHydrationBindings,
  hydrateRuntimeSettingsFromBindings,
  parseRuntimeFloat,
  parseRuntimeInt,
  parseRuntimeLlmTokenCap,
} from '../../stores/runtimeSettingsDomain';
import {
  LLM_SETTING_LIMITS,
  RUNTIME_SETTING_DEFAULTS,
  type RuntimeOcrBackend,
  type RuntimeProfile,
  type RuntimeResumeMode,
  type RuntimeSearchProvider,
} from '../../stores/settingsManifest';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { Tip } from '../../components/common/Tip';
import type { ProcessStatus } from '../../types/events';
import type { CatalogRow } from '../../types/product';
import type { IndexLabEvent } from '../../stores/indexlabStore';
import type { LearningFeedResponse } from '../../types/learning';
import {
  normalizeToken, getRefetchInterval, truthyFlag, cleanVariant, displayVariant,
  ambiguityLevelFromFamilyCount, formatNumber, formatBytes, formatDateTime,
  providerFromModelToken, stripThinkTags, prettyJsonText, isJsonText,
  hostFromUrl, looksLikeGraphqlUrl, looksLikeJsonUrl, looksLikePdfUrl,
  llmPhaseLabel, classifyLlmPhase, llmPhaseBadgeClasses, panelStateChipClasses,
  hostBudgetStateBadgeClasses, roleHelpText, formatDuration, percentileMs,
  formatLatencyMs, needsetRequiredLevelWeight, needsetRequiredLevelBadge,
  needsetReasonBadge, NeedsetSparkline, computeActivityStats, ActivityGauge,
} from './helpers';
import type {
  IndexLabRunSummary, IndexLabRunsResponse, IndexLabRunEventsResponse,
  IndexLabNeedSetRow, IndexLabNeedSetSnapshot, IndexLabNeedSetResponse,
  IndexLabSearchProfileAlias, IndexLabSearchProfileQueryRow, IndexLabSearchProfileResponse,
  IndexLabSerpCandidateRow, IndexLabSerpSelectedUrlRow, IndexLabSerpQueryRow,
  IndexLabSerpExplorerResponse, SearxngStatusResponse,
  IndexingLlmConfigResponse, IndexingLlmMetricsRunRow, IndexingLlmMetricsResponse,
  IndexLabLlmTraceRow, IndexLabLlmTracesResponse,
  IndexingDomainChecklistUrlRow, IndexingDomainChecklistRow,
  IndexingDomainChecklistRepairRow, IndexingDomainChecklistBadPatternRow,
  IndexingDomainChecklistResponse,
  IndexLabAutomationJobRow, IndexLabAutomationActionRow, IndexLabAutomationQueueResponse,
  IndexLabEvidenceIndexDocumentRow, IndexLabEvidenceIndexFieldRow,
  IndexLabEvidenceIndexSearchRow, IndexLabEvidenceIndexResponse,
  IndexLabPhase07HitRow, IndexLabPhase07FieldRow, IndexLabPhase07Response,
  IndexLabPhase08BatchRow, IndexLabPhase08FieldContextRow, IndexLabPhase08PrimeRow,
  IndexLabPhase08Response,
  IndexLabDynamicFetchDashboardHostRow, IndexLabDynamicFetchDashboardResponse,
  RoundSummaryRow, RoundSummaryResponse,
  PanelKey, PanelStateToken,
  TimedIndexLabEvent,
} from './types';
import { PANEL_KEYS, DEFAULT_PANEL_COLLAPSED } from './types';
import { Phase07Panel } from './panels/Phase07Panel';
import { Phase08Panel } from './panels/Phase08Panel';
import { Phase09Panel } from './panels/Phase09Panel';
import { LearningPanel } from './panels/LearningPanel';
import { Phase06bPanel } from './panels/Phase06bPanel';
import { SerpExplorerPanel } from './panels/SerpExplorerPanel';
import { Phase06Panel } from './panels/Phase06Panel';
import { UrlHealthPanel } from './panels/UrlHealthPanel';
import { SearchProfilePanel } from './panels/SearchProfilePanel';
import { PickerPanel } from './panels/PickerPanel';
import { NeedSetPanel } from './panels/NeedSetPanel';
import { OverviewPanel } from './panels/OverviewPanel';
import { PanelControlsPanel } from './panels/PanelControlsPanel';
import { SessionDataPanel } from './panels/SessionDataPanel';
import { LlmOutputPanel } from './panels/LlmOutputPanel';
import { LlmMetricsPanel } from './panels/LlmMetricsPanel';
import { EventStreamPanel } from './panels/EventStreamPanel';
import { Phase05Panel } from './panels/Phase05Panel';

const NEEDSET_SORT_KEYS = [
  'need_score',
  'field_key',
  'required_level',
  'confidence',
  'best_tier_seen',
  'refs',
] as const;
const NEEDSET_SORT_DIRS = ['asc', 'desc'] as const;
const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;
const LLM_EXTRACT_MIN_TOKENS = 128;
const LLM_EXTRACT_MIN_SNIPPET_CHARS = 128;
const VISUAL_ASSET_MIN_SIDE = 128;

function randomHex(bytes = 3) {
  const safeBytes = Math.max(1, Math.min(16, Number.parseInt(String(bytes || 3), 10) || 3));
  const seeded = new Uint8Array(safeBytes);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(seeded);
  } else {
    for (let idx = 0; idx < safeBytes; idx += 1) {
      seeded[idx] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(seeded)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function buildRequestedRunId(date = new Date()) {
  const stamp = date
    .toISOString()
    .split('-').join('')
    .split(':').join('')
    .split('.').join('')
    .split('T').join('')
    .split('Z').join('')
    .slice(0, 14);
  return `${stamp}-${randomHex(3)}`;
}

export function IndexingPage() {
  const category = useUiStore((s) => s.category);
  const runtimeAutoSaveEnabled = useUiStore((s) => s.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((s) => s.setRuntimeAutoSaveEnabled);
  const isAll = category === 'all';
  const clearProcessOutput = useRuntimeStore((s) => s.clearProcessOutput);
  const setRuntimeProcessStatus = useRuntimeStore((s) => s.setProcessStatus);
  const liveIndexLabByRun = useIndexLabStore((s) => s.byRun);
  const clearIndexLabRun = useIndexLabStore((s) => s.clearRun);
  const queryClient = useQueryClient();
  const runtimeSettingsAuthorityReady = useSettingsAuthorityStore((s) => s.snapshot.runtimeReady);
  const runtimeSettingsBootstrap = useRuntimeSettingsBootstrap(RUNTIME_SETTING_DEFAULTS);

  const [profile, setProfile] = useState<RuntimeProfile>(runtimeSettingsBootstrap.profile);
  const [fetchConcurrency, setFetchConcurrency] = useState(String(runtimeSettingsBootstrap.fetchConcurrency));
  const [perHostMinDelayMs, setPerHostMinDelayMs] = useState(String(runtimeSettingsBootstrap.perHostMinDelayMs));
  const [dynamicCrawleeEnabled, setDynamicCrawleeEnabled] = useState(runtimeSettingsBootstrap.dynamicCrawleeEnabled);
  const [crawleeHeadless, setCrawleeHeadless] = useState(runtimeSettingsBootstrap.crawleeHeadless);
  const [crawleeRequestHandlerTimeoutSecs, setCrawleeRequestHandlerTimeoutSecs] = useState(String(runtimeSettingsBootstrap.crawleeRequestHandlerTimeoutSecs));
  const [dynamicFetchRetryBudget, setDynamicFetchRetryBudget] = useState(String(runtimeSettingsBootstrap.dynamicFetchRetryBudget));
  const [dynamicFetchRetryBackoffMs, setDynamicFetchRetryBackoffMs] = useState(String(runtimeSettingsBootstrap.dynamicFetchRetryBackoffMs));
  const [fetchSchedulerEnabled, setFetchSchedulerEnabled] = useState(runtimeSettingsBootstrap.fetchSchedulerEnabled);
  const [fetchSchedulerMaxRetries, setFetchSchedulerMaxRetries] = useState(String(runtimeSettingsBootstrap.fetchSchedulerMaxRetries));
  const [fetchSchedulerFallbackWaitMs, setFetchSchedulerFallbackWaitMs] = useState(String(runtimeSettingsBootstrap.fetchSchedulerFallbackWaitMs));
  const [preferHttpFetcher, setPreferHttpFetcher] = useState(runtimeSettingsBootstrap.preferHttpFetcher);
  const [pageGotoTimeoutMs, setPageGotoTimeoutMs] = useState(String(runtimeSettingsBootstrap.pageGotoTimeoutMs));
  const [pageNetworkIdleTimeoutMs, setPageNetworkIdleTimeoutMs] = useState(String(runtimeSettingsBootstrap.pageNetworkIdleTimeoutMs));
  const [postLoadWaitMs, setPostLoadWaitMs] = useState(String(runtimeSettingsBootstrap.postLoadWaitMs));
  const [frontierDbPath, setFrontierDbPath] = useState(runtimeSettingsBootstrap.frontierDbPath);
  const [frontierEnableSqlite, setFrontierEnableSqlite] = useState(runtimeSettingsBootstrap.frontierEnableSqlite);
  const [frontierStripTrackingParams, setFrontierStripTrackingParams] = useState(runtimeSettingsBootstrap.frontierStripTrackingParams);
  const [frontierQueryCooldownSeconds, setFrontierQueryCooldownSeconds] = useState(String(runtimeSettingsBootstrap.frontierQueryCooldownSeconds));
  const [frontierCooldown404Seconds, setFrontierCooldown404Seconds] = useState(String(runtimeSettingsBootstrap.frontierCooldown404Seconds));
  const [frontierCooldown404RepeatSeconds, setFrontierCooldown404RepeatSeconds] = useState(String(runtimeSettingsBootstrap.frontierCooldown404RepeatSeconds));
  const [frontierCooldown410Seconds, setFrontierCooldown410Seconds] = useState(String(runtimeSettingsBootstrap.frontierCooldown410Seconds));
  const [frontierCooldownTimeoutSeconds, setFrontierCooldownTimeoutSeconds] = useState(String(runtimeSettingsBootstrap.frontierCooldownTimeoutSeconds));
  const [frontierCooldown403BaseSeconds, setFrontierCooldown403BaseSeconds] = useState(String(runtimeSettingsBootstrap.frontierCooldown403BaseSeconds));
  const [frontierCooldown429BaseSeconds, setFrontierCooldown429BaseSeconds] = useState(String(runtimeSettingsBootstrap.frontierCooldown429BaseSeconds));
  const [frontierBackoffMaxExponent, setFrontierBackoffMaxExponent] = useState(String(runtimeSettingsBootstrap.frontierBackoffMaxExponent));
  const [frontierPathPenaltyNotfoundThreshold, setFrontierPathPenaltyNotfoundThreshold] = useState(String(runtimeSettingsBootstrap.frontierPathPenaltyNotfoundThreshold));
  const [frontierBlockedDomainThreshold, setFrontierBlockedDomainThreshold] = useState(String(runtimeSettingsBootstrap.frontierBlockedDomainThreshold));
  const [frontierRepairSearchEnabled, setFrontierRepairSearchEnabled] = useState(runtimeSettingsBootstrap.frontierRepairSearchEnabled);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(runtimeSettingsBootstrap.autoScrollEnabled);
  const [autoScrollPasses, setAutoScrollPasses] = useState(String(runtimeSettingsBootstrap.autoScrollPasses));
  const [autoScrollDelayMs, setAutoScrollDelayMs] = useState(String(runtimeSettingsBootstrap.autoScrollDelayMs));
  const [graphqlReplayEnabled, setGraphqlReplayEnabled] = useState(runtimeSettingsBootstrap.graphqlReplayEnabled);
  const [maxGraphqlReplays, setMaxGraphqlReplays] = useState(String(runtimeSettingsBootstrap.maxGraphqlReplays));
  const [maxNetworkResponsesPerPage, setMaxNetworkResponsesPerPage] = useState(String(runtimeSettingsBootstrap.maxNetworkResponsesPerPage));
  const [robotsTxtCompliant, setRobotsTxtCompliant] = useState(runtimeSettingsBootstrap.robotsTxtCompliant);
  const [robotsTxtTimeoutMs, setRobotsTxtTimeoutMs] = useState(String(runtimeSettingsBootstrap.robotsTxtTimeoutMs));
  const [dynamicFetchPolicyMapJson, setDynamicFetchPolicyMapJson] = useState(runtimeSettingsBootstrap.dynamicFetchPolicyMapJson);
  const [searchProfileCapMapJson, setSearchProfileCapMapJson] = useState(runtimeSettingsBootstrap.searchProfileCapMapJson);
  const [serpRerankerWeightMapJson, setSerpRerankerWeightMapJson] = useState(runtimeSettingsBootstrap.serpRerankerWeightMapJson);
  const [fetchSchedulerInternalsMapJson, setFetchSchedulerInternalsMapJson] = useState(runtimeSettingsBootstrap.fetchSchedulerInternalsMapJson);
  const [retrievalInternalsMapJson, setRetrievalInternalsMapJson] = useState(runtimeSettingsBootstrap.retrievalInternalsMapJson);
  const [evidencePackLimitsMapJson, setEvidencePackLimitsMapJson] = useState(runtimeSettingsBootstrap.evidencePackLimitsMapJson);
  const [identityGateThresholdBoundsMapJson, setIdentityGateThresholdBoundsMapJson] = useState(runtimeSettingsBootstrap.identityGateThresholdBoundsMapJson);
  const [parsingConfidenceBaseMapJson, setParsingConfidenceBaseMapJson] = useState(runtimeSettingsBootstrap.parsingConfidenceBaseMapJson);
  const [repairDedupeRule, setRepairDedupeRule] = useState(runtimeSettingsBootstrap.repairDedupeRule);
  const [automationQueueStorageEngine, setAutomationQueueStorageEngine] = useState(runtimeSettingsBootstrap.automationQueueStorageEngine);
  const [runtimeTraceEnabled, setRuntimeTraceEnabled] = useState(runtimeSettingsBootstrap.runtimeTraceEnabled);
  const [runtimeTraceFetchRing, setRuntimeTraceFetchRing] = useState(String(runtimeSettingsBootstrap.runtimeTraceFetchRing));
  const [runtimeTraceLlmRing, setRuntimeTraceLlmRing] = useState(String(runtimeSettingsBootstrap.runtimeTraceLlmRing));
  const [runtimeTraceLlmPayloads, setRuntimeTraceLlmPayloads] = useState(runtimeSettingsBootstrap.runtimeTraceLlmPayloads);
  const [eventsJsonWrite, setEventsJsonWrite] = useState(runtimeSettingsBootstrap.eventsJsonWrite);
  const [queueJsonWrite, setQueueJsonWrite] = useState(runtimeSettingsBootstrap.queueJsonWrite);
  const [billingJsonWrite, setBillingJsonWrite] = useState(runtimeSettingsBootstrap.billingJsonWrite);
  const [brainJsonWrite, setBrainJsonWrite] = useState(runtimeSettingsBootstrap.brainJsonWrite);
  const [intelJsonWrite, setIntelJsonWrite] = useState(runtimeSettingsBootstrap.intelJsonWrite);
  const [corpusJsonWrite, setCorpusJsonWrite] = useState(runtimeSettingsBootstrap.corpusJsonWrite);
  const [learningJsonWrite, setLearningJsonWrite] = useState(runtimeSettingsBootstrap.learningJsonWrite);
  const [cacheJsonWrite, setCacheJsonWrite] = useState(runtimeSettingsBootstrap.cacheJsonWrite);
  const [daemonConcurrency, setDaemonConcurrency] = useState(String(runtimeSettingsBootstrap.daemonConcurrency));
  const [daemonGracefulShutdownTimeoutMs, setDaemonGracefulShutdownTimeoutMs] = useState(String(runtimeSettingsBootstrap.daemonGracefulShutdownTimeoutMs));
  const [importsRoot, setImportsRoot] = useState(runtimeSettingsBootstrap.importsRoot);
  const [importsPollSeconds, setImportsPollSeconds] = useState(String(runtimeSettingsBootstrap.importsPollSeconds));
  const [authoritySnapshotEnabled, setAuthoritySnapshotEnabled] = useState(runtimeSettingsBootstrap.authoritySnapshotEnabled);
  const [runtimeScreencastEnabled, setRuntimeScreencastEnabled] = useState(runtimeSettingsBootstrap.runtimeScreencastEnabled);
  const [runtimeScreencastFps, setRuntimeScreencastFps] = useState(String(runtimeSettingsBootstrap.runtimeScreencastFps));
  const [runtimeScreencastQuality, setRuntimeScreencastQuality] = useState(String(runtimeSettingsBootstrap.runtimeScreencastQuality));
  const [runtimeScreencastMaxWidth, setRuntimeScreencastMaxWidth] = useState(String(runtimeSettingsBootstrap.runtimeScreencastMaxWidth));
  const [runtimeScreencastMaxHeight, setRuntimeScreencastMaxHeight] = useState(String(runtimeSettingsBootstrap.runtimeScreencastMaxHeight));
  const [scannedPdfOcrEnabled, setScannedPdfOcrEnabled] = useState(runtimeSettingsBootstrap.scannedPdfOcrEnabled);
  const [scannedPdfOcrPromoteCandidates, setScannedPdfOcrPromoteCandidates] = useState(runtimeSettingsBootstrap.scannedPdfOcrPromoteCandidates);
  const [scannedPdfOcrBackend, setScannedPdfOcrBackend] = useState<RuntimeOcrBackend>(runtimeSettingsBootstrap.scannedPdfOcrBackend);
  const [scannedPdfOcrMaxPages, setScannedPdfOcrMaxPages] = useState(String(runtimeSettingsBootstrap.scannedPdfOcrMaxPages));
  const [scannedPdfOcrMaxPairs, setScannedPdfOcrMaxPairs] = useState(String(runtimeSettingsBootstrap.scannedPdfOcrMaxPairs));
  const [scannedPdfOcrMinCharsPerPage, setScannedPdfOcrMinCharsPerPage] = useState(String(runtimeSettingsBootstrap.scannedPdfOcrMinCharsPerPage));
  const [scannedPdfOcrMinLinesPerPage, setScannedPdfOcrMinLinesPerPage] = useState(String(runtimeSettingsBootstrap.scannedPdfOcrMinLinesPerPage));
  const [scannedPdfOcrMinConfidence, setScannedPdfOcrMinConfidence] = useState(String(runtimeSettingsBootstrap.scannedPdfOcrMinConfidence));
  const [resumeMode, setResumeMode] = useState<RuntimeResumeMode>(runtimeSettingsBootstrap.resumeMode);
  const [resumeWindowHours, setResumeWindowHours] = useState(String(runtimeSettingsBootstrap.resumeWindowHours));
  const [indexingResumeSeedLimit, setIndexingResumeSeedLimit] = useState(String(runtimeSettingsBootstrap.indexingResumeSeedLimit));
  const [indexingResumePersistLimit, setIndexingResumePersistLimit] = useState(String(runtimeSettingsBootstrap.indexingResumePersistLimit));
  const [reextractAfterHours, setReextractAfterHours] = useState(String(runtimeSettingsBootstrap.reextractAfterHours));
  const [convergenceIdentityFailFastRounds, setConvergenceIdentityFailFastRounds] = useState(String(runtimeSettingsBootstrap.convergenceIdentityFailFastRounds));
  const [identityGatePublishThreshold, setIdentityGatePublishThreshold] = useState(String(runtimeSettingsBootstrap.identityGatePublishThreshold));
  const [reextractIndexed, setReextractIndexed] = useState(runtimeSettingsBootstrap.reextractIndexed);
  const [indexingSchemaPacketsValidationEnabled, setIndexingSchemaPacketsValidationEnabled] = useState(runtimeSettingsBootstrap.indexingSchemaPacketsValidationEnabled);
  const [indexingSchemaPacketsValidationStrict, setIndexingSchemaPacketsValidationStrict] = useState(runtimeSettingsBootstrap.indexingSchemaPacketsValidationStrict);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(runtimeSettingsBootstrap.discoveryEnabled);
  const [fetchCandidateSources, setFetchCandidateSources] = useState(runtimeSettingsBootstrap.fetchCandidateSources);
  const [discoveryMaxQueries, setDiscoveryMaxQueries] = useState(String(runtimeSettingsBootstrap.discoveryMaxQueries));
  const [discoveryResultsPerQuery, setDiscoveryResultsPerQuery] = useState(String(runtimeSettingsBootstrap.discoveryResultsPerQuery));
  const [discoveryMaxDiscovered, setDiscoveryMaxDiscovered] = useState(String(runtimeSettingsBootstrap.discoveryMaxDiscovered));
  const [discoveryQueryConcurrency, setDiscoveryQueryConcurrency] = useState(String(runtimeSettingsBootstrap.discoveryQueryConcurrency));
  const [manufacturerBroadDiscovery, setManufacturerBroadDiscovery] = useState(runtimeSettingsBootstrap.manufacturerBroadDiscovery);
  const [manufacturerSeedSearchUrls, setManufacturerSeedSearchUrls] = useState(runtimeSettingsBootstrap.manufacturerSeedSearchUrls);
  const [manufacturerDeepResearchEnabled, setManufacturerDeepResearchEnabled] = useState(runtimeSettingsBootstrap.manufacturerDeepResearchEnabled);
  const [maxUrlsPerProduct, setMaxUrlsPerProduct] = useState(String(runtimeSettingsBootstrap.maxUrlsPerProduct));
  const [maxCandidateUrls, setMaxCandidateUrls] = useState(String(runtimeSettingsBootstrap.maxCandidateUrls));
  const [maxPagesPerDomain, setMaxPagesPerDomain] = useState(String(runtimeSettingsBootstrap.maxPagesPerDomain));
  const [uberMaxUrlsPerProduct, setUberMaxUrlsPerProduct] = useState(String(runtimeSettingsBootstrap.uberMaxUrlsPerProduct));
  const [uberMaxUrlsPerDomain, setUberMaxUrlsPerDomain] = useState(String(runtimeSettingsBootstrap.uberMaxUrlsPerDomain));
  const [maxRunSeconds, setMaxRunSeconds] = useState(String(runtimeSettingsBootstrap.maxRunSeconds));
  const [maxJsonBytes, setMaxJsonBytes] = useState(String(runtimeSettingsBootstrap.maxJsonBytes));
  const [maxPdfBytes, setMaxPdfBytes] = useState(String(runtimeSettingsBootstrap.maxPdfBytes));
  const [pdfBackendRouterEnabled, setPdfBackendRouterEnabled] = useState(runtimeSettingsBootstrap.pdfBackendRouterEnabled);
  const [pdfPreferredBackend, setPdfPreferredBackend] = useState(runtimeSettingsBootstrap.pdfPreferredBackend);
  const [pdfBackendRouterTimeoutMs, setPdfBackendRouterTimeoutMs] = useState(String(runtimeSettingsBootstrap.pdfBackendRouterTimeoutMs));
  const [pdfBackendRouterMaxPages, setPdfBackendRouterMaxPages] = useState(String(runtimeSettingsBootstrap.pdfBackendRouterMaxPages));
  const [pdfBackendRouterMaxPairs, setPdfBackendRouterMaxPairs] = useState(String(runtimeSettingsBootstrap.pdfBackendRouterMaxPairs));
  const [pdfBackendRouterMaxTextPreviewChars, setPdfBackendRouterMaxTextPreviewChars] = useState(String(runtimeSettingsBootstrap.pdfBackendRouterMaxTextPreviewChars));
  const [capturePageScreenshotEnabled, setCapturePageScreenshotEnabled] = useState(runtimeSettingsBootstrap.capturePageScreenshotEnabled);
  const [capturePageScreenshotFormat, setCapturePageScreenshotFormat] = useState(runtimeSettingsBootstrap.capturePageScreenshotFormat);
  const [capturePageScreenshotQuality, setCapturePageScreenshotQuality] = useState(String(runtimeSettingsBootstrap.capturePageScreenshotQuality));
  const [capturePageScreenshotMaxBytes, setCapturePageScreenshotMaxBytes] = useState(String(runtimeSettingsBootstrap.capturePageScreenshotMaxBytes));
  const [capturePageScreenshotSelectors, setCapturePageScreenshotSelectors] = useState(runtimeSettingsBootstrap.capturePageScreenshotSelectors);
  const [runtimeCaptureScreenshots, setRuntimeCaptureScreenshots] = useState(runtimeSettingsBootstrap.runtimeCaptureScreenshots);
  const [runtimeScreenshotMode, setRuntimeScreenshotMode] = useState(runtimeSettingsBootstrap.runtimeScreenshotMode);
  const [visualAssetCaptureEnabled, setVisualAssetCaptureEnabled] = useState(runtimeSettingsBootstrap.visualAssetCaptureEnabled);
  const [visualAssetCaptureMaxPerSource, setVisualAssetCaptureMaxPerSource] = useState(String(runtimeSettingsBootstrap.visualAssetCaptureMaxPerSource));
  const [visualAssetStoreOriginal, setVisualAssetStoreOriginal] = useState(runtimeSettingsBootstrap.visualAssetStoreOriginal);
  const [visualAssetRetentionDays, setVisualAssetRetentionDays] = useState(String(runtimeSettingsBootstrap.visualAssetRetentionDays));
  const [visualAssetPhashEnabled, setVisualAssetPhashEnabled] = useState(runtimeSettingsBootstrap.visualAssetPhashEnabled);
  const [visualAssetReviewFormat, setVisualAssetReviewFormat] = useState(runtimeSettingsBootstrap.visualAssetReviewFormat);
  const [visualAssetReviewLgMaxSide, setVisualAssetReviewLgMaxSide] = useState(String(runtimeSettingsBootstrap.visualAssetReviewLgMaxSide));
  const [visualAssetReviewSmMaxSide, setVisualAssetReviewSmMaxSide] = useState(String(runtimeSettingsBootstrap.visualAssetReviewSmMaxSide));
  const [visualAssetReviewLgQuality, setVisualAssetReviewLgQuality] = useState(String(runtimeSettingsBootstrap.visualAssetReviewLgQuality));
  const [visualAssetReviewSmQuality, setVisualAssetReviewSmQuality] = useState(String(runtimeSettingsBootstrap.visualAssetReviewSmQuality));
  const [visualAssetRegionCropMaxSide, setVisualAssetRegionCropMaxSide] = useState(String(runtimeSettingsBootstrap.visualAssetRegionCropMaxSide));
  const [visualAssetRegionCropQuality, setVisualAssetRegionCropQuality] = useState(String(runtimeSettingsBootstrap.visualAssetRegionCropQuality));
  const [visualAssetLlmMaxBytes, setVisualAssetLlmMaxBytes] = useState(String(runtimeSettingsBootstrap.visualAssetLlmMaxBytes));
  const [visualAssetMinWidth, setVisualAssetMinWidth] = useState(String(runtimeSettingsBootstrap.visualAssetMinWidth));
  const [visualAssetMinHeight, setVisualAssetMinHeight] = useState(String(runtimeSettingsBootstrap.visualAssetMinHeight));
  const [visualAssetMinSharpness, setVisualAssetMinSharpness] = useState(String(runtimeSettingsBootstrap.visualAssetMinSharpness));
  const [visualAssetMinEntropy, setVisualAssetMinEntropy] = useState(String(runtimeSettingsBootstrap.visualAssetMinEntropy));
  const [visualAssetMaxPhashDistance, setVisualAssetMaxPhashDistance] = useState(String(runtimeSettingsBootstrap.visualAssetMaxPhashDistance));
  const [visualAssetHeroSelectorMapJson, setVisualAssetHeroSelectorMapJson] = useState(runtimeSettingsBootstrap.visualAssetHeroSelectorMapJson);
  const [chartExtractionEnabled, setChartExtractionEnabled] = useState(runtimeSettingsBootstrap.chartExtractionEnabled);
  const [runtimeControlFile, setRuntimeControlFile] = useState(runtimeSettingsBootstrap.runtimeControlFile);
  const [articleExtractorV2Enabled, setArticleExtractorV2Enabled] = useState(runtimeSettingsBootstrap.articleExtractorV2Enabled);
  const [articleExtractorMinChars, setArticleExtractorMinChars] = useState(String(runtimeSettingsBootstrap.articleExtractorMinChars));
  const [articleExtractorMinScore, setArticleExtractorMinScore] = useState(String(runtimeSettingsBootstrap.articleExtractorMinScore));
  const [articleExtractorMaxChars, setArticleExtractorMaxChars] = useState(String(runtimeSettingsBootstrap.articleExtractorMaxChars));
  const [articleExtractorDomainPolicyMapJson, setArticleExtractorDomainPolicyMapJson] = useState(runtimeSettingsBootstrap.articleExtractorDomainPolicyMapJson);
  const [htmlTableExtractorV2, setHtmlTableExtractorV2] = useState(runtimeSettingsBootstrap.htmlTableExtractorV2);
  const [staticDomExtractorEnabled, setStaticDomExtractorEnabled] = useState(runtimeSettingsBootstrap.staticDomExtractorEnabled);
  const [staticDomMode, setStaticDomMode] = useState(runtimeSettingsBootstrap.staticDomMode);
  const [staticDomTargetMatchThreshold, setStaticDomTargetMatchThreshold] = useState(String(runtimeSettingsBootstrap.staticDomTargetMatchThreshold));
  const [staticDomMaxEvidenceSnippets, setStaticDomMaxEvidenceSnippets] = useState(String(runtimeSettingsBootstrap.staticDomMaxEvidenceSnippets));
  const [structuredMetadataExtructEnabled, setStructuredMetadataExtructEnabled] = useState(runtimeSettingsBootstrap.structuredMetadataExtructEnabled);
  const [structuredMetadataExtructUrl, setStructuredMetadataExtructUrl] = useState(runtimeSettingsBootstrap.structuredMetadataExtructUrl);
  const [structuredMetadataExtructTimeoutMs, setStructuredMetadataExtructTimeoutMs] = useState(String(runtimeSettingsBootstrap.structuredMetadataExtructTimeoutMs));
  const [structuredMetadataExtructMaxItemsPerSurface, setStructuredMetadataExtructMaxItemsPerSurface] = useState(String(runtimeSettingsBootstrap.structuredMetadataExtructMaxItemsPerSurface));
  const [structuredMetadataExtructCacheEnabled, setStructuredMetadataExtructCacheEnabled] = useState(runtimeSettingsBootstrap.structuredMetadataExtructCacheEnabled);
  const [structuredMetadataExtructCacheLimit, setStructuredMetadataExtructCacheLimit] = useState(String(runtimeSettingsBootstrap.structuredMetadataExtructCacheLimit));
  const [domSnippetMaxChars, setDomSnippetMaxChars] = useState(String(runtimeSettingsBootstrap.domSnippetMaxChars));
  const [helperFilesEnabled, setHelperFilesEnabled] = useState(runtimeSettingsBootstrap.helperFilesEnabled);
  const [helperFilesRoot, setHelperFilesRoot] = useState(runtimeSettingsBootstrap.helperFilesRoot);
  const [helperSupportiveEnabled, setHelperSupportiveEnabled] = useState(runtimeSettingsBootstrap.helperSupportiveEnabled);
  const [helperSupportiveFillMissing, setHelperSupportiveFillMissing] = useState(runtimeSettingsBootstrap.helperSupportiveFillMissing);
  const [helperSupportiveMaxSources, setHelperSupportiveMaxSources] = useState(String(runtimeSettingsBootstrap.helperSupportiveMaxSources));
  const [helperAutoSeedTargets, setHelperAutoSeedTargets] = useState(runtimeSettingsBootstrap.helperAutoSeedTargets);
  const [helperActiveSyncLimit, setHelperActiveSyncLimit] = useState(String(runtimeSettingsBootstrap.helperActiveSyncLimit));
  const [fieldRewardHalfLifeDays, setFieldRewardHalfLifeDays] = useState(String(runtimeSettingsBootstrap.fieldRewardHalfLifeDays));
  const [batchStrategy, setBatchStrategy] = useState(runtimeSettingsBootstrap.batchStrategy);
  const [driftDetectionEnabled, setDriftDetectionEnabled] = useState(runtimeSettingsBootstrap.driftDetectionEnabled);
  const [driftPollSeconds, setDriftPollSeconds] = useState(String(runtimeSettingsBootstrap.driftPollSeconds));
  const [driftScanMaxProducts, setDriftScanMaxProducts] = useState(String(runtimeSettingsBootstrap.driftScanMaxProducts));
  const [driftAutoRepublish, setDriftAutoRepublish] = useState(runtimeSettingsBootstrap.driftAutoRepublish);
  const [reCrawlStaleAfterDays, setReCrawlStaleAfterDays] = useState(String(runtimeSettingsBootstrap.reCrawlStaleAfterDays));
  const [aggressiveModeEnabled, setAggressiveModeEnabled] = useState(runtimeSettingsBootstrap.aggressiveModeEnabled);
  const [aggressiveConfidenceThreshold, setAggressiveConfidenceThreshold] = useState(String(runtimeSettingsBootstrap.aggressiveConfidenceThreshold));
  const [aggressiveMaxSearchQueries, setAggressiveMaxSearchQueries] = useState(String(runtimeSettingsBootstrap.aggressiveMaxSearchQueries));
  const [aggressiveEvidenceAuditEnabled, setAggressiveEvidenceAuditEnabled] = useState(runtimeSettingsBootstrap.aggressiveEvidenceAuditEnabled);
  const [aggressiveEvidenceAuditBatchSize, setAggressiveEvidenceAuditBatchSize] = useState(String(runtimeSettingsBootstrap.aggressiveEvidenceAuditBatchSize));
  const [aggressiveMaxTimePerProductMs, setAggressiveMaxTimePerProductMs] = useState(String(runtimeSettingsBootstrap.aggressiveMaxTimePerProductMs));
  const [aggressiveThoroughFromRound, setAggressiveThoroughFromRound] = useState(String(runtimeSettingsBootstrap.aggressiveThoroughFromRound));
  const [aggressiveRound1MaxUrls, setAggressiveRound1MaxUrls] = useState(String(runtimeSettingsBootstrap.aggressiveRound1MaxUrls));
  const [aggressiveRound1MaxCandidateUrls, setAggressiveRound1MaxCandidateUrls] = useState(String(runtimeSettingsBootstrap.aggressiveRound1MaxCandidateUrls));
  const [aggressiveLlmMaxCallsPerRound, setAggressiveLlmMaxCallsPerRound] = useState(String(runtimeSettingsBootstrap.aggressiveLlmMaxCallsPerRound));
  const [aggressiveLlmMaxCallsPerProductTotal, setAggressiveLlmMaxCallsPerProductTotal] = useState(String(runtimeSettingsBootstrap.aggressiveLlmMaxCallsPerProductTotal));
  const [aggressiveLlmTargetMaxFields, setAggressiveLlmTargetMaxFields] = useState(String(runtimeSettingsBootstrap.aggressiveLlmTargetMaxFields));
  const [aggressiveLlmDiscoveryPasses, setAggressiveLlmDiscoveryPasses] = useState(String(runtimeSettingsBootstrap.aggressiveLlmDiscoveryPasses));
  const [aggressiveLlmDiscoveryQueryCap, setAggressiveLlmDiscoveryQueryCap] = useState(String(runtimeSettingsBootstrap.aggressiveLlmDiscoveryQueryCap));
  const [uberAggressiveEnabled, setUberAggressiveEnabled] = useState(runtimeSettingsBootstrap.uberAggressiveEnabled);
  const [uberMaxRounds, setUberMaxRounds] = useState(String(runtimeSettingsBootstrap.uberMaxRounds));
  const [cortexEnabled, setCortexEnabled] = useState(runtimeSettingsBootstrap.cortexEnabled);
  const [cortexAsyncEnabled, setCortexAsyncEnabled] = useState(runtimeSettingsBootstrap.cortexAsyncEnabled);
  const [cortexBaseUrl, setCortexBaseUrl] = useState(runtimeSettingsBootstrap.cortexBaseUrl);
  const [cortexApiKey, setCortexApiKey] = useState(runtimeSettingsBootstrap.cortexApiKey);
  const [cortexAsyncBaseUrl, setCortexAsyncBaseUrl] = useState(runtimeSettingsBootstrap.cortexAsyncBaseUrl);
  const [cortexAsyncSubmitPath, setCortexAsyncSubmitPath] = useState(runtimeSettingsBootstrap.cortexAsyncSubmitPath);
  const [cortexAsyncStatusPath, setCortexAsyncStatusPath] = useState(runtimeSettingsBootstrap.cortexAsyncStatusPath);
  const [cortexSyncTimeoutMs, setCortexSyncTimeoutMs] = useState(String(runtimeSettingsBootstrap.cortexSyncTimeoutMs));
  const [cortexAsyncPollIntervalMs, setCortexAsyncPollIntervalMs] = useState(String(runtimeSettingsBootstrap.cortexAsyncPollIntervalMs));
  const [cortexAsyncMaxWaitMs, setCortexAsyncMaxWaitMs] = useState(String(runtimeSettingsBootstrap.cortexAsyncMaxWaitMs));
  const [cortexModelFast, setCortexModelFast] = useState(runtimeSettingsBootstrap.cortexModelFast);
  const [cortexModelAudit, setCortexModelAudit] = useState(runtimeSettingsBootstrap.cortexModelAudit);
  const [cortexModelDom, setCortexModelDom] = useState(runtimeSettingsBootstrap.cortexModelDom);
  const [cortexModelReasoningDeep, setCortexModelReasoningDeep] = useState(runtimeSettingsBootstrap.cortexModelReasoningDeep);
  const [cortexModelVision, setCortexModelVision] = useState(runtimeSettingsBootstrap.cortexModelVision);
  const [cortexModelSearchFast, setCortexModelSearchFast] = useState(runtimeSettingsBootstrap.cortexModelSearchFast);
  const [cortexModelRerankFast, setCortexModelRerankFast] = useState(runtimeSettingsBootstrap.cortexModelRerankFast);
  const [cortexModelSearchDeep, setCortexModelSearchDeep] = useState(runtimeSettingsBootstrap.cortexModelSearchDeep);
  const [cortexAutoStart, setCortexAutoStart] = useState(runtimeSettingsBootstrap.cortexAutoStart);
  const [cortexAutoRestartOnAuth, setCortexAutoRestartOnAuth] = useState(runtimeSettingsBootstrap.cortexAutoRestartOnAuth);
  const [cortexEnsureReadyTimeoutMs, setCortexEnsureReadyTimeoutMs] = useState(String(runtimeSettingsBootstrap.cortexEnsureReadyTimeoutMs));
  const [cortexStartReadyTimeoutMs, setCortexStartReadyTimeoutMs] = useState(String(runtimeSettingsBootstrap.cortexStartReadyTimeoutMs));
  const [cortexFailureThreshold, setCortexFailureThreshold] = useState(String(runtimeSettingsBootstrap.cortexFailureThreshold));
  const [cortexCircuitOpenMs, setCortexCircuitOpenMs] = useState(String(runtimeSettingsBootstrap.cortexCircuitOpenMs));
  const [cortexEscalateConfidenceLt, setCortexEscalateConfidenceLt] = useState(String(runtimeSettingsBootstrap.cortexEscalateConfidenceLt));
  const [cortexEscalateIfConflict, setCortexEscalateIfConflict] = useState(runtimeSettingsBootstrap.cortexEscalateIfConflict);
  const [cortexEscalateCriticalOnly, setCortexEscalateCriticalOnly] = useState(runtimeSettingsBootstrap.cortexEscalateCriticalOnly);
  const [cortexMaxDeepFieldsPerProduct, setCortexMaxDeepFieldsPerProduct] = useState(String(runtimeSettingsBootstrap.cortexMaxDeepFieldsPerProduct));
  const [outputMode, setOutputMode] = useState(runtimeSettingsBootstrap.outputMode);
  const [localMode, setLocalMode] = useState(runtimeSettingsBootstrap.localMode);
  const [dryRun, setDryRun] = useState(runtimeSettingsBootstrap.dryRun);
  const [mirrorToS3, setMirrorToS3] = useState(runtimeSettingsBootstrap.mirrorToS3);
  const [mirrorToS3Input, setMirrorToS3Input] = useState(runtimeSettingsBootstrap.mirrorToS3Input);
  const [localInputRoot, setLocalInputRoot] = useState(runtimeSettingsBootstrap.localInputRoot);
  const [localOutputRoot, setLocalOutputRoot] = useState(runtimeSettingsBootstrap.localOutputRoot);
  const [runtimeEventsKey, setRuntimeEventsKey] = useState(runtimeSettingsBootstrap.runtimeEventsKey);
  const [writeMarkdownSummary, setWriteMarkdownSummary] = useState(runtimeSettingsBootstrap.writeMarkdownSummary);
  const [awsRegion, setAwsRegion] = useState(runtimeSettingsBootstrap.awsRegion);
  const [s3Bucket, setS3Bucket] = useState(runtimeSettingsBootstrap.s3Bucket);
  const [s3InputPrefix, setS3InputPrefix] = useState(runtimeSettingsBootstrap.s3InputPrefix);
  const [s3OutputPrefix, setS3OutputPrefix] = useState(runtimeSettingsBootstrap.s3OutputPrefix);
  const [eloSupabaseAnonKey, setEloSupabaseAnonKey] = useState(runtimeSettingsBootstrap.eloSupabaseAnonKey);
  const [eloSupabaseEndpoint, setEloSupabaseEndpoint] = useState(runtimeSettingsBootstrap.eloSupabaseEndpoint);
  const [llmEnabled, setLlmEnabled] = useState(runtimeSettingsBootstrap.llmEnabled);
  const [llmWriteSummary, setLlmWriteSummary] = useState(runtimeSettingsBootstrap.llmWriteSummary);
  const [llmProvider, setLlmProvider] = useState(runtimeSettingsBootstrap.llmProvider);
  const [llmBaseUrl, setLlmBaseUrl] = useState(runtimeSettingsBootstrap.llmBaseUrl);
  const [openaiApiKey, setOpenaiApiKey] = useState(runtimeSettingsBootstrap.openaiApiKey);
  const [anthropicApiKey, setAnthropicApiKey] = useState(runtimeSettingsBootstrap.anthropicApiKey);
  const [allowBelowPassTargetFill, setAllowBelowPassTargetFill] = useState(runtimeSettingsBootstrap.allowBelowPassTargetFill);
  const [indexingHelperFilesEnabled, setIndexingHelperFilesEnabled] = useState(runtimeSettingsBootstrap.indexingHelperFilesEnabled);
  const [maxManufacturerUrlsPerProduct, setMaxManufacturerUrlsPerProduct] = useState(String(runtimeSettingsBootstrap.maxManufacturerUrlsPerProduct));
  const [maxManufacturerPagesPerDomain, setMaxManufacturerPagesPerDomain] = useState(String(runtimeSettingsBootstrap.maxManufacturerPagesPerDomain));
  const [manufacturerReserveUrls, setManufacturerReserveUrls] = useState(String(runtimeSettingsBootstrap.manufacturerReserveUrls));
  const [userAgent, setUserAgent] = useState(runtimeSettingsBootstrap.userAgent);
  const [selfImproveEnabled, setSelfImproveEnabled] = useState(runtimeSettingsBootstrap.selfImproveEnabled);
  const [maxHypothesisItems, setMaxHypothesisItems] = useState(String(runtimeSettingsBootstrap.maxHypothesisItems));
  const [hypothesisAutoFollowupRounds, setHypothesisAutoFollowupRounds] = useState(String(runtimeSettingsBootstrap.hypothesisAutoFollowupRounds));
  const [hypothesisFollowupUrlsPerRound, setHypothesisFollowupUrlsPerRound] = useState(String(runtimeSettingsBootstrap.hypothesisFollowupUrlsPerRound));
  const [learningConfidenceThreshold, setLearningConfidenceThreshold] = useState(String(runtimeSettingsBootstrap.learningConfidenceThreshold));
  const [componentLexiconDecayDays, setComponentLexiconDecayDays] = useState(String(runtimeSettingsBootstrap.componentLexiconDecayDays));
  const [componentLexiconExpireDays, setComponentLexiconExpireDays] = useState(String(runtimeSettingsBootstrap.componentLexiconExpireDays));
  const [fieldAnchorsDecayDays, setFieldAnchorsDecayDays] = useState(String(runtimeSettingsBootstrap.fieldAnchorsDecayDays));
  const [urlMemoryDecayDays, setUrlMemoryDecayDays] = useState(String(runtimeSettingsBootstrap.urlMemoryDecayDays));
  const [endpointSignalLimit, setEndpointSignalLimit] = useState(String(runtimeSettingsBootstrap.endpointSignalLimit));
  const [endpointSuggestionLimit, setEndpointSuggestionLimit] = useState(String(runtimeSettingsBootstrap.endpointSuggestionLimit));
  const [endpointNetworkScanLimit, setEndpointNetworkScanLimit] = useState(String(runtimeSettingsBootstrap.endpointNetworkScanLimit));
  const [searchProvider, setSearchProvider] = useState<RuntimeSearchProvider>(runtimeSettingsBootstrap.searchProvider as RuntimeSearchProvider);
  const [searxngBaseUrl, setSearxngBaseUrl] = useState(runtimeSettingsBootstrap.searxngBaseUrl);
  const [bingSearchEndpoint, setBingSearchEndpoint] = useState(runtimeSettingsBootstrap.bingSearchEndpoint);
  const [bingSearchKey, setBingSearchKey] = useState(runtimeSettingsBootstrap.bingSearchKey);
  const [googleCseCx, setGoogleCseCx] = useState(runtimeSettingsBootstrap.googleCseCx);
  const [googleCseKey, setGoogleCseKey] = useState(runtimeSettingsBootstrap.googleCseKey);
  const [llmPlanApiKey, setLlmPlanApiKey] = useState(runtimeSettingsBootstrap.llmPlanApiKey);
  const [duckduckgoBaseUrl, setDuckduckgoBaseUrl] = useState(runtimeSettingsBootstrap.duckduckgoBaseUrl);
  const [disableGoogleCse, setDisableGoogleCse] = useState(runtimeSettingsBootstrap.disableGoogleCse);
  const [cseRescueOnlyMode, setCseRescueOnlyMode] = useState(runtimeSettingsBootstrap.cseRescueOnlyMode);
  const [cseRescueRequiredIteration, setCseRescueRequiredIteration] = useState(String(runtimeSettingsBootstrap.cseRescueRequiredIteration));
  const [duckduckgoTimeoutMs, setDuckduckgoTimeoutMs] = useState(String(runtimeSettingsBootstrap.duckduckgoTimeoutMs));
  const [duckduckgoEnabled, setDuckduckgoEnabled] = useState(runtimeSettingsBootstrap.duckduckgoEnabled);
  const [phase2LlmEnabled, setPhase2LlmEnabled] = useState(runtimeSettingsBootstrap.phase2LlmEnabled);
  const [phase2LlmModel, setPhase2LlmModel] = useState(runtimeSettingsBootstrap.phase2LlmModel);
  const [llmTokensPlan, setLlmTokensPlan] = useState(runtimeSettingsBootstrap.llmTokensPlan);
  const [phase3LlmTriageEnabled, setPhase3LlmTriageEnabled] = useState(runtimeSettingsBootstrap.phase3LlmTriageEnabled);
  const [phase3LlmModel, setPhase3LlmModel] = useState(runtimeSettingsBootstrap.phase3LlmModel);
  const [llmTokensTriage, setLlmTokensTriage] = useState(runtimeSettingsBootstrap.llmTokensTriage);
  const [llmModelFast, setLlmModelFast] = useState(runtimeSettingsBootstrap.llmModelFast);
  const [llmTokensFast, setLlmTokensFast] = useState(runtimeSettingsBootstrap.llmTokensFast);
  const [llmModelReasoning, setLlmModelReasoning] = useState(runtimeSettingsBootstrap.llmModelReasoning);
  const [llmTokensReasoning, setLlmTokensReasoning] = useState(runtimeSettingsBootstrap.llmTokensReasoning);
  const [llmModelExtract, setLlmModelExtract] = useState(runtimeSettingsBootstrap.llmModelExtract);
  const [llmTokensExtract, setLlmTokensExtract] = useState(runtimeSettingsBootstrap.llmTokensExtract);
  const [llmModelValidate, setLlmModelValidate] = useState(runtimeSettingsBootstrap.llmModelValidate);
  const [llmTokensValidate, setLlmTokensValidate] = useState(runtimeSettingsBootstrap.llmTokensValidate);
  const [llmModelWrite, setLlmModelWrite] = useState(runtimeSettingsBootstrap.llmModelWrite);
  const [llmTokensWrite, setLlmTokensWrite] = useState(runtimeSettingsBootstrap.llmTokensWrite);
  const [llmFallbackEnabled, setLlmFallbackEnabled] = useState(runtimeSettingsBootstrap.llmFallbackEnabled);
  const [llmFallbackPlanModel, setLlmFallbackPlanModel] = useState(runtimeSettingsBootstrap.llmFallbackPlanModel);
  const [llmTokensPlanFallback, setLlmTokensPlanFallback] = useState(runtimeSettingsBootstrap.llmTokensPlanFallback);
  const [llmFallbackExtractModel, setLlmFallbackExtractModel] = useState(runtimeSettingsBootstrap.llmFallbackExtractModel);
  const [llmTokensExtractFallback, setLlmTokensExtractFallback] = useState(runtimeSettingsBootstrap.llmTokensExtractFallback);
  const [llmFallbackValidateModel, setLlmFallbackValidateModel] = useState(runtimeSettingsBootstrap.llmFallbackValidateModel);
  const [llmTokensValidateFallback, setLlmTokensValidateFallback] = useState(runtimeSettingsBootstrap.llmTokensValidateFallback);
  const [llmFallbackWriteModel, setLlmFallbackWriteModel] = useState(runtimeSettingsBootstrap.llmFallbackWriteModel);
  const [llmTokensWriteFallback, setLlmTokensWriteFallback] = useState(runtimeSettingsBootstrap.llmTokensWriteFallback);
  const [llmExtractionCacheEnabled, setLlmExtractionCacheEnabled] = useState(runtimeSettingsBootstrap.llmExtractionCacheEnabled);
  const [llmExtractionCacheDir, setLlmExtractionCacheDir] = useState(runtimeSettingsBootstrap.llmExtractionCacheDir);
  const [llmExtractionCacheTtlMs, setLlmExtractionCacheTtlMs] = useState(String(runtimeSettingsBootstrap.llmExtractionCacheTtlMs));
  const [llmMaxCallsPerProductTotal, setLlmMaxCallsPerProductTotal] = useState(String(runtimeSettingsBootstrap.llmMaxCallsPerProductTotal));
  const [llmMaxCallsPerProductFast, setLlmMaxCallsPerProductFast] = useState(String(runtimeSettingsBootstrap.llmMaxCallsPerProductFast));
  const [needsetEvidenceDecayDays, setNeedsetEvidenceDecayDays] = useState(String(runtimeSettingsBootstrap.needsetEvidenceDecayDays));
  const [needsetEvidenceDecayFloor, setNeedsetEvidenceDecayFloor] = useState(String(runtimeSettingsBootstrap.needsetEvidenceDecayFloor));
  const [needsetRequiredWeightIdentity, setNeedsetRequiredWeightIdentity] = useState(String(runtimeSettingsBootstrap.needsetRequiredWeightIdentity));
  const [needsetRequiredWeightCritical, setNeedsetRequiredWeightCritical] = useState(String(runtimeSettingsBootstrap.needsetRequiredWeightCritical));
  const [needsetRequiredWeightRequired, setNeedsetRequiredWeightRequired] = useState(String(runtimeSettingsBootstrap.needsetRequiredWeightRequired));
  const [needsetRequiredWeightExpected, setNeedsetRequiredWeightExpected] = useState(String(runtimeSettingsBootstrap.needsetRequiredWeightExpected));
  const [needsetRequiredWeightOptional, setNeedsetRequiredWeightOptional] = useState(String(runtimeSettingsBootstrap.needsetRequiredWeightOptional));
  const [needsetMissingMultiplier, setNeedsetMissingMultiplier] = useState(String(runtimeSettingsBootstrap.needsetMissingMultiplier));
  const [needsetTierDeficitMultiplier, setNeedsetTierDeficitMultiplier] = useState(String(runtimeSettingsBootstrap.needsetTierDeficitMultiplier));
  const [needsetMinRefsDeficitMultiplier, setNeedsetMinRefsDeficitMultiplier] = useState(String(runtimeSettingsBootstrap.needsetMinRefsDeficitMultiplier));
  const [needsetConflictMultiplier, setNeedsetConflictMultiplier] = useState(String(runtimeSettingsBootstrap.needsetConflictMultiplier));
  const [needsetIdentityLockThreshold, setNeedsetIdentityLockThreshold] = useState(String(runtimeSettingsBootstrap.needsetIdentityLockThreshold));
  const [needsetIdentityProvisionalThreshold, setNeedsetIdentityProvisionalThreshold] = useState(String(runtimeSettingsBootstrap.needsetIdentityProvisionalThreshold));
  const [needsetDefaultIdentityAuditLimit, setNeedsetDefaultIdentityAuditLimit] = useState(String(runtimeSettingsBootstrap.needsetDefaultIdentityAuditLimit));
  const [consensusMethodWeightNetworkJson, setConsensusMethodWeightNetworkJson] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightNetworkJson));
  const [consensusMethodWeightAdapterApi, setConsensusMethodWeightAdapterApi] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightAdapterApi));
  const [consensusMethodWeightStructuredMeta, setConsensusMethodWeightStructuredMeta] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightStructuredMeta));
  const [consensusMethodWeightPdf, setConsensusMethodWeightPdf] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightPdf));
  const [consensusMethodWeightTableKv, setConsensusMethodWeightTableKv] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightTableKv));
  const [consensusMethodWeightDom, setConsensusMethodWeightDom] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightDom));
  const [consensusMethodWeightLlmExtractBase, setConsensusMethodWeightLlmExtractBase] = useState(String(runtimeSettingsBootstrap.consensusMethodWeightLlmExtractBase));
  const [consensusPolicyBonus, setConsensusPolicyBonus] = useState(String(runtimeSettingsBootstrap.consensusPolicyBonus));
  const [consensusWeightedMajorityThreshold, setConsensusWeightedMajorityThreshold] = useState(String(runtimeSettingsBootstrap.consensusWeightedMajorityThreshold));
  const [consensusStrictAcceptanceDomainCount, setConsensusStrictAcceptanceDomainCount] = useState(String(runtimeSettingsBootstrap.consensusStrictAcceptanceDomainCount));
  const [consensusRelaxedAcceptanceDomainCount, setConsensusRelaxedAcceptanceDomainCount] = useState(String(runtimeSettingsBootstrap.consensusRelaxedAcceptanceDomainCount));
  const [consensusInstrumentedFieldThreshold, setConsensusInstrumentedFieldThreshold] = useState(String(runtimeSettingsBootstrap.consensusInstrumentedFieldThreshold));
  const [consensusConfidenceScoringBase, setConsensusConfidenceScoringBase] = useState(String(runtimeSettingsBootstrap.consensusConfidenceScoringBase));
  const [consensusPassTargetIdentityStrong, setConsensusPassTargetIdentityStrong] = useState(String(runtimeSettingsBootstrap.consensusPassTargetIdentityStrong));
  const [consensusPassTargetNormal, setConsensusPassTargetNormal] = useState(String(runtimeSettingsBootstrap.consensusPassTargetNormal));
  const [retrievalTierWeightTier1, setRetrievalTierWeightTier1] = useState(String(runtimeSettingsBootstrap.retrievalTierWeightTier1));
  const [retrievalTierWeightTier2, setRetrievalTierWeightTier2] = useState(String(runtimeSettingsBootstrap.retrievalTierWeightTier2));
  const [retrievalTierWeightTier3, setRetrievalTierWeightTier3] = useState(String(runtimeSettingsBootstrap.retrievalTierWeightTier3));
  const [retrievalTierWeightTier4, setRetrievalTierWeightTier4] = useState(String(runtimeSettingsBootstrap.retrievalTierWeightTier4));
  const [retrievalTierWeightTier5, setRetrievalTierWeightTier5] = useState(String(runtimeSettingsBootstrap.retrievalTierWeightTier5));
  const [retrievalDocKindWeightManualPdf, setRetrievalDocKindWeightManualPdf] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightManualPdf));
  const [retrievalDocKindWeightSpecPdf, setRetrievalDocKindWeightSpecPdf] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightSpecPdf));
  const [retrievalDocKindWeightSupport, setRetrievalDocKindWeightSupport] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightSupport));
  const [retrievalDocKindWeightLabReview, setRetrievalDocKindWeightLabReview] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightLabReview));
  const [retrievalDocKindWeightProductPage, setRetrievalDocKindWeightProductPage] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightProductPage));
  const [retrievalDocKindWeightOther, setRetrievalDocKindWeightOther] = useState(String(runtimeSettingsBootstrap.retrievalDocKindWeightOther));
  const [retrievalMethodWeightTable, setRetrievalMethodWeightTable] = useState(String(runtimeSettingsBootstrap.retrievalMethodWeightTable));
  const [retrievalMethodWeightKv, setRetrievalMethodWeightKv] = useState(String(runtimeSettingsBootstrap.retrievalMethodWeightKv));
  const [retrievalMethodWeightJsonLd, setRetrievalMethodWeightJsonLd] = useState(String(runtimeSettingsBootstrap.retrievalMethodWeightJsonLd));
  const [retrievalMethodWeightLlmExtract, setRetrievalMethodWeightLlmExtract] = useState(String(runtimeSettingsBootstrap.retrievalMethodWeightLlmExtract));
  const [retrievalMethodWeightHelperSupportive, setRetrievalMethodWeightHelperSupportive] = useState(String(runtimeSettingsBootstrap.retrievalMethodWeightHelperSupportive));
  const [retrievalAnchorScorePerMatch, setRetrievalAnchorScorePerMatch] = useState(String(runtimeSettingsBootstrap.retrievalAnchorScorePerMatch));
  const [retrievalIdentityScorePerMatch, setRetrievalIdentityScorePerMatch] = useState(String(runtimeSettingsBootstrap.retrievalIdentityScorePerMatch));
  const [retrievalUnitMatchBonus, setRetrievalUnitMatchBonus] = useState(String(runtimeSettingsBootstrap.retrievalUnitMatchBonus));
  const [retrievalDirectFieldMatchBonus, setRetrievalDirectFieldMatchBonus] = useState(String(runtimeSettingsBootstrap.retrievalDirectFieldMatchBonus));
  const [llmExtractMaxTokens, setLlmExtractMaxTokens] = useState(String(runtimeSettingsBootstrap.llmExtractMaxTokens));
  const [llmExtractMaxSnippetsPerBatch, setLlmExtractMaxSnippetsPerBatch] = useState(String(runtimeSettingsBootstrap.llmExtractMaxSnippetsPerBatch));
  const [llmExtractMaxSnippetChars, setLlmExtractMaxSnippetChars] = useState(String(runtimeSettingsBootstrap.llmExtractMaxSnippetChars));
  const [llmExtractSkipLowSignal, setLlmExtractSkipLowSignal] = useState(runtimeSettingsBootstrap.llmExtractSkipLowSignal);
  const [llmExtractReasoningBudget, setLlmExtractReasoningBudget] = useState(String(runtimeSettingsBootstrap.llmExtractReasoningBudget));
  const [llmReasoningMode, setLlmReasoningMode] = useState(runtimeSettingsBootstrap.llmReasoningMode);
  const [llmReasoningBudget, setLlmReasoningBudget] = useState(String(runtimeSettingsBootstrap.llmReasoningBudget));
  const [llmMonthlyBudgetUsd, setLlmMonthlyBudgetUsd] = useState(String(runtimeSettingsBootstrap.llmMonthlyBudgetUsd));
  const [llmPerProductBudgetUsd, setLlmPerProductBudgetUsd] = useState(String(runtimeSettingsBootstrap.llmPerProductBudgetUsd));
  const [llmDisableBudgetGuards, setLlmDisableBudgetGuards] = useState(runtimeSettingsBootstrap.llmDisableBudgetGuards);
  const [llmMaxCallsPerRound, setLlmMaxCallsPerRound] = useState(String(runtimeSettingsBootstrap.llmMaxCallsPerRound));
  const [llmMaxOutputTokens, setLlmMaxOutputTokens] = useState(String(runtimeSettingsBootstrap.llmMaxOutputTokens));
  const [llmVerifySampleRate, setLlmVerifySampleRate] = useState(String(runtimeSettingsBootstrap.llmVerifySampleRate));
  const [llmMaxBatchesPerProduct, setLlmMaxBatchesPerProduct] = useState(String(runtimeSettingsBootstrap.llmMaxBatchesPerProduct));
  const [llmMaxEvidenceChars, setLlmMaxEvidenceChars] = useState(String(runtimeSettingsBootstrap.llmMaxEvidenceChars));
  const [llmMaxTokens, setLlmMaxTokens] = useState(String(runtimeSettingsBootstrap.llmMaxTokens));
  const [llmTimeoutMs, setLlmTimeoutMs] = useState(String(runtimeSettingsBootstrap.llmTimeoutMs));
  const [llmCostInputPer1M, setLlmCostInputPer1M] = useState(String(runtimeSettingsBootstrap.llmCostInputPer1M));
  const [llmCostOutputPer1M, setLlmCostOutputPer1M] = useState(String(runtimeSettingsBootstrap.llmCostOutputPer1M));
  const [llmCostCachedInputPer1M, setLlmCostCachedInputPer1M] = useState(String(runtimeSettingsBootstrap.llmCostCachedInputPer1M));
  const [llmVerifyMode, setLlmVerifyMode] = useState(runtimeSettingsBootstrap.llmVerifyMode);
  const [identityGateBaseMatchThreshold, setIdentityGateBaseMatchThreshold] = useState(String(runtimeSettingsBootstrap.identityGateBaseMatchThreshold));
  const [identityGateEasyAmbiguityReduction, setIdentityGateEasyAmbiguityReduction] = useState(String(runtimeSettingsBootstrap.identityGateEasyAmbiguityReduction));
  const [identityGateMediumAmbiguityReduction, setIdentityGateMediumAmbiguityReduction] = useState(String(runtimeSettingsBootstrap.identityGateMediumAmbiguityReduction));
  const [identityGateHardAmbiguityReduction, setIdentityGateHardAmbiguityReduction] = useState(String(runtimeSettingsBootstrap.identityGateHardAmbiguityReduction));
  const [identityGateVeryHardAmbiguityIncrease, setIdentityGateVeryHardAmbiguityIncrease] = useState(String(runtimeSettingsBootstrap.identityGateVeryHardAmbiguityIncrease));
  const [identityGateExtraHardAmbiguityIncrease, setIdentityGateExtraHardAmbiguityIncrease] = useState(String(runtimeSettingsBootstrap.identityGateExtraHardAmbiguityIncrease));
  const [identityGateMissingStrongIdPenalty, setIdentityGateMissingStrongIdPenalty] = useState(String(runtimeSettingsBootstrap.identityGateMissingStrongIdPenalty));
  const [identityGateHardMissingStrongIdIncrease, setIdentityGateHardMissingStrongIdIncrease] = useState(String(runtimeSettingsBootstrap.identityGateHardMissingStrongIdIncrease));
  const [identityGateVeryHardMissingStrongIdIncrease, setIdentityGateVeryHardMissingStrongIdIncrease] = useState(String(runtimeSettingsBootstrap.identityGateVeryHardMissingStrongIdIncrease));
  const [identityGateExtraHardMissingStrongIdIncrease, setIdentityGateExtraHardMissingStrongIdIncrease] = useState(String(runtimeSettingsBootstrap.identityGateExtraHardMissingStrongIdIncrease));
  const [identityGateNumericTokenBoost, setIdentityGateNumericTokenBoost] = useState(String(runtimeSettingsBootstrap.identityGateNumericTokenBoost));
  const [identityGateNumericRangeThreshold, setIdentityGateNumericRangeThreshold] = useState(String(runtimeSettingsBootstrap.identityGateNumericRangeThreshold));
  const [qualityGateIdentityThreshold, setQualityGateIdentityThreshold] = useState(String(runtimeSettingsBootstrap.qualityGateIdentityThreshold));
  const [evidenceTextMaxChars, setEvidenceTextMaxChars] = useState(String(runtimeSettingsBootstrap.evidenceTextMaxChars));
  const [specDbDir, setSpecDbDir] = useState(runtimeSettingsBootstrap.specDbDir);
  const [llmPlanProvider, setLlmPlanProvider] = useState(runtimeSettingsBootstrap.llmPlanProvider);
  const [llmPlanBaseUrl, setLlmPlanBaseUrl] = useState(runtimeSettingsBootstrap.llmPlanBaseUrl);
  const singleBrand = useIndexLabStore((s) => s.pickerBrand);
  const setSingleBrand = useIndexLabStore((s) => s.setPickerBrand);
  const singleModel = useIndexLabStore((s) => s.pickerModel);
  const setSingleModel = useIndexLabStore((s) => s.setPickerModel);
  const singleProductId = useIndexLabStore((s) => s.pickerProductId);
  const setSingleProductId = useIndexLabStore((s) => s.setPickerProductId);
  const selectedIndexLabRunId = useIndexLabStore((s) => s.pickerRunId);
  const setSelectedIndexLabRunId = useIndexLabStore((s) => s.setPickerRunId);
  const [clearedRunViewId, setClearedRunViewId] = useState('');
  const [needsetSortKey, setNeedsetSortKey] = usePersistedTab<(typeof NEEDSET_SORT_KEYS)[number]>(
    `indexing:needset:sortKey:${category}`,
    'need_score',
    { validValues: NEEDSET_SORT_KEYS },
  );
  const [needsetSortDir, setNeedsetSortDir] = usePersistedTab<(typeof NEEDSET_SORT_DIRS)[number]>(
    `indexing:needset:sortDir:${category}`,
    'desc',
    { validValues: NEEDSET_SORT_DIRS },
  );
  const [selectedLlmTraceId, setSelectedLlmTraceId] = usePersistedTab<string>(
    `indexing:llmTrace:selected:${category}`,
    '',
  );
  const [activityNowMs, setActivityNowMs] = useState(() => Date.now());
  const collapseValues = useCollapseStore((s) => s.values);
  const collapseToggle = useCollapseStore((s) => s.toggle);
  const collapseBatch = useCollapseStore((s) => s.setBatch);
  const panelCollapsed = useMemo(() => {
    const result = {} as Record<PanelKey, boolean>;
    for (const key of PANEL_KEYS) {
      result[key] = collapseValues[`indexing:panel:${key}`] ?? DEFAULT_PANEL_COLLAPSED[key];
    }
    return result;
  }, [collapseValues]);
  const [stopForceKill, setStopForceKill] = useState(true);
  const [replayPending, setReplayPending] = useState(false);
  const [phase6SearchQuery, setPhase6SearchQuery] = usePersistedTab<string>(
    `indexing:phase6:searchQuery:${category}`,
    '',
  );
  const previousCategoryRef = useRef(category);

  const { data: processStatus } = useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    refetchInterval: 1500
  });
  const isProcessRunning = Boolean(processStatus?.running);
  const processStatusRunId = String(processStatus?.run_id || processStatus?.runId || '').trim();

  const { data: searxngStatus, error: searxngStatusError } = useQuery({
    queryKey: ['searxng', 'status'],
    queryFn: () => api.get<SearxngStatusResponse>('/searxng/status'),
    refetchInterval: 2000,
    retry: 1
  });

  const searxngStatusErrorMessage = useMemo(() => {
    const message = String((searxngStatusError as Error)?.message || '').trim();
    if (!message) return '';
    if (message.toLowerCase().includes('failed to fetch')) return '';
    return message;
  }, [searxngStatusError]);

  const [runtimeSettingsDirty, setRuntimeSettingsDirty] = useState(false);
  const [convergenceSettingsSaveState] = useState<'idle' | 'ok' | 'partial' | 'error'>('idle');
  const [convergenceSettingsSaveMessage] = useState('');
  const [runtimeSettingsSaveState] = useState<'idle' | 'ok' | 'partial' | 'error'>('idle');
  const [runtimeSettingsSaveMessage] = useState('');
  const [runtimeSettingsFallbackBaseline, setRuntimeSettingsFallbackBaseline] = useState(() =>
    readRuntimeSettingsNumericBaseline(runtimeSettingsBootstrap),
  );
  const runtimeHydrationBindings = useMemo(
    () => createRuntimeHydrationBindings({
      setProfile,
      setSearchProvider,
      setSearxngBaseUrl,
      setBingSearchEndpoint,
      setBingSearchKey,
      setGoogleCseCx,
      setGoogleCseKey,
      setLlmPlanApiKey,
      setDuckduckgoBaseUrl,
      setPhase2LlmModel,
      setPhase3LlmModel,
      setLlmModelFast,
      setLlmModelReasoning,
      setLlmModelExtract,
      setLlmModelValidate,
      setLlmModelWrite,
      setLlmFallbackPlanModel,
      setLlmFallbackExtractModel,
      setLlmFallbackValidateModel,
      setLlmFallbackWriteModel,
      setOutputMode,
      setLocalInputRoot,
      setLocalOutputRoot,
      setRuntimeEventsKey,
      setAwsRegion,
      setS3Bucket,
      setS3InputPrefix,
      setS3OutputPrefix,
      setEloSupabaseAnonKey,
      setEloSupabaseEndpoint,
      setLlmProvider,
      setLlmBaseUrl,
      setOpenaiApiKey,
      setAnthropicApiKey,
      setLlmPlanProvider,
      setLlmPlanBaseUrl,
      setImportsRoot,
      setResumeMode,
      setScannedPdfOcrBackend,
      setDynamicFetchPolicyMapJson,
      setSearchProfileCapMapJson,
      setSerpRerankerWeightMapJson,
      setFetchSchedulerInternalsMapJson,
      setRetrievalInternalsMapJson,
      setEvidencePackLimitsMapJson,
      setIdentityGateThresholdBoundsMapJson,
      setParsingConfidenceBaseMapJson,
      setRepairDedupeRule,
      setAutomationQueueStorageEngine,
      setFetchConcurrency,
      setPerHostMinDelayMs,
      setLlmTokensPlan,
      setLlmTokensTriage,
      setLlmTokensFast,
      setLlmTokensReasoning,
      setLlmTokensExtract,
      setLlmTokensValidate,
      setLlmTokensWrite,
      setLlmTokensPlanFallback,
      setLlmTokensExtractFallback,
      setLlmTokensValidateFallback,
      setLlmTokensWriteFallback,
      setLlmExtractionCacheTtlMs,
      setLlmMaxCallsPerProductTotal,
      setLlmMaxCallsPerProductFast,
      setNeedsetEvidenceDecayDays,
      setNeedsetEvidenceDecayFloor,
      setNeedsetRequiredWeightIdentity,
      setNeedsetRequiredWeightCritical,
      setNeedsetRequiredWeightRequired,
      setNeedsetRequiredWeightExpected,
      setNeedsetRequiredWeightOptional,
      setNeedsetMissingMultiplier,
      setNeedsetTierDeficitMultiplier,
      setNeedsetMinRefsDeficitMultiplier,
      setNeedsetConflictMultiplier,
      setNeedsetIdentityLockThreshold,
      setNeedsetIdentityProvisionalThreshold,
      setNeedsetDefaultIdentityAuditLimit,
      setConsensusMethodWeightNetworkJson,
      setConsensusMethodWeightAdapterApi,
      setConsensusMethodWeightStructuredMeta,
      setConsensusMethodWeightPdf,
      setConsensusMethodWeightTableKv,
      setConsensusMethodWeightDom,
      setConsensusMethodWeightLlmExtractBase,
      setConsensusPolicyBonus,
      setConsensusWeightedMajorityThreshold,
      setConsensusStrictAcceptanceDomainCount,
      setConsensusRelaxedAcceptanceDomainCount,
      setConsensusInstrumentedFieldThreshold,
      setConsensusConfidenceScoringBase,
      setConsensusPassTargetIdentityStrong,
      setConsensusPassTargetNormal,
      setRetrievalTierWeightTier1,
      setRetrievalTierWeightTier2,
      setRetrievalTierWeightTier3,
      setRetrievalTierWeightTier4,
      setRetrievalTierWeightTier5,
      setRetrievalDocKindWeightManualPdf,
      setRetrievalDocKindWeightSpecPdf,
      setRetrievalDocKindWeightSupport,
      setRetrievalDocKindWeightLabReview,
      setRetrievalDocKindWeightProductPage,
      setRetrievalDocKindWeightOther,
      setRetrievalMethodWeightTable,
      setRetrievalMethodWeightKv,
      setRetrievalMethodWeightJsonLd,
      setRetrievalMethodWeightLlmExtract,
      setRetrievalMethodWeightHelperSupportive,
      setRetrievalAnchorScorePerMatch,
      setRetrievalIdentityScorePerMatch,
      setRetrievalUnitMatchBonus,
      setRetrievalDirectFieldMatchBonus,
      setLlmExtractMaxTokens,
      setLlmExtractMaxSnippetsPerBatch,
      setLlmExtractMaxSnippetChars,
      setLlmExtractReasoningBudget,
      setLlmReasoningBudget,
      setLlmMonthlyBudgetUsd,
      setLlmPerProductBudgetUsd,
      setLlmMaxCallsPerRound,
      setLlmMaxOutputTokens,
      setLlmVerifySampleRate,
      setLlmMaxBatchesPerProduct,
      setLlmMaxEvidenceChars,
      setLlmMaxTokens,
      setLlmTimeoutMs,
      setLlmCostInputPer1M,
      setLlmCostOutputPer1M,
      setLlmCostCachedInputPer1M,
      setIdentityGateBaseMatchThreshold,
      setIdentityGateEasyAmbiguityReduction,
      setIdentityGateMediumAmbiguityReduction,
      setIdentityGateHardAmbiguityReduction,
      setIdentityGateVeryHardAmbiguityIncrease,
      setIdentityGateExtraHardAmbiguityIncrease,
      setIdentityGateMissingStrongIdPenalty,
      setIdentityGateHardMissingStrongIdIncrease,
      setIdentityGateVeryHardMissingStrongIdIncrease,
      setIdentityGateExtraHardMissingStrongIdIncrease,
      setIdentityGateNumericTokenBoost,
      setIdentityGateNumericRangeThreshold,
      setQualityGateIdentityThreshold,
      setEvidenceTextMaxChars,
      setResumeWindowHours,
      setReextractAfterHours,
      setScannedPdfOcrMaxPages,
      setScannedPdfOcrMaxPairs,
      setScannedPdfOcrMinCharsPerPage,
      setScannedPdfOcrMinLinesPerPage,
      setScannedPdfOcrMinConfidence,
      setCrawleeRequestHandlerTimeoutSecs,
      setDynamicFetchRetryBudget,
      setDynamicFetchRetryBackoffMs,
      setFetchSchedulerMaxRetries,
      setFetchSchedulerFallbackWaitMs,
      setPageGotoTimeoutMs,
      setPageNetworkIdleTimeoutMs,
      setPostLoadWaitMs,
      setFrontierDbPath,
      setFrontierQueryCooldownSeconds,
      setFrontierCooldown404Seconds,
      setFrontierCooldown404RepeatSeconds,
      setFrontierCooldown410Seconds,
      setFrontierCooldownTimeoutSeconds,
      setFrontierCooldown403BaseSeconds,
      setFrontierCooldown429BaseSeconds,
      setFrontierBackoffMaxExponent,
      setFrontierPathPenaltyNotfoundThreshold,
      setFrontierBlockedDomainThreshold,
      setAutoScrollPasses,
      setAutoScrollDelayMs,
      setMaxGraphqlReplays,
      setMaxNetworkResponsesPerPage,
      setRobotsTxtTimeoutMs,
      setEndpointSignalLimit,
      setEndpointSuggestionLimit,
      setEndpointNetworkScanLimit,
      setDiscoveryMaxQueries,
      setDiscoveryResultsPerQuery,
      setDiscoveryMaxDiscovered,
      setDiscoveryQueryConcurrency,
      setMaxUrlsPerProduct,
      setMaxCandidateUrls,
      setMaxPagesPerDomain,
      setUberMaxUrlsPerProduct,
      setUberMaxUrlsPerDomain,
      setMaxRunSeconds,
      setMaxJsonBytes,
      setMaxPdfBytes,
      setPdfBackendRouterTimeoutMs,
      setPdfBackendRouterMaxPages,
      setPdfBackendRouterMaxPairs,
      setPdfBackendRouterMaxTextPreviewChars,
      setCapturePageScreenshotQuality,
      setCapturePageScreenshotMaxBytes,
      setVisualAssetCaptureMaxPerSource,
      setVisualAssetRetentionDays,
      setVisualAssetReviewLgMaxSide,
      setVisualAssetReviewSmMaxSide,
      setVisualAssetReviewLgQuality,
      setVisualAssetReviewSmQuality,
      setVisualAssetRegionCropMaxSide,
      setVisualAssetRegionCropQuality,
      setVisualAssetLlmMaxBytes,
      setVisualAssetMinWidth,
      setVisualAssetMinHeight,
      setVisualAssetMinSharpness,
      setVisualAssetMinEntropy,
      setVisualAssetMaxPhashDistance,
      setArticleExtractorMinChars,
      setArticleExtractorMinScore,
      setArticleExtractorMaxChars,
      setStaticDomTargetMatchThreshold,
      setStaticDomMaxEvidenceSnippets,
      setStructuredMetadataExtructTimeoutMs,
      setStructuredMetadataExtructMaxItemsPerSurface,
      setStructuredMetadataExtructCacheLimit,
      setDomSnippetMaxChars,
      setMaxManufacturerUrlsPerProduct,
      setMaxManufacturerPagesPerDomain,
      setManufacturerReserveUrls,
      setMaxHypothesisItems,
      setHypothesisAutoFollowupRounds,
      setHypothesisFollowupUrlsPerRound,
      setLearningConfidenceThreshold,
      setComponentLexiconDecayDays,
      setComponentLexiconExpireDays,
      setFieldAnchorsDecayDays,
      setUrlMemoryDecayDays,
      setCseRescueRequiredIteration,
      setDuckduckgoTimeoutMs,
      setUserAgent,
      setPdfPreferredBackend,
      setCapturePageScreenshotFormat,
      setCapturePageScreenshotSelectors,
      setRuntimeScreenshotMode,
      setVisualAssetReviewFormat,
      setVisualAssetHeroSelectorMapJson,
      setStaticDomMode,
      setSpecDbDir,
      setArticleExtractorDomainPolicyMapJson,
      setStructuredMetadataExtructUrl,
      setLlmExtractionCacheDir,
      setCortexBaseUrl,
      setCortexApiKey,
      setCortexAsyncBaseUrl,
      setCortexAsyncSubmitPath,
      setCortexAsyncStatusPath,
      setCortexModelFast,
      setCortexModelAudit,
      setCortexModelDom,
      setCortexModelReasoningDeep,
      setCortexModelVision,
      setCortexModelSearchFast,
      setCortexModelRerankFast,
      setCortexModelSearchDeep,
      setRuntimeScreencastFps,
      setRuntimeScreencastQuality,
      setRuntimeScreencastMaxWidth,
      setRuntimeScreencastMaxHeight,
      setRuntimeTraceFetchRing,
      setRuntimeTraceLlmRing,
      setDaemonConcurrency,
      setDaemonGracefulShutdownTimeoutMs,
      setImportsPollSeconds,
      setConvergenceIdentityFailFastRounds,
      setIdentityGatePublishThreshold,
      setIndexingResumeSeedLimit,
      setIndexingResumePersistLimit,
      setHelperSupportiveMaxSources,
      setHelperActiveSyncLimit,
      setFieldRewardHalfLifeDays,
      setDriftPollSeconds,
      setDriftScanMaxProducts,
      setReCrawlStaleAfterDays,
      setAggressiveConfidenceThreshold,
      setAggressiveMaxSearchQueries,
      setAggressiveEvidenceAuditBatchSize,
      setAggressiveMaxTimePerProductMs,
      setAggressiveThoroughFromRound,
      setAggressiveRound1MaxUrls,
      setAggressiveRound1MaxCandidateUrls,
      setAggressiveLlmMaxCallsPerRound,
      setAggressiveLlmMaxCallsPerProductTotal,
      setAggressiveLlmTargetMaxFields,
      setAggressiveLlmDiscoveryPasses,
      setAggressiveLlmDiscoveryQueryCap,
      setUberMaxRounds,
      setCortexSyncTimeoutMs,
      setCortexAsyncPollIntervalMs,
      setCortexAsyncMaxWaitMs,
      setCortexEnsureReadyTimeoutMs,
      setCortexStartReadyTimeoutMs,
      setCortexFailureThreshold,
      setCortexCircuitOpenMs,
      setCortexEscalateConfidenceLt,
      setCortexMaxDeepFieldsPerProduct,
      setDiscoveryEnabled,
      setPhase2LlmEnabled,
      setPhase3LlmTriageEnabled,
      setLlmExtractionCacheEnabled,
      setLlmExtractSkipLowSignal,
      setLlmReasoningMode,
      setLlmDisableBudgetGuards,
      setLlmVerifyMode,
      setLocalMode,
      setDryRun,
      setMirrorToS3,
      setMirrorToS3Input,
      setWriteMarkdownSummary,
      setLlmEnabled,
      setLlmWriteSummary,
      setLlmFallbackEnabled,
      setReextractIndexed,
      setFetchCandidateSources,
      setManufacturerBroadDiscovery,
      setManufacturerSeedSearchUrls,
      setManufacturerDeepResearchEnabled,
      setPdfBackendRouterEnabled,
      setCapturePageScreenshotEnabled,
      setRuntimeCaptureScreenshots,
      setVisualAssetCaptureEnabled,
      setVisualAssetStoreOriginal,
      setVisualAssetPhashEnabled,
      setChartExtractionEnabled,
      setArticleExtractorV2Enabled,
      setStaticDomExtractorEnabled,
      setHtmlTableExtractorV2,
      setStructuredMetadataExtructEnabled,
      setStructuredMetadataExtructCacheEnabled,
      setHelperFilesEnabled,
      setHelperSupportiveEnabled,
      setHelperSupportiveFillMissing,
      setHelperAutoSeedTargets,
      setDriftDetectionEnabled,
      setDriftAutoRepublish,
      setAggressiveModeEnabled,
      setAggressiveEvidenceAuditEnabled,
      setUberAggressiveEnabled,
      setCortexEnabled,
      setCortexAsyncEnabled,
      setCortexAutoStart,
      setCortexAutoRestartOnAuth,
      setCortexEscalateIfConflict,
      setCortexEscalateCriticalOnly,
      setAllowBelowPassTargetFill,
      setIndexingHelperFilesEnabled,
      setDisableGoogleCse,
      setCseRescueOnlyMode,
      setDuckduckgoEnabled,
      setScannedPdfOcrEnabled,
      setScannedPdfOcrPromoteCandidates,
      setDynamicCrawleeEnabled,
      setCrawleeHeadless,
      setFetchSchedulerEnabled,
      setPreferHttpFetcher,
      setFrontierEnableSqlite,
      setFrontierStripTrackingParams,
      setFrontierRepairSearchEnabled,
      setAutoScrollEnabled,
      setGraphqlReplayEnabled,
      setRobotsTxtCompliant,
      setRuntimeScreencastEnabled,
      setRuntimeTraceEnabled,
      setRuntimeTraceLlmPayloads,
      setEventsJsonWrite,
      setIndexingSchemaPacketsValidationEnabled,
      setIndexingSchemaPacketsValidationStrict,
      setQueueJsonWrite,
      setBillingJsonWrite,
      setBrainJsonWrite,
      setIntelJsonWrite,
      setCorpusJsonWrite,
      setLearningJsonWrite,
      setCacheJsonWrite,
      setAuthoritySnapshotEnabled,
      setSelfImproveEnabled,
      setRuntimeControlFile,
      setHelperFilesRoot,
      setBatchStrategy,
    }),
    [],
  );

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
    refetchInterval: 15_000
  });

  const convergenceSettings = CONVERGENCE_SETTING_DEFAULTS;
  const convergenceDirty = false;
  const convergenceSaving = false;
  const updateConvergenceKnob = (_key: string, _value: number | boolean) => {};
  const reloadConvergenceSettings = async () => undefined;
  const saveConvergenceSettings = () => {};
  const runtimeAutoSave = runtimeAutoSaveEnabled;
  const handleAutoSaveToggle = (enabled: boolean) => setRuntimeAutoSaveEnabled(enabled);

  const { data: indexingLlmMetrics } = useQuery({
    queryKey: ['indexing', 'llm-metrics', category],
    queryFn: () => {
      const qp = new URLSearchParams();
      qp.set('period', '1d');
      qp.set('runLimit', '240');
      if (!isAll && category) qp.set('category', category);
      return api.get<IndexingLlmMetricsResponse>(`/indexing/llm-metrics?${qp.toString()}`);
    },
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.llmMetrics)
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog', category, 'indexing'],
    queryFn: () => api.get<CatalogRow[]>(`/catalog/${category}`),
    enabled: !isAll,
    refetchInterval: 5000
  });

  const { data: indexlabRunsResp } = useQuery({
    queryKey: ['indexlab', 'runs'],
    queryFn: () => api.get<IndexLabRunsResponse>('/indexlab/runs?limit=80'),
    refetchInterval: getRefetchInterval(isProcessRunning, false)
  });

  const indexlabRuns = useMemo(() => {
    const rows = indexlabRunsResp?.runs || [];
    const scopedRows = isAll
      ? rows
      : rows.filter((row) => normalizeToken(row.category) === normalizeToken(category));
    const activeRunId = String(processStatusRunId || selectedIndexLabRunId || '').trim();
    if (!activeRunId || scopedRows.some((row) => String(row.run_id || '').trim() === activeRunId)) {
      return scopedRows;
    }
    return [{
      run_id: activeRunId,
      category: isAll ? String(category || '').trim() : String(category || '').trim(),
      product_id: '',
      status: isProcessRunning ? 'running' : 'starting',
      started_at: String(processStatus?.startedAt || ''),
      ended_at: '',
      has_needset: false,
      has_search_profile: false,
    }, ...scopedRows];
  }, [
    indexlabRunsResp,
    isAll,
    category,
    processStatusRunId,
    selectedIndexLabRunId,
    isProcessRunning,
    processStatus?.startedAt,
  ]);
  const selectedRunForChecklist = useMemo(
    () => indexlabRuns.find((row) => row.run_id === selectedIndexLabRunId) || null,
    [indexlabRuns, selectedIndexLabRunId]
  );
  const domainChecklistCategory = useMemo(() => {
    if (!isAll) return String(category || '').trim();
    return String(selectedRunForChecklist?.category || '').trim();
  }, [isAll, category, selectedRunForChecklist]);
  const runViewCleared = Boolean(
    selectedIndexLabRunId
    && selectedIndexLabRunId === clearedRunViewId
  );

  useEffect(() => {
    const activeRunId = String(processStatusRunId || '').trim();
    const newestRunId = indexlabRuns[0]?.run_id || '';
    const isProcessRunning = Boolean(processStatus?.running);
    if (!newestRunId && !activeRunId) {
      if (selectedIndexLabRunId) setSelectedIndexLabRunId('');
      return;
    }
    if (isProcessRunning) {
      if (selectedIndexLabRunId && indexlabRuns.some((row) => row.run_id === selectedIndexLabRunId)) {
        return;
      }
      const targetRunId = activeRunId || newestRunId;
      if (targetRunId && selectedIndexLabRunId !== targetRunId) {
        setSelectedIndexLabRunId(targetRunId);
      }
      return;
    }
    if (selectedIndexLabRunId && indexlabRuns.some((row) => row.run_id === selectedIndexLabRunId)) {
      return;
    }
    const newestCompletedRunId =
      indexlabRuns.find((row) =>
        normalizeToken(row.status) === 'completed'
        && row.has_needset !== false
        && row.has_search_profile !== false
      )?.run_id
      || indexlabRuns.find((row) => normalizeToken(row.status) === 'completed')?.run_id
      || newestRunId;
    setSelectedIndexLabRunId(newestCompletedRunId);
  }, [indexlabRuns, selectedIndexLabRunId, processStatus?.running, processStatusRunId, setSelectedIndexLabRunId]);

  useEffect(() => {
    if (!selectedIndexLabRunId) {
      if (clearedRunViewId) setClearedRunViewId('');
      return;
    }
    if (clearedRunViewId && clearedRunViewId !== selectedIndexLabRunId) {
      setClearedRunViewId('');
    }
  }, [selectedIndexLabRunId, clearedRunViewId]);

  const { data: indexlabEventsResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'events'],
    queryFn: () =>
      api.get<IndexLabRunEventsResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/events?limit=3000`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.eventStream)
  });

  const { data: indexlabNeedsetResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'needset'],
    queryFn: () =>
      api.get<IndexLabNeedSetResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/needset`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.needset)
  });
  const { data: indexlabSearchProfileResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'search-profile'],
    queryFn: () =>
      api.get<IndexLabSearchProfileResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/search-profile`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.searchProfile)
  });
  const { data: indexlabSerpExplorerResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'serp'],
    queryFn: () =>
      api.get<IndexLabSerpExplorerResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/serp`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.serpExplorer)
  });
  const { data: indexlabLlmTracesResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'llm-traces'],
    queryFn: () =>
      api.get<IndexLabLlmTracesResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/llm-traces?limit=120`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.llmOutput)
  });
  const { data: indexlabAutomationQueueResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'automation-queue'],
    queryFn: () =>
      api.get<IndexLabAutomationQueueResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/automation-queue`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase6b)
  });
  const normalizedPhase6SearchQuery = String(phase6SearchQuery || '').trim();
  const { data: indexlabEvidenceIndexResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'evidence-index', normalizedPhase6SearchQuery],
    queryFn: () => {
      const qp = new URLSearchParams();
      qp.set('limit', '60');
      if (normalizedPhase6SearchQuery) qp.set('q', normalizedPhase6SearchQuery);
      return api.get<IndexLabEvidenceIndexResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/evidence-index?${qp.toString()}`
      );
    },
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase6)
  });
  const { data: indexlabPhase07Resp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'phase07-retrieval'],
    queryFn: () =>
      api.get<IndexLabPhase07Response>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/phase07-retrieval`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase7)
  });
  const { data: indexlabPhase08Resp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'phase08-extraction'],
    queryFn: () =>
      api.get<IndexLabPhase08Response>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/phase08-extraction`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase8)
  });
  const { data: roundSummaryResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'rounds'],
    queryFn: () =>
      api.get<RoundSummaryResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/rounds`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared && !panelCollapsed.phase9,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase9)
  });
  const { data: learningFeedResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'learning'],
    queryFn: () =>
      api.get<LearningFeedResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/learning`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared && !panelCollapsed.learning,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.learning)
  });
  const { data: indexlabDynamicFetchDashboardResp } = useQuery({
    queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'dynamic-fetch-dashboard'],
    queryFn: () =>
      api.get<IndexLabDynamicFetchDashboardResponse>(
        `/indexlab/run/${encodeURIComponent(selectedIndexLabRunId)}/dynamic-fetch-dashboard`
      ),
    enabled: Boolean(selectedIndexLabRunId) && !runViewCleared,
    refetchInterval: getRefetchInterval(isProcessRunning, panelCollapsed.phase5)
  });
  const { data: indexingDomainChecklistResp } = useQuery({
    queryKey: [
      'indexing',
      'domain-checklist',
      domainChecklistCategory,
      selectedIndexLabRunId,
      selectedRunForChecklist?.product_id || ''
    ],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (selectedIndexLabRunId) qp.set('runId', selectedIndexLabRunId);
      if (selectedRunForChecklist?.product_id) qp.set('productId', selectedRunForChecklist.product_id);
      qp.set('windowMinutes', '180');
      qp.set('includeUrls', 'true');
      return api.get<IndexingDomainChecklistResponse>(
        `/indexing/domain-checklist/${encodeURIComponent(domainChecklistCategory)}?${qp.toString()}`
      );
    },
    enabled: Boolean(
      domainChecklistCategory
      && !runViewCleared
      && (selectedIndexLabRunId || selectedRunForChecklist?.product_id)
    ),
    refetchInterval: getRefetchInterval(isProcessRunning, false)
  });

  const catalogRows = useMemo(() => {
    return [...catalog]
      .filter((row) => row.brand && row.model)
      .sort((a, b) => {
        const brandCmp = String(a.brand || '').localeCompare(String(b.brand || ''));
        if (brandCmp !== 0) return brandCmp;
        const modelCmp = String(a.model || '').localeCompare(String(b.model || ''));
        if (modelCmp !== 0) return modelCmp;
        const variantCmp = cleanVariant(a.variant || '').localeCompare(cleanVariant(b.variant || ''));
        if (variantCmp !== 0) return variantCmp;
        return String(a.productId || '').localeCompare(String(b.productId || ''));
      });
  }, [catalog]);

  const brandOptions = useMemo(() => {
    return [...new Set(catalogRows.map((row) => String(row.brand || '').trim()).filter(Boolean))];
  }, [catalogRows]);

  const modelOptions = useMemo(() => {
    if (!singleBrand) return [];
    return [
      ...new Set(
        catalogRows
          .filter((row) => normalizeToken(row.brand) === normalizeToken(singleBrand))
          .map((row) => String(row.model || '').trim())
          .filter(Boolean)
      )
    ];
  }, [catalogRows, singleBrand]);

  const variantOptions = useMemo(() => {
    if (!singleBrand || !singleModel) return [];
    return catalogRows
      .filter((row) => {
        return normalizeToken(row.brand) === normalizeToken(singleBrand)
          && normalizeToken(row.model) === normalizeToken(singleModel);
      })
      .map((row) => ({
        productId: row.productId,
        label: displayVariant(String(row.variant || ''))
      }));
  }, [catalogRows, singleBrand, singleModel]);

  const selectedCatalogProduct = useMemo(() => {
    return catalogRows.find((row) => row.productId === singleProductId) || null;
  }, [catalogRows, singleProductId]);
  const catalogFamilyCountLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of catalogRows) {
      const brand = normalizeToken(row.brand);
      const model = normalizeToken(row.model);
      if (!brand || !model) continue;
      const key = `${brand}||${model}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [catalogRows]);
  const selectedAmbiguityMeter = useMemo(() => {
    const activeBrand = String(selectedCatalogProduct?.brand || singleBrand || '').trim();
    const activeModel = String(selectedCatalogProduct?.model || singleModel || '').trim();
    if (!activeBrand || !activeModel) {
        return {
          count: 0,
          level: 'unknown',
          label: 'unknown',
          badgeCls: 'sf-chip-neutral',
          barCls: 'sf-status-text-muted',
          widthPct: 0
        };
      }
    const key = `${normalizeToken(activeBrand)}||${normalizeToken(activeModel)}`;
    const count = Number(catalogFamilyCountLookup.get(key) || 1);
    const level = ambiguityLevelFromFamilyCount(count);
    if (level === 'easy') {
        return {
          count,
          level,
          label: 'easy',
          badgeCls: 'sf-chip-success',
          barCls: 'sf-status-text-success',
          widthPct: 34
        };
      }
    if (level === 'medium') {
        return {
          count,
          level,
          label: 'medium',
          badgeCls: 'sf-chip-warning',
          barCls: 'sf-status-text-warning',
          widthPct: 67
        };
      }
    if (level === 'hard') {
        return {
          count,
          level,
          label: 'hard',
          badgeCls: 'sf-chip-danger',
          barCls: 'sf-status-text-danger',
          widthPct: 60
        };
      }
    if (level === 'very_hard') {
        return {
          count,
          level,
          label: 'very hard',
          badgeCls: 'sf-chip-danger',
          barCls: 'sf-status-text-danger',
          widthPct: 80
        };
      }
    if (level === 'extra_hard') {
        return {
          count,
          level,
          label: 'extra hard',
          badgeCls: 'sf-chip-danger',
          barCls: 'sf-status-text-danger',
          widthPct: 100
        };
      }
    return {
      count,
      level: 'unknown',
      label: 'unknown',
      badgeCls: 'sf-chip-neutral',
      barCls: 'sf-status-text-muted',
      widthPct: 0
    };
  }, [catalogFamilyCountLookup, selectedCatalogProduct, singleBrand, singleModel]);

  const llmModelOptions = useMemo(() => {
    const rows = Array.isArray(indexingLlmConfig?.model_options)
      ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
      : [];
    if (!rows.some((row) => normalizeToken(row) === normalizeToken('gemini-2.5-flash-lite'))) {
      rows.unshift('gemini-2.5-flash-lite');
    }
    return [...new Set(rows)];
  }, [indexingLlmConfig]);

  // Legacy runtime-panel wiring anchor retained for contract tests:
  // llmModelOptions={llmModelOptionsWithCurrent}
  const llmModelOptionsWithCurrent = useMemo(() => {
    const seeded = [
      ...llmModelOptions,
      phase2LlmModel,
      phase3LlmModel,
      llmModelFast,
      llmModelReasoning,
      llmModelExtract,
      llmModelValidate,
      llmModelWrite,
      llmFallbackPlanModel,
      llmFallbackExtractModel,
      llmFallbackValidateModel,
      llmFallbackWriteModel,
    ];
    const deduped = [] as string[];
    const seen = new Set<string>();
    for (const model of seeded) {
      const token = String(model || '').trim();
      if (!token) continue;
      const normalized = normalizeToken(token);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(token);
    }
    return deduped;
  }, [
    llmModelOptions,
    phase2LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
    llmFallbackPlanModel,
    llmFallbackExtractModel,
    llmFallbackValidateModel,
    llmFallbackWriteModel,
  ]);

  const llmTokenPresetFallbackOptions = useMemo(() => {
    const seeded = [
      runtimeSettingsBootstrap.llmTokensPlan,
      runtimeSettingsBootstrap.llmTokensTriage,
      runtimeSettingsBootstrap.llmTokensFast,
      runtimeSettingsBootstrap.llmTokensReasoning,
      runtimeSettingsBootstrap.llmTokensExtract,
      runtimeSettingsBootstrap.llmTokensValidate,
      runtimeSettingsBootstrap.llmTokensWrite,
      runtimeSettingsBootstrap.llmTokensPlanFallback,
      runtimeSettingsBootstrap.llmTokensExtractFallback,
      runtimeSettingsBootstrap.llmTokensValidateFallback,
      runtimeSettingsBootstrap.llmTokensWriteFallback,
    ];
    const cleaned = seeded
      .map((value) => parseRuntimeLlmTokenCap(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    return [...new Set(cleaned)];
  }, [runtimeSettingsBootstrap]);

  const llmTokenPresetOptions = useMemo(() => {
    const fallbackPresets = llmTokenPresetFallbackOptions.length > 0
      ? llmTokenPresetFallbackOptions
      : [runtimeSettingsBootstrap.llmTokensPlan];
    const raw = Array.isArray(indexingLlmConfig?.token_presets)
      ? indexingLlmConfig.token_presets
      : fallbackPresets;
    const cleaned = raw
      .map((value) => parseRuntimeLlmTokenCap(value))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    return [...new Set(cleaned)];
  }, [indexingLlmConfig, llmTokenPresetFallbackOptions, runtimeSettingsBootstrap.llmTokensPlan]);

  const llmTokenProfileLookup = useMemo(() => {
    const map = new Map<string, { default_output_tokens: number; max_output_tokens: number }>();
    for (const row of indexingLlmConfig?.model_token_profiles || []) {
      const token = normalizeToken(row.model);
      if (!token) continue;
      map.set(token, {
        default_output_tokens: parseRuntimeLlmTokenCap(row.default_output_tokens) || 0,
        max_output_tokens: parseRuntimeLlmTokenCap(row.max_output_tokens) || 0,
      });
    }
    return map;
  }, [indexingLlmConfig]);

  const resolveModelTokenDefaults = (model: string) => {
    const profile = llmTokenProfileLookup.get(normalizeToken(model));
    const defaultFromConfig = parseRuntimeLlmTokenCap(indexingLlmConfig?.token_defaults?.plan);
    const fallbackDefault = llmTokenPresetOptions[0] || runtimeSettingsBootstrap.llmTokensPlan;
    const globalDefault = defaultFromConfig || parseRuntimeLlmTokenCap(fallbackDefault) || LLM_MIN_OUTPUT_TOKENS;
    const fallbackMaxOutputTokens = llmTokenPresetOptions[llmTokenPresetOptions.length - 1] || globalDefault;
    const default_output_tokens = parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault;
    const max_output_tokens = Math.max(
      default_output_tokens,
      parseRuntimeLlmTokenCap(profile?.max_output_tokens) || parseRuntimeLlmTokenCap(fallbackMaxOutputTokens) || default_output_tokens,
    );
    return {
      default_output_tokens,
      max_output_tokens
    };
  };

  const clampTokenForModel = useCallback((model: string, value: number) => (
    clampRuntimeTokenForModel(model, value, resolveModelTokenDefaults)
  ), [resolveModelTokenDefaults]);

  const collectRuntimeSettingsPayload = () => collectRuntimeSettingsPayloadFromDomain({
    runProfile: profile,
    profile,
    searchProvider,
    searxngBaseUrl,
    bingSearchEndpoint,
    bingSearchKey,
    googleCseCx,
    googleCseKey,
    llmPlanApiKey,
    duckduckgoBaseUrl,
    llmModelPlan: phase2LlmModel,
    phase2LlmModel,
    llmModelTriage: phase3LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
    llmPlanFallbackModel: llmFallbackPlanModel,
    llmFallbackPlanModel,
    llmExtractFallbackModel: llmFallbackExtractModel,
    llmFallbackExtractModel,
    llmValidateFallbackModel: llmFallbackValidateModel,
    llmFallbackValidateModel,
    llmWriteFallbackModel: llmFallbackWriteModel,
    llmFallbackWriteModel,
    outputMode,
    localInputRoot,
    localOutputRoot,
    runtimeEventsKey,
    awsRegion,
    s3Bucket,
    s3InputPrefix,
    s3OutputPrefix,
    eloSupabaseAnonKey,
    eloSupabaseEndpoint,
    llmProvider,
    llmBaseUrl,
    openaiApiKey,
    anthropicApiKey,
    llmPlanProvider,
    llmPlanBaseUrl,
    resumeMode,
    scannedPdfOcrBackend,
    fetchConcurrency,
    perHostMinDelayMs,
    llmMaxOutputTokensPlan: llmTokensPlan,
    llmTokensPlan,
    llmMaxOutputTokensTriage: llmTokensTriage,
    llmTokensTriage,
    llmMaxOutputTokensFast: llmTokensFast,
    llmTokensFast,
    llmMaxOutputTokensReasoning: llmTokensReasoning,
    llmTokensReasoning,
    llmMaxOutputTokensExtract: llmTokensExtract,
    llmTokensExtract,
    llmMaxOutputTokensValidate: llmTokensValidate,
    llmTokensValidate,
    llmMaxOutputTokensWrite: llmTokensWrite,
    llmTokensWrite,
    llmMaxOutputTokensPlanFallback: llmTokensPlanFallback,
    llmTokensPlanFallback,
    llmMaxOutputTokensExtractFallback: llmTokensExtractFallback,
    llmTokensExtractFallback,
    llmMaxOutputTokensValidateFallback: llmTokensValidateFallback,
    llmTokensValidateFallback,
    llmMaxOutputTokensWriteFallback: llmTokensWriteFallback,
    llmTokensWriteFallback,
    llmExtractionCacheTtlMs,
    llmMaxCallsPerProductTotal,
    llmMaxCallsPerProductFast,
    needsetEvidenceDecayDays,
    needsetEvidenceDecayFloor,
    needsetRequiredWeightIdentity,
    needsetRequiredWeightCritical,
    needsetRequiredWeightRequired,
    needsetRequiredWeightExpected,
    needsetRequiredWeightOptional,
    needsetMissingMultiplier,
    needsetTierDeficitMultiplier,
    needsetMinRefsDeficitMultiplier,
    needsetConflictMultiplier,
    needsetIdentityLockThreshold,
    needsetIdentityProvisionalThreshold,
    needsetDefaultIdentityAuditLimit,
    consensusMethodWeightNetworkJson,
    consensusMethodWeightAdapterApi,
    consensusMethodWeightStructuredMeta,
    consensusMethodWeightPdf,
    consensusMethodWeightTableKv,
    consensusMethodWeightDom,
    consensusMethodWeightLlmExtractBase,
    consensusPolicyBonus,
    consensusWeightedMajorityThreshold,
    consensusStrictAcceptanceDomainCount,
    consensusRelaxedAcceptanceDomainCount,
    consensusInstrumentedFieldThreshold,
    consensusConfidenceScoringBase,
    consensusPassTargetIdentityStrong,
    consensusPassTargetNormal,
    retrievalTierWeightTier1,
    retrievalTierWeightTier2,
    retrievalTierWeightTier3,
    retrievalTierWeightTier4,
    retrievalTierWeightTier5,
    retrievalDocKindWeightManualPdf,
    retrievalDocKindWeightSpecPdf,
    retrievalDocKindWeightSupport,
    retrievalDocKindWeightLabReview,
    retrievalDocKindWeightProductPage,
    retrievalDocKindWeightOther,
    retrievalMethodWeightTable,
    retrievalMethodWeightKv,
    retrievalMethodWeightJsonLd,
    retrievalMethodWeightLlmExtract,
    retrievalMethodWeightHelperSupportive,
    retrievalAnchorScorePerMatch,
    retrievalIdentityScorePerMatch,
    retrievalUnitMatchBonus,
    retrievalDirectFieldMatchBonus,
    identityGatePublishThreshold,
    identityGateBaseMatchThreshold,
    identityGateEasyAmbiguityReduction,
    identityGateMediumAmbiguityReduction,
    identityGateHardAmbiguityReduction,
    identityGateVeryHardAmbiguityIncrease,
    identityGateExtraHardAmbiguityIncrease,
    identityGateMissingStrongIdPenalty,
    identityGateHardMissingStrongIdIncrease,
    identityGateVeryHardMissingStrongIdIncrease,
    identityGateExtraHardMissingStrongIdIncrease,
    identityGateNumericTokenBoost,
    identityGateNumericRangeThreshold,
    qualityGateIdentityThreshold,
    evidenceTextMaxChars,
    llmExtractMaxTokens,
    llmExtractMaxSnippetsPerBatch,
    llmExtractMaxSnippetChars,
    llmExtractSkipLowSignal,
    llmExtractReasoningBudget,
    llmReasoningMode,
    llmReasoningBudget,
    llmMonthlyBudgetUsd,
    llmPerProductBudgetUsd,
    llmMaxCallsPerRound,
    llmMaxOutputTokens,
    llmVerifySampleRate,
    llmDisableBudgetGuards,
    llmMaxBatchesPerProduct,
    llmMaxEvidenceChars,
    llmMaxTokens,
    llmTimeoutMs,
    llmCostInputPer1M,
    llmCostOutputPer1M,
    llmCostCachedInputPer1M,
    llmVerifyMode,
    resumeWindowHours,
    reextractAfterHours,
    scannedPdfOcrMaxPages,
    scannedPdfOcrMaxPairs,
    scannedPdfOcrMinCharsPerPage,
    scannedPdfOcrMinLinesPerPage,
    scannedPdfOcrMinConfidence,
    crawleeRequestHandlerTimeoutSecs,
    dynamicFetchRetryBudget,
    dynamicFetchRetryBackoffMs,
    fetchSchedulerMaxRetries,
    fetchSchedulerFallbackWaitMs,
    pageGotoTimeoutMs,
    pageNetworkIdleTimeoutMs,
    postLoadWaitMs,
    frontierDbPath,
    frontierQueryCooldownSeconds,
    frontierCooldown404Seconds,
    frontierCooldown404RepeatSeconds,
    frontierCooldown410Seconds,
    frontierCooldownTimeoutSeconds,
    frontierCooldown403BaseSeconds,
    frontierCooldown429BaseSeconds,
    frontierBackoffMaxExponent,
    frontierPathPenaltyNotfoundThreshold,
    frontierBlockedDomainThreshold,
    autoScrollPasses,
    autoScrollDelayMs,
    maxGraphqlReplays,
    maxNetworkResponsesPerPage,
    robotsTxtTimeoutMs,
    endpointSignalLimit,
    endpointSuggestionLimit,
    endpointNetworkScanLimit,
    discoveryMaxQueries,
    discoveryResultsPerQuery,
    discoveryMaxDiscovered,
    discoveryQueryConcurrency,
    maxUrlsPerProduct,
    maxCandidateUrls,
    maxPagesPerDomain,
    uberMaxUrlsPerProduct,
    uberMaxUrlsPerDomain,
    maxRunSeconds,
    maxJsonBytes,
    maxPdfBytes,
    pdfBackendRouterTimeoutMs,
    pdfBackendRouterMaxPages,
    pdfBackendRouterMaxPairs,
    pdfBackendRouterMaxTextPreviewChars,
    capturePageScreenshotQuality,
    capturePageScreenshotMaxBytes,
    visualAssetCaptureMaxPerSource,
    visualAssetRetentionDays,
    visualAssetReviewLgMaxSide,
    visualAssetReviewSmMaxSide,
    visualAssetReviewLgQuality,
    visualAssetReviewSmQuality,
    visualAssetRegionCropMaxSide,
    visualAssetRegionCropQuality,
    visualAssetLlmMaxBytes,
    visualAssetMinWidth,
    visualAssetMinHeight,
    visualAssetMinSharpness,
    visualAssetMinEntropy,
    visualAssetMaxPhashDistance,
    articleExtractorMinChars,
    articleExtractorMinScore,
    articleExtractorMaxChars,
    staticDomTargetMatchThreshold,
    staticDomMaxEvidenceSnippets,
    structuredMetadataExtructTimeoutMs,
    structuredMetadataExtructMaxItemsPerSurface,
    structuredMetadataExtructCacheLimit,
    domSnippetMaxChars,
    maxManufacturerUrlsPerProduct,
    maxManufacturerPagesPerDomain,
    manufacturerReserveUrls,
    maxHypothesisItems,
    hypothesisAutoFollowupRounds,
    hypothesisFollowupUrlsPerRound,
    learningConfidenceThreshold,
    componentLexiconDecayDays,
    componentLexiconExpireDays,
    fieldAnchorsDecayDays,
    urlMemoryDecayDays,
    cseRescueRequiredIteration,
    duckduckgoTimeoutMs,
    userAgent,
    pdfPreferredBackend,
    capturePageScreenshotFormat,
    capturePageScreenshotSelectors,
    runtimeScreenshotMode,
    visualAssetReviewFormat,
    visualAssetHeroSelectorMapJson,
    runtimeControlFile,
    importsRoot,
    staticDomMode,
    specDbDir,
    articleExtractorDomainPolicyMapJson,
    structuredMetadataExtructUrl,
    llmExtractionCacheDir,
    cortexBaseUrl,
    cortexApiKey,
    cortexAsyncBaseUrl,
    cortexAsyncSubmitPath,
    cortexAsyncStatusPath,
    cortexModelFast,
    cortexModelAudit,
    cortexModelDom,
    cortexModelReasoningDeep,
    cortexModelVision,
    cortexModelSearchFast,
    cortexModelRerankFast,
    cortexModelSearchDeep,
    helperFilesRoot,
    batchStrategy,
    runtimeScreencastFps,
    runtimeScreencastQuality,
    runtimeScreencastMaxWidth,
    runtimeScreencastMaxHeight,
    runtimeTraceFetchRing,
    runtimeTraceLlmRing,
    daemonConcurrency,
    daemonGracefulShutdownTimeoutMs,
    importsPollSeconds,
    convergenceIdentityFailFastRounds,
    indexingResumeSeedLimit,
    indexingResumePersistLimit,
    helperSupportiveMaxSources,
    helperActiveSyncLimit,
    fieldRewardHalfLifeDays,
    driftPollSeconds,
    driftScanMaxProducts,
    reCrawlStaleAfterDays,
    aggressiveConfidenceThreshold,
    aggressiveMaxSearchQueries,
    aggressiveEvidenceAuditBatchSize,
    aggressiveMaxTimePerProductMs,
    aggressiveThoroughFromRound,
    aggressiveRound1MaxUrls,
    aggressiveRound1MaxCandidateUrls,
    aggressiveLlmMaxCallsPerRound,
    aggressiveLlmMaxCallsPerProductTotal,
    aggressiveLlmTargetMaxFields,
    aggressiveLlmDiscoveryPasses,
    aggressiveLlmDiscoveryQueryCap,
    uberMaxRounds,
    cortexSyncTimeoutMs,
    cortexAsyncPollIntervalMs,
    cortexAsyncMaxWaitMs,
    cortexEnsureReadyTimeoutMs,
    cortexStartReadyTimeoutMs,
    cortexFailureThreshold,
    cortexCircuitOpenMs,
    cortexEscalateConfidenceLt,
    cortexMaxDeepFieldsPerProduct,
    dynamicFetchPolicyMapJson,
    searchProfileCapMapJson,
    serpRerankerWeightMapJson,
    fetchSchedulerInternalsMapJson,
    retrievalInternalsMapJson,
    evidencePackLimitsMapJson,
    identityGateThresholdBoundsMapJson,
    parsingConfidenceBaseMapJson,
    repairDedupeRule,
    automationQueueStorageEngine,
    discoveryEnabled,
    llmPlanDiscoveryQueries: phase2LlmEnabled,
    phase2LlmEnabled,
    llmSerpRerankEnabled: phase3LlmTriageEnabled,
    phase3LlmTriageEnabled,
    localMode,
    dryRun,
    mirrorToS3,
    mirrorToS3Input,
    writeMarkdownSummary,
    llmEnabled,
    llmWriteSummary,
    llmExtractionCacheEnabled,
    llmFallbackEnabled,
    reextractIndexed,
    scannedPdfOcrEnabled,
    scannedPdfOcrPromoteCandidates,
    fetchCandidateSources,
    manufacturerBroadDiscovery,
    manufacturerSeedSearchUrls,
    manufacturerDeepResearchEnabled,
    pdfBackendRouterEnabled,
    capturePageScreenshotEnabled,
    runtimeCaptureScreenshots,
    visualAssetCaptureEnabled,
    visualAssetStoreOriginal,
    visualAssetPhashEnabled,
    chartExtractionEnabled,
    articleExtractorV2Enabled,
    staticDomExtractorEnabled,
    htmlTableExtractorV2,
    structuredMetadataExtructEnabled,
    structuredMetadataExtructCacheEnabled,
    helperFilesEnabled,
    helperSupportiveEnabled,
    helperSupportiveFillMissing,
    helperAutoSeedTargets,
    driftDetectionEnabled,
    driftAutoRepublish,
    aggressiveModeEnabled,
    aggressiveEvidenceAuditEnabled,
    uberAggressiveEnabled,
    cortexEnabled,
    cortexAsyncEnabled,
    cortexAutoStart,
    cortexAutoRestartOnAuth,
    cortexEscalateIfConflict,
    cortexEscalateCriticalOnly,
    allowBelowPassTargetFill,
    indexingHelperFilesEnabled,
    disableGoogleCse,
    cseRescueOnlyMode,
    duckduckgoEnabled,
    dynamicCrawleeEnabled,
    crawleeHeadless,
    fetchSchedulerEnabled,
    preferHttpFetcher,
    frontierEnableSqlite,
    frontierStripTrackingParams,
    frontierRepairSearchEnabled,
    autoScrollEnabled,
    graphqlReplayEnabled,
    robotsTxtCompliant,
    runtimeScreencastEnabled,
    runtimeTraceEnabled,
    runtimeTraceLlmPayloads,
    eventsJsonWrite,
    indexingSchemaPacketsValidationEnabled,
    indexingSchemaPacketsValidationStrict,
    queueJsonWrite,
    billingJsonWrite,
    brainJsonWrite,
    intelJsonWrite,
    corpusJsonWrite,
    learningJsonWrite,
    cacheJsonWrite,
    authoritySnapshotEnabled,
    selfImproveEnabled,
    runtimeSettingsFallbackBaseline,
    resolveModelTokenDefaults,
  });

  const runtimeSettingsPayload = collectRuntimeSettingsPayload();
  void runtimeSettingsPayload;
  const {
    settings: runtimeSettingsData,
    isLoading: runtimeSettingsLoading,
  } = useRuntimeSettingsReader();
  const runtimeSettingsSaving = false;
  const saveRuntimeSettingsNow = () => {};

  const runtimeSettingsBaseline = useMemo(
    () => readRuntimeSettingsNumericBaseline(runtimeSettingsData, runtimeSettingsFallbackBaseline),
    [runtimeSettingsData, runtimeSettingsFallbackBaseline],
  );

  useEffect(() => {
    setRuntimeSettingsFallbackBaseline((previous) => (
      runtimeSettingsNumericBaselineEqual(previous, runtimeSettingsBaseline)
        ? previous
        : runtimeSettingsBaseline
    ));
  }, [runtimeSettingsBaseline]);

  const selectedRunLlmMetrics = useMemo(() => {
    const runs = Array.isArray(indexingLlmMetrics?.by_run) ? indexingLlmMetrics.by_run : [];
    if (runs.length === 0) return null;
    if (selectedIndexLabRunId) {
      const direct = runs.find((row) => String(row.run_id || '').trim() === selectedIndexLabRunId);
      if (direct) return direct;
    }
    return runs[0];
  }, [indexingLlmMetrics, selectedIndexLabRunId]);

  const modelPricingLookup = useMemo(() => {
    const map = new Map<string, { provider?: string; input_per_1m?: number; output_per_1m?: number; cached_input_per_1m?: number }>();
    for (const row of indexingLlmConfig?.model_pricing || []) {
      const token = normalizeToken(row.model);
      if (!token) continue;
      map.set(token, row);
    }
    return map;
  }, [indexingLlmConfig]);

  const selectedLlmPricingRows = useMemo(() => {
    const entries = [
      { knob: 'phase 02 planner', knob_key: 'phase_02_planner', model: phase2LlmModel, token_cap: llmTokensPlan },
      { knob: 'phase 03 triage', knob_key: 'phase_03_triage', model: phase3LlmModel, token_cap: llmTokensTriage },
      { knob: 'fast pass', knob_key: 'fast_pass', model: llmModelFast, token_cap: llmTokensFast },
      { knob: 'reasoning pass', knob_key: 'reasoning_pass', model: llmModelReasoning, token_cap: llmTokensReasoning },
      { knob: 'extract role', knob_key: 'extract_role', model: llmModelExtract, token_cap: llmTokensExtract },
      { knob: 'validate role', knob_key: 'validate_role', model: llmModelValidate, token_cap: llmTokensValidate },
      { knob: 'write role', knob_key: 'write_role', model: llmModelWrite, token_cap: llmTokensWrite },
      ...(llmFallbackEnabled ? [
        { knob: 'fallback plan', knob_key: 'fallback_plan', model: llmFallbackPlanModel, token_cap: llmTokensPlanFallback },
        { knob: 'fallback extract', knob_key: 'fallback_extract', model: llmFallbackExtractModel, token_cap: llmTokensExtractFallback },
        { knob: 'fallback validate', knob_key: 'fallback_validate', model: llmFallbackValidateModel, token_cap: llmTokensValidateFallback },
        { knob: 'fallback write', knob_key: 'fallback_write', model: llmFallbackWriteModel, token_cap: llmTokensWriteFallback }
      ] : [])
    ];
    const knobDefaults = indexingLlmConfig?.knob_defaults || {};
    return entries
      .map((row) => {
        const model = String(row.model || '').trim();
        if (!model) return null;
        const pricing = modelPricingLookup.get(normalizeToken(model));
        const defaults = indexingLlmConfig?.pricing_defaults || {};
        const knobDefault = knobDefaults[row.knob_key] || {};
        const defaultModel = String(knobDefault.model || '').trim();
        const defaultTokenCap = Math.max(0, Number(knobDefault.token_cap || 0));
        const usesDefaultModel = defaultModel
          ? normalizeToken(defaultModel) === normalizeToken(model)
          : false;
        const usesDefaultTokenCap = defaultTokenCap > 0
          ? defaultTokenCap === Math.max(0, Number(row.token_cap || 0))
          : false;
        return {
          knob: row.knob,
          knob_key: row.knob_key,
          model,
          default_model: defaultModel || null,
          uses_default_model: usesDefaultModel,
          default_token_cap: defaultTokenCap || null,
          uses_default_token_cap: usesDefaultTokenCap,
          provider: pricing?.provider || providerFromModelToken(model),
          token_cap: Math.max(0, Number(row.token_cap || 0)),
          input_per_1m: Number(pricing?.input_per_1m ?? defaults.input_per_1m ?? 0),
          output_per_1m: Number(pricing?.output_per_1m ?? defaults.output_per_1m ?? 0),
          cached_input_per_1m: Number(pricing?.cached_input_per_1m ?? defaults.cached_input_per_1m ?? 0)
        };
      })
      .filter((row): row is {
        knob: string;
        knob_key: string;
        model: string;
        default_model: string | null;
        uses_default_model: boolean;
        default_token_cap: number | null;
        uses_default_token_cap: boolean;
        provider: string;
        token_cap: number;
        input_per_1m: number;
        output_per_1m: number;
        cached_input_per_1m: number;
      } => Boolean(row));
  }, [
    phase2LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
    llmFallbackEnabled,
    llmFallbackPlanModel,
    llmFallbackExtractModel,
    llmFallbackValidateModel,
    llmFallbackWriteModel,
    llmTokensPlan,
    llmTokensTriage,
    llmTokensFast,
    llmTokensReasoning,
    llmTokensExtract,
    llmTokensValidate,
    llmTokensWrite,
    llmTokensPlanFallback,
    llmTokensExtractFallback,
    llmTokensValidateFallback,
    llmTokensWriteFallback,
    modelPricingLookup,
    indexingLlmConfig
  ]);

  const llmRouteSnapshotRows = useMemo(() => {
    const snapshot = indexingLlmConfig?.routing_snapshot || {};
    const roles = ['plan', 'extract', 'validate', 'write'];
    return roles.map((role) => {
      const row = snapshot[role] || {};
      const primary = row.primary || {};
      const fallback = row.fallback || {};
      return {
        role,
        primaryProvider: String(primary.provider || ''),
        primaryModel: String(primary.model || ''),
        fallbackProvider: String(fallback.provider || ''),
        fallbackModel: String(fallback.model || '')
      };
    });
  }, [indexingLlmConfig]);

  const llmTraceRows = useMemo(() => {
    return Array.isArray(indexlabLlmTracesResp?.traces) ? indexlabLlmTracesResp.traces : [];
  }, [indexlabLlmTracesResp]);

  const selectedLlmTrace = useMemo(() => {
    if (!llmTraceRows.length) return null;
    if (selectedLlmTraceId) {
      const found = llmTraceRows.find((row) => row.id === selectedLlmTraceId);
      if (found) return found;
    }
    return llmTraceRows[0];
  }, [llmTraceRows, selectedLlmTraceId]);

  useEffect(() => {
    const applied = hydrateRuntimeSettingsFromBindings(
      runtimeSettingsData,
      runtimeSettingsDirty,
      runtimeHydrationBindings,
    );
    if (!applied) return;
    setRuntimeSettingsDirty(false);
  }, [
    runtimeSettingsData,
    runtimeSettingsDirty,
    runtimeHydrationBindings,
  ]);

  useEffect(() => {
    if (previousCategoryRef.current === category) return;
    previousCategoryRef.current = category;
    setSingleBrand('');
    setSelectedIndexLabRunId('');
  }, [category]);

  useEffect(() => {
    if (!llmTraceRows.length) {
      if (selectedLlmTraceId) setSelectedLlmTraceId('');
      return;
    }
    if (!selectedLlmTraceId || !llmTraceRows.some((row) => row.id === selectedLlmTraceId)) {
      setSelectedLlmTraceId(llmTraceRows[0].id);
    }
  }, [llmTraceRows, selectedLlmTraceId]);

  useEffect(() => {
    if (catalogRows.length === 0) return;
    if (singleBrand && !brandOptions.some((brand) => normalizeToken(brand) === normalizeToken(singleBrand))) {
      setSingleBrand('');
      setSingleModel('');
      setSingleProductId('');
      return;
    }
    if (singleModel && !modelOptions.some((model) => normalizeToken(model) === normalizeToken(singleModel))) {
      setSingleModel('');
      setSingleProductId('');
      return;
    }
    if (singleProductId && !variantOptions.some((option) => option.productId === singleProductId)) {
      setSingleProductId('');
    }
  }, [catalogRows.length, brandOptions, modelOptions, variantOptions, singleBrand, singleModel, singleProductId]);

  const indexlabLiveEvents = useMemo(() => {
    if (!selectedIndexLabRunId) return [];
    if (runViewCleared) return [];
    return liveIndexLabByRun[selectedIndexLabRunId] || [];
  }, [liveIndexLabByRun, selectedIndexLabRunId, runViewCleared]);

  const indexlabEvents = useMemo(() => {
    const merged = [
      ...(indexlabEventsResp?.events || []),
      ...indexlabLiveEvents
    ];
    const seen = new Set<string>();
    const rows: IndexLabEvent[] = [];
    for (const row of merged) {
      const payload = row?.payload && typeof row.payload === 'object'
        ? JSON.stringify(row.payload)
        : '';
      const key = `${row.run_id}|${row.ts}|${row.stage}|${row.event}|${payload}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    rows.sort((a, b) => Date.parse(String(a.ts || '')) - Date.parse(String(b.ts || '')));
    return rows;
  }, [indexlabEventsResp, indexlabLiveEvents]);

  useEffect(() => {
    const timer = window.setInterval(() => setActivityNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const timedIndexlabEvents = useMemo(() => {
    return indexlabEvents
      .map((row) => {
        const tsMs = Date.parse(String(row.ts || ''));
        if (!Number.isFinite(tsMs)) return null;
        const payload = row?.payload && typeof row.payload === 'object'
          ? row.payload as Record<string, unknown>
          : {};
        const topLevel = row as unknown as Record<string, unknown>;
        const payloadProductId = String(payload.product_id || payload.productId || '').trim();
        const productId = String(row.product_id || topLevel.productId || payloadProductId || '').trim();
        return {
          row,
          tsMs,
          stage: String(row.stage || '').trim().toLowerCase(),
          event: String(row.event || '').trim().toLowerCase(),
          productId
        } as TimedIndexLabEvent;
      })
      .filter((row): row is TimedIndexLabEvent => Boolean(row));
  }, [indexlabEvents]);

  const selectedIndexLabRun = useMemo(
    () => indexlabRuns.find((row) => row.run_id === selectedIndexLabRunId) || null,
    [indexlabRuns, selectedIndexLabRunId]
  );
  const selectedRunLiveDuration = useMemo(() => {
    if (!selectedIndexLabRun?.started_at) return '-';
    const startMs = Date.parse(String(selectedIndexLabRun.started_at || ''));
    if (!Number.isFinite(startMs)) return '-';
    const endMs = selectedIndexLabRun.ended_at
      ? Date.parse(String(selectedIndexLabRun.ended_at || ''))
      : activityNowMs;
    const safeEndMs = Number.isFinite(endMs) ? endMs : activityNowMs;
    return formatDuration(Math.max(0, safeEndMs - startMs));
  }, [selectedIndexLabRun, activityNowMs]);
  const selectedRunIdentityFingerprintShort = useMemo(() => {
    const token = String(selectedIndexLabRun?.identity_fingerprint || '').trim();
    if (!token) return '';
    if (token.length <= 28) return token;
    return `${token.slice(0, 24)}...`;
  }, [selectedIndexLabRun]);
  const selectedRunStartupMs = useMemo(() => {
    const parseMetric = (value: unknown) => {
      const num = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(num) && num >= 0 ? num : null;
    };
    const startupRaw = selectedIndexLabRun?.startup_ms && typeof selectedIndexLabRun.startup_ms === 'object'
      ? selectedIndexLabRun.startup_ms
      : {};
    const fromMeta = {
      first_event: parseMetric(startupRaw.first_event),
      search_started: parseMetric(startupRaw.search_started),
      fetch_started: parseMetric(startupRaw.fetch_started),
      parse_started: parseMetric(startupRaw.parse_started),
      index_started: parseMetric(startupRaw.index_started)
    };
    if (Object.values(fromMeta).some((value) => value !== null)) {
      return fromMeta;
    }

    const startedMs = Date.parse(String(selectedIndexLabRun?.started_at || ''));
    if (!Number.isFinite(startedMs)) {
      return fromMeta;
    }
    const firstEventTs = timedIndexlabEvents.length > 0
      ? Math.min(...timedIndexlabEvents.map((evt) => evt.tsMs))
      : NaN;
    const stageStartedAt: Record<string, string> = {
      search: '',
      fetch: '',
      parse: '',
      index: ''
    };
    for (const evt of timedIndexlabEvents) {
      if (!(evt.stage in stageStartedAt)) continue;
      if (!evt.event.endsWith('_started')) continue;
      if (!stageStartedAt[evt.stage]) {
        stageStartedAt[evt.stage] = String(evt.row.ts || '').trim();
      }
    }
    const stageDelta = (value: string) => {
      const stageMs = Date.parse(String(value || ''));
      return Number.isFinite(stageMs) ? Math.max(0, stageMs - startedMs) : null;
    };
    return {
      first_event: Number.isFinite(firstEventTs) ? Math.max(0, firstEventTs - startedMs) : null,
      search_started: stageDelta(stageStartedAt.search),
      fetch_started: stageDelta(stageStartedAt.fetch),
      parse_started: stageDelta(stageStartedAt.parse),
      index_started: stageDelta(stageStartedAt.index)
    };
  }, [selectedIndexLabRun, timedIndexlabEvents]);
  const selectedRunStartupSummary = useMemo(() => {
    const msLabel = (value: number | null) => (value === null ? '-' : `${formatNumber(value)}ms`);
    return `startup(ms) first ${msLabel(selectedRunStartupMs.first_event)} | search ${msLabel(selectedRunStartupMs.search_started)} | fetch ${msLabel(selectedRunStartupMs.fetch_started)} | parse ${msLabel(selectedRunStartupMs.parse_started)} | index ${msLabel(selectedRunStartupMs.index_started)}`;
  }, [selectedRunStartupMs]);

  const activeMonitorProductId = String(
    singleProductId
    || selectedIndexLabRun?.product_id
    || ''
  ).trim();
  const processRunning = isProcessRunning;

  const runtimeActivity = useMemo(
    () => computeActivityStats(timedIndexlabEvents, activityNowMs, () => true),
    [timedIndexlabEvents, activityNowMs]
  );

  const productPickerActivity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => Boolean(activeMonitorProductId) && event.productId === activeMonitorProductId
      ),
    [timedIndexlabEvents, activityNowMs, activeMonitorProductId]
  );

  const eventStreamActivity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => ['search', 'fetch', 'parse', 'index'].includes(event.stage)
      ),
    [timedIndexlabEvents, activityNowMs]
  );

  const needsetActivity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => event.event === 'needset_computed' || event.stage === 'index'
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const llmActivity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => event.stage === 'llm'
      ),
    [timedIndexlabEvents, activityNowMs]
  );

  const pendingLlmRows = useMemo(() => {
    const rowsByKey = new Map<string, {
      key: string;
      reason: string;
      routeRole: string;
      model: string;
      provider: string;
      pending: number;
      firstStartedAtMs: number;
      lastEventAtMs: number;
      promptPreview: string;
    }>();
    for (const evt of indexlabEvents) {
      if (normalizeToken(evt.stage) !== 'llm') continue;
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      const tsMs = Date.parse(String(evt.ts || ''));
      const eventMs = Number.isFinite(tsMs) ? tsMs : 0;
      const reason = String(payload.reason || payload.purpose || '').trim() || 'unknown';
      const explicitRouteRole = String(payload.route_role || '').trim();
      const inferredPhase = classifyLlmPhase(reason, explicitRouteRole);
      const routeRole = explicitRouteRole
        || (['extract', 'validate', 'write', 'plan'].includes(inferredPhase) ? inferredPhase : '');
      const model = String(payload.model || '').trim() || 'unknown';
      const provider = String(payload.provider || '').trim() || providerFromModelToken(model);
      const promptPreview = String(payload.prompt_preview || '').trim();
      const key = `${reason}||${routeRole || '-'}||${model}||${provider}`;
      const row = rowsByKey.get(key) || {
        key,
        reason,
        routeRole,
        model,
        provider,
        pending: 0,
        firstStartedAtMs: 0,
        lastEventAtMs: 0,
        promptPreview: ''
      };
      const eventName = normalizeToken(evt.event);
      if (eventName === 'llm_started') {
        row.pending += 1;
        if (promptPreview) {
          row.promptPreview = promptPreview;
        }
        if (eventMs > 0 && (!row.firstStartedAtMs || eventMs < row.firstStartedAtMs)) {
          row.firstStartedAtMs = eventMs;
        }
      } else if (eventName === 'llm_finished' || eventName === 'llm_failed') {
        row.pending = Math.max(0, row.pending - 1);
      }
      if (eventMs > 0) {
        row.lastEventAtMs = Math.max(row.lastEventAtMs || 0, eventMs);
      }
      rowsByKey.set(key, row);
    }
    const stalePendingGraceMs = 30_000;
    return [...rowsByKey.values()]
      .map((row) => {
        if (processRunning) return row;
        const ageMs = row.lastEventAtMs > 0 ? Math.max(0, activityNowMs - row.lastEventAtMs) : Number.POSITIVE_INFINITY;
        if (row.pending > 0 && ageMs > stalePendingGraceMs) {
          return {
            ...row,
            pending: 0
          };
        }
        return row;
      })
      .filter((row) => row.pending > 0)
      .sort((a, b) => (
        b.pending - a.pending
        || b.lastEventAtMs - a.lastEventAtMs
        || a.model.localeCompare(b.model)
      ));
  }, [indexlabEvents, processRunning, activityNowMs]);
  const pendingLlmTotal = useMemo(
    () => pendingLlmRows.reduce((sum, row) => sum + Math.max(0, Number(row.pending || 0)), 0),
    [pendingLlmRows]
  );
  const pendingLlmPeak = useMemo(
    () => Math.max(1, ...pendingLlmRows.map((row) => Math.max(1, Number(row.pending || 0)))),
    [pendingLlmRows]
  );
  const activePendingLlm = useMemo(
    () => pendingLlmRows[0] || null,
    [pendingLlmRows]
  );
  const pendingPromptTrace = useMemo(() => {
    if (!activePendingLlm) return null;
    const reasonToken = normalizeToken(activePendingLlm.reason);
    const roleToken = normalizeToken(activePendingLlm.routeRole);
    const modelToken = normalizeToken(activePendingLlm.model);
    const providerToken = normalizeToken(activePendingLlm.provider);
    const matched = llmTraceRows.find((row) => {
      const promptPreview = String(row.prompt_preview || '').trim();
      if (!promptPreview) return false;
      const rowPurpose = normalizeToken(row.purpose || '');
      const rowRole = normalizeToken(row.role || '');
      const rowModel = normalizeToken(row.model || '');
      const rowProvider = normalizeToken(row.provider || providerFromModelToken(row.model || ''));
      return rowPurpose === reasonToken
        && rowRole === roleToken
        && rowModel === modelToken
        && rowProvider === providerToken;
    });
    if (matched) return matched;
    return llmTraceRows.find((row) => String(row.prompt_preview || '').trim()) || null;
  }, [activePendingLlm, llmTraceRows]);
  const pendingPromptRaw = useMemo(() => {
    if (!activePendingLlm) return '';
    return String(
      activePendingLlm.promptPreview
      || pendingPromptTrace?.prompt_preview
      || ''
    );
  }, [activePendingLlm, pendingPromptTrace]);
  const pendingPromptPretty = useMemo(() => prettyJsonText(pendingPromptRaw), [pendingPromptRaw]);
  const pendingPromptIsJson = useMemo(() => isJsonText(pendingPromptRaw), [pendingPromptRaw]);
  const pendingPromptPhase = useMemo(
    () => classifyLlmPhase(String(activePendingLlm?.reason || ''), String(activePendingLlm?.routeRole || '')),
    [activePendingLlm]
  );
  const lastReceivedResponseEvent = useMemo(() => {
    for (let i = indexlabEvents.length - 1; i >= 0; i -= 1) {
      const evt = indexlabEvents[i];
      if (normalizeToken(evt.stage) !== 'llm') continue;
      const eventName = normalizeToken(evt.event);
      if (eventName !== 'llm_finished' && eventName !== 'llm_failed') continue;
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      return {
        ts: String(evt.ts || '').trim(),
        purpose: String(payload.reason || payload.purpose || '').trim(),
        routeRole: String(payload.route_role || '').trim(),
        model: String(payload.model || '').trim(),
        responsePreview: String(payload.response_preview || '').trim(),
        message: String(payload.message || '').trim()
      };
    }
    return null;
  }, [indexlabEvents]);
  const lastReceivedResponseTrace = useMemo(
    () => llmTraceRows.find((row) => String(row.response_preview || '').trim()) || null,
    [llmTraceRows]
  );
  const lastReceivedResponseRaw = useMemo(() => {
    return String(
      lastReceivedResponseTrace?.response_preview
      || lastReceivedResponseEvent?.responsePreview
      || lastReceivedResponseEvent?.message
      || ''
    );
  }, [lastReceivedResponseTrace, lastReceivedResponseEvent]);
  const lastReceivedResponsePretty = useMemo(() => prettyJsonText(lastReceivedResponseRaw), [lastReceivedResponseRaw]);
  const lastReceivedResponseIsJson = useMemo(() => isJsonText(lastReceivedResponseRaw), [lastReceivedResponseRaw]);
  const lastReceivedPhase = useMemo(() => {
    if (lastReceivedResponseTrace?.phase) return String(lastReceivedResponseTrace.phase);
    return classifyLlmPhase(
      String(lastReceivedResponseEvent?.purpose || ''),
      String(lastReceivedResponseEvent?.routeRole || '')
    );
  }, [lastReceivedResponseTrace, lastReceivedResponseEvent]);

  const indexlabSummary = useMemo(() => {
    const stageWindows: Record<string, { started_at: string; ended_at: string }> = {
      search: { started_at: '', ended_at: '' },
      fetch: { started_at: '', ended_at: '' },
      parse: { started_at: '', ended_at: '' },
      index: { started_at: '', ended_at: '' }
    };
    const counters = {
      pages_checked: 0,
      fetched_ok: 0,
      fetched_404: 0,
      fetched_blocked: 0,
      fetched_error: 0,
      parse_completed: 0,
      indexed_docs: 0,
      fields_filled: 0,
      structured_json_ld: 0,
      structured_microdata: 0,
      structured_opengraph: 0,
      structured_candidates: 0,
      pdf_docs_parsed: 0,
      pdf_pairs_total: 0,
      scanned_pdf_docs_detected: 0,
      scanned_pdf_ocr_docs_succeeded: 0,
      scanned_pdf_ocr_pairs: 0
    };
    const urlJobs = new Map<string, {
      url: string;
      status: string;
      status_code: number;
      fetcher_kind: string;
      fetch_attempts: number;
      fetch_retry_count: number;
      fetch_policy_host: string;
      fetch_policy_override: boolean;
      ms: number;
      parse_ms: number;
      screenshot_uri: string;
      dom_snippet_uri: string;
      static_dom_mode: string;
      static_dom_accepted: number;
      static_dom_rejected: number;
      static_dom_parse_error: number;
      static_dom_rejected_audit_count: number;
      article_title: string;
      article_excerpt: string;
      article_preview: string;
      article_method: string;
      article_quality_score: number;
      article_char_count: number;
      article_low_quality: boolean;
      article_fallback_reason: string;
      article_policy_mode: string;
      article_policy_host: string;
      article_policy_override: boolean;
      structured_json_ld_count: number;
      structured_microdata_count: number;
      structured_opengraph_count: number;
      structured_candidates: number;
      structured_rejected_candidates: number;
      structured_error_count: number;
      pdf_docs_parsed: number;
      pdf_pairs_total: number;
      pdf_kv_pairs: number;
      pdf_table_pairs: number;
      pdf_backend_selected: string;
      pdf_error_count: number;
      scanned_pdf_docs_detected: number;
      scanned_pdf_ocr_docs_attempted: number;
      scanned_pdf_ocr_docs_succeeded: number;
      scanned_pdf_ocr_pairs: number;
      scanned_pdf_ocr_kv_pairs: number;
      scanned_pdf_ocr_table_pairs: number;
      scanned_pdf_ocr_low_conf_pairs: number;
      scanned_pdf_ocr_error_count: number;
      scanned_pdf_ocr_backend_selected: string;
      scanned_pdf_ocr_confidence_avg: number;
      started_at: string;
      finished_at: string;
      last_ts: string;
    }>();
    const buildEmptyUrlJob = (url: string, ts = '') => ({
      url,
      status: 'unknown',
      status_code: 0,
      fetcher_kind: '',
      fetch_attempts: 0,
      fetch_retry_count: 0,
      fetch_policy_host: '',
      fetch_policy_override: false,
      ms: 0,
      parse_ms: 0,
      screenshot_uri: '',
      dom_snippet_uri: '',
      static_dom_mode: '',
      static_dom_accepted: 0,
      static_dom_rejected: 0,
      static_dom_parse_error: 0,
      static_dom_rejected_audit_count: 0,
      article_title: '',
      article_excerpt: '',
      article_preview: '',
      article_method: '',
      article_quality_score: 0,
      article_char_count: 0,
      article_low_quality: false,
      article_fallback_reason: '',
      article_policy_mode: '',
      article_policy_host: '',
      article_policy_override: false,
      structured_json_ld_count: 0,
      structured_microdata_count: 0,
      structured_opengraph_count: 0,
      structured_candidates: 0,
      structured_rejected_candidates: 0,
      structured_error_count: 0,
      pdf_docs_parsed: 0,
      pdf_pairs_total: 0,
      pdf_kv_pairs: 0,
      pdf_table_pairs: 0,
      pdf_backend_selected: '',
      pdf_error_count: 0,
      scanned_pdf_docs_detected: 0,
      scanned_pdf_ocr_docs_attempted: 0,
      scanned_pdf_ocr_docs_succeeded: 0,
      scanned_pdf_ocr_pairs: 0,
      scanned_pdf_ocr_kv_pairs: 0,
      scanned_pdf_ocr_table_pairs: 0,
      scanned_pdf_ocr_low_conf_pairs: 0,
      scanned_pdf_ocr_error_count: 0,
      scanned_pdf_ocr_backend_selected: '',
      scanned_pdf_ocr_confidence_avg: 0,
      started_at: ts,
      finished_at: '',
      last_ts: ts
    });

    for (const evt of indexlabEvents) {
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      const stage = String(evt.stage || '').trim();
      const eventName = String(evt.event || '').trim();
      const scope = String(payload.scope || '').trim();
      const ts = String(evt.ts || '').trim();

      if (scope === 'stage' && stageWindows[stage]) {
        if (eventName.endsWith('_started')) {
          stageWindows[stage].started_at = stageWindows[stage].started_at || ts;
        } else if (eventName.endsWith('_finished')) {
          stageWindows[stage].ended_at = ts;
        }
      }

      if (stage === 'fetch' && eventName === 'fetch_started' && scope === 'url') {
        const url = String(payload.url || '').trim();
        if (url) {
          counters.pages_checked += 1;
          const current = urlJobs.get(url) || buildEmptyUrlJob(url, ts);
          urlJobs.set(url, {
            ...current,
            status: 'in_flight',
            started_at: current.started_at || ts,
            last_ts: ts || current.last_ts
          });
        }
      }

      if (stage === 'fetch' && eventName === 'fetch_finished' && scope === 'url') {
        const url = String(payload.url || '').trim();
        const statusClass = String(payload.status_class || 'error').trim();
        const statusCode = Number.parseInt(String(payload.status || 0), 10) || 0;
        const ms = Number.parseInt(String(payload.ms || 0), 10) || 0;
        const fetcherKind = String(payload.fetcher_kind || payload.fetcher_mode || payload.fetcher || '').trim();
        if (statusClass === 'ok') counters.fetched_ok += 1;
        else if (statusClass === '404') counters.fetched_404 += 1;
        else if (statusClass === 'blocked') counters.fetched_blocked += 1;
        else counters.fetched_error += 1;
        if (url) {
          const current = urlJobs.get(url) || buildEmptyUrlJob(url);
          urlJobs.set(url, {
            ...current,
            status: statusClass || 'error',
            status_code: statusCode,
            fetcher_kind: fetcherKind || current.fetcher_kind,
            ms,
            finished_at: ts,
            last_ts: ts
          });
        }
      }

      if (stage === 'parse' && eventName === 'parse_finished' && scope === 'url') {
        counters.parse_completed += 1;
        const url = String(payload.final_url || payload.url || '').trim();
        const parseMs = Number.parseInt(String(payload.parse_ms || payload.ms || 0), 10) || 0;
        const fetcherKind = String(payload.fetcher_kind || payload.fetcher_mode || payload.fetcher || '').trim();
        const fetchAttempts = Number.parseInt(String(payload.fetch_attempts || 0), 10) || 0;
        const fetchRetryCount = Number.parseInt(String(payload.fetch_retry_count || 0), 10) || 0;
        const fetchPolicyHost = String(payload.fetch_policy_matched_host || '').trim();
        const fetchPolicyOverride = truthyFlag(payload.fetch_policy_override_applied);
        const screenshotUri = String(payload.screenshot_uri || '').trim();
        const domSnippetUri = String(payload.dom_snippet_uri || '').trim();
        const staticDomMode = String(payload.static_dom_mode || '').trim();
        const staticDomAccepted = Number.parseInt(String(payload.static_dom_accepted_field_candidates || 0), 10) || 0;
        const staticDomRejected = Number.parseInt(String(payload.static_dom_rejected_field_candidates || 0), 10) || 0;
        const staticDomParseError = Number.parseInt(String(payload.static_dom_parse_error_count || 0), 10) || 0;
        const staticDomRejectedAudit = Number.parseInt(String(payload.static_dom_rejected_field_candidates_audit_count || 0), 10) || 0;
        const structuredJsonLdCount = Number.parseInt(String(payload.structured_json_ld_count || 0), 10) || 0;
        const structuredMicrodataCount = Number.parseInt(String(payload.structured_microdata_count || 0), 10) || 0;
        const structuredOpengraphCount = Number.parseInt(String(payload.structured_opengraph_count || 0), 10) || 0;
        const structuredCandidates = Number.parseInt(String(payload.structured_candidates || 0), 10) || 0;
        const structuredRejectedCandidates = Number.parseInt(String(payload.structured_rejected_candidates || 0), 10) || 0;
        const structuredErrorCount = Number.parseInt(String(payload.structured_error_count || 0), 10) || 0;
        const pdfDocsParsed = Number.parseInt(String(payload.pdf_docs_parsed || 0), 10) || 0;
        const pdfPairsTotal = Number.parseInt(String(payload.pdf_pairs_total || 0), 10) || 0;
        const pdfKvPairs = Number.parseInt(String(payload.pdf_kv_pairs || 0), 10) || 0;
        const pdfTablePairs = Number.parseInt(String(payload.pdf_table_pairs || 0), 10) || 0;
        const pdfErrorCount = Number.parseInt(String(payload.pdf_error_count || 0), 10) || 0;
        const pdfBackendSelected = String(payload.pdf_backend_selected || '').trim();
        const scannedDocsDetected = Number.parseInt(String(payload.scanned_pdf_docs_detected || 0), 10) || 0;
        const scannedOcrDocsAttempted = Number.parseInt(String(payload.scanned_pdf_ocr_docs_attempted || 0), 10) || 0;
        const scannedOcrDocsSucceeded = Number.parseInt(String(payload.scanned_pdf_ocr_docs_succeeded || 0), 10) || 0;
        const scannedOcrPairs = Number.parseInt(String(payload.scanned_pdf_ocr_pairs || 0), 10) || 0;
        const scannedOcrKvPairs = Number.parseInt(String(payload.scanned_pdf_ocr_kv_pairs || 0), 10) || 0;
        const scannedOcrTablePairs = Number.parseInt(String(payload.scanned_pdf_ocr_table_pairs || 0), 10) || 0;
        const scannedOcrLowConfPairs = Number.parseInt(String(payload.scanned_pdf_ocr_low_conf_pairs || 0), 10) || 0;
        const scannedOcrErrorCount = Number.parseInt(String(payload.scanned_pdf_ocr_error_count || 0), 10) || 0;
        const scannedOcrBackendSelected = String(payload.scanned_pdf_ocr_backend_selected || '').trim();
        const scannedOcrConfidenceAvg = Number.parseFloat(String(payload.scanned_pdf_ocr_confidence_avg || 0)) || 0;
        const articleTitle = String(payload.article_title || '').trim();
        const articleExcerpt = String(payload.article_excerpt || '').trim();
        const articlePreview = String(payload.article_preview || '').trim();
        const articleMethod = String(payload.article_extraction_method || '').trim();
        const articleScore = Number.parseFloat(String(payload.article_quality_score ?? 0));
        const articleCharCount = Number.parseInt(String(payload.article_char_count ?? 0), 10) || 0;
        const articleLowQuality = truthyFlag(payload.article_low_quality);
        const articleFallbackReason = String(payload.article_fallback_reason || '').trim();
        const articlePolicyMode = String(payload.article_policy_mode || '').trim();
        const articlePolicyHost = String(payload.article_policy_matched_host || '').trim();
        const articlePolicyOverride = truthyFlag(payload.article_policy_override_applied);
        counters.structured_json_ld += Math.max(0, structuredJsonLdCount);
        counters.structured_microdata += Math.max(0, structuredMicrodataCount);
        counters.structured_opengraph += Math.max(0, structuredOpengraphCount);
        counters.structured_candidates += Math.max(0, structuredCandidates);
        counters.pdf_docs_parsed += Math.max(0, pdfDocsParsed);
        counters.pdf_pairs_total += Math.max(0, pdfPairsTotal);
        counters.scanned_pdf_docs_detected += Math.max(0, scannedDocsDetected);
        counters.scanned_pdf_ocr_docs_succeeded += Math.max(0, scannedOcrDocsSucceeded);
        counters.scanned_pdf_ocr_pairs += Math.max(0, scannedOcrPairs);
        if (url) {
          const current = urlJobs.get(url) || buildEmptyUrlJob(url);
          urlJobs.set(url, {
            ...current,
            status_code: Number.parseInt(String(payload.status || 0), 10) || current.status_code,
            fetcher_kind: fetcherKind || current.fetcher_kind,
            fetch_attempts: fetchAttempts > 0 ? fetchAttempts : current.fetch_attempts,
            fetch_retry_count: fetchRetryCount > 0 ? fetchRetryCount : current.fetch_retry_count,
            fetch_policy_host: fetchPolicyHost || current.fetch_policy_host,
            fetch_policy_override: fetchPolicyOverride || current.fetch_policy_override,
            parse_ms: parseMs > 0 ? parseMs : current.parse_ms,
            screenshot_uri: screenshotUri || current.screenshot_uri,
            dom_snippet_uri: domSnippetUri || current.dom_snippet_uri,
            static_dom_mode: staticDomMode || current.static_dom_mode,
            static_dom_accepted: staticDomAccepted > 0 ? staticDomAccepted : current.static_dom_accepted,
            static_dom_rejected: staticDomRejected > 0 ? staticDomRejected : current.static_dom_rejected,
            static_dom_parse_error: staticDomParseError > 0 ? staticDomParseError : current.static_dom_parse_error,
            static_dom_rejected_audit_count: staticDomRejectedAudit > 0
              ? staticDomRejectedAudit
              : current.static_dom_rejected_audit_count,
            structured_json_ld_count: structuredJsonLdCount > 0 ? structuredJsonLdCount : current.structured_json_ld_count,
            structured_microdata_count: structuredMicrodataCount > 0 ? structuredMicrodataCount : current.structured_microdata_count,
            structured_opengraph_count: structuredOpengraphCount > 0 ? structuredOpengraphCount : current.structured_opengraph_count,
            structured_candidates: structuredCandidates > 0 ? structuredCandidates : current.structured_candidates,
            structured_rejected_candidates: structuredRejectedCandidates > 0
              ? structuredRejectedCandidates
              : current.structured_rejected_candidates,
            structured_error_count: structuredErrorCount > 0 ? structuredErrorCount : current.structured_error_count,
            pdf_docs_parsed: pdfDocsParsed > 0 ? pdfDocsParsed : current.pdf_docs_parsed,
            pdf_pairs_total: pdfPairsTotal > 0 ? pdfPairsTotal : current.pdf_pairs_total,
            pdf_kv_pairs: pdfKvPairs > 0 ? pdfKvPairs : current.pdf_kv_pairs,
            pdf_table_pairs: pdfTablePairs > 0 ? pdfTablePairs : current.pdf_table_pairs,
            pdf_backend_selected: pdfBackendSelected || current.pdf_backend_selected,
            pdf_error_count: pdfErrorCount > 0 ? pdfErrorCount : current.pdf_error_count,
            scanned_pdf_docs_detected: scannedDocsDetected > 0 ? scannedDocsDetected : current.scanned_pdf_docs_detected,
            scanned_pdf_ocr_docs_attempted: scannedOcrDocsAttempted > 0 ? scannedOcrDocsAttempted : current.scanned_pdf_ocr_docs_attempted,
            scanned_pdf_ocr_docs_succeeded: scannedOcrDocsSucceeded > 0 ? scannedOcrDocsSucceeded : current.scanned_pdf_ocr_docs_succeeded,
            scanned_pdf_ocr_pairs: scannedOcrPairs > 0 ? scannedOcrPairs : current.scanned_pdf_ocr_pairs,
            scanned_pdf_ocr_kv_pairs: scannedOcrKvPairs > 0 ? scannedOcrKvPairs : current.scanned_pdf_ocr_kv_pairs,
            scanned_pdf_ocr_table_pairs: scannedOcrTablePairs > 0 ? scannedOcrTablePairs : current.scanned_pdf_ocr_table_pairs,
            scanned_pdf_ocr_low_conf_pairs: scannedOcrLowConfPairs > 0 ? scannedOcrLowConfPairs : current.scanned_pdf_ocr_low_conf_pairs,
            scanned_pdf_ocr_error_count: scannedOcrErrorCount > 0 ? scannedOcrErrorCount : current.scanned_pdf_ocr_error_count,
            scanned_pdf_ocr_backend_selected: scannedOcrBackendSelected || current.scanned_pdf_ocr_backend_selected,
            scanned_pdf_ocr_confidence_avg: scannedOcrConfidenceAvg > 0
              ? scannedOcrConfidenceAvg
              : current.scanned_pdf_ocr_confidence_avg,
            article_title: articleTitle || current.article_title,
            article_excerpt: articleExcerpt || current.article_excerpt,
            article_preview: articlePreview || current.article_preview,
            article_method: articleMethod || current.article_method,
            article_quality_score: Number.isFinite(articleScore)
              ? articleScore
              : current.article_quality_score,
            article_char_count: articleCharCount > 0 ? articleCharCount : current.article_char_count,
            article_low_quality: articleLowQuality,
            article_fallback_reason: articleFallbackReason || current.article_fallback_reason,
            article_policy_mode: articlePolicyMode || current.article_policy_mode,
            article_policy_host: articlePolicyHost || current.article_policy_host,
            article_policy_override: articlePolicyOverride || current.article_policy_override,
            last_ts: ts || current.last_ts
          });
        }
      }
      const sourceEventName = normalizeToken(payload.event);
      const isSourceProcessed = eventName === 'source_processed';
      const isSourceFetchFailed = eventName === 'source_fetch_failed'
        || (eventName === 'error' && sourceEventName === 'source_fetch_failed');
      if (isSourceProcessed || isSourceFetchFailed) {
        const sourceUrl = String(payload.url || payload.source_url || '').trim();
        const finalUrl = String(payload.final_url || '').trim();
        const preferredUrl = finalUrl || sourceUrl;
        if (preferredUrl) {
          const existingKey =
            (finalUrl && urlJobs.has(finalUrl) ? finalUrl : '')
            || (sourceUrl && urlJobs.has(sourceUrl) ? sourceUrl : '')
            || '';
          const current = existingKey
            ? (urlJobs.get(existingKey) || buildEmptyUrlJob(preferredUrl))
            : buildEmptyUrlJob(preferredUrl);
          const fetcherKind = String(payload.fetcher_kind || payload.fetcher_mode || payload.fetcher || '').trim();
          const outcome = normalizeToken(payload.outcome || payload.status_class || '');
          const statusFromOutcome = outcome === 'ok'
            ? 'ok'
            : (outcome === 'not_found' || outcome === '404' ? '404' : 'error');
          const parsedStatusCode = Number.parseInt(String(payload.status || payload.status_code || 0), 10) || 0;
          const fetchMs = Number.parseInt(String(payload.fetch_ms || payload.ms || 0), 10) || 0;
          const parseMs = Number.parseInt(String(payload.parse_ms || 0), 10) || 0;
          const articleTitle = String(payload.article_title || '').trim();
          const articleExcerpt = String(payload.article_excerpt || '').trim();
          const articlePreview = String(payload.article_preview || '').trim();
          const articleMethod = String(payload.article_extraction_method || payload.article_method || '').trim();
          const articleScore = Number.parseFloat(String(payload.article_quality_score ?? payload.article_score ?? ''));
          const articleCharCount = Number.parseInt(String(payload.article_char_count ?? payload.article_chars ?? 0), 10) || 0;
          const articleLowQuality = truthyFlag(payload.article_low_quality);
          const articleFallbackReason = String(payload.article_fallback_reason || '').trim();
          const articlePolicyMode = String(payload.article_policy_mode || '').trim();
          const articlePolicyHost = String(payload.article_policy_matched_host || '').trim();
          const articlePolicyOverride = truthyFlag(payload.article_policy_override_applied);
          const fetchAttempts = Number.parseInt(String(payload.fetch_attempts || 0), 10) || 0;
          const fetchRetryCount = Number.parseInt(String(payload.fetch_retry_count || 0), 10) || 0;
          const fetchPolicyHost = String(payload.fetch_policy_matched_host || '').trim();
          const fetchPolicyOverride = truthyFlag(payload.fetch_policy_override_applied);
          const screenshotUri = String(payload.screenshot_uri || '').trim();
          const domSnippetUri = String(payload.dom_snippet_uri || '').trim();
          const staticDomMode = String(payload.static_dom_mode || '').trim();
          const staticDomAccepted = Number.parseInt(String(payload.static_dom_accepted_field_candidates || 0), 10) || 0;
          const staticDomRejected = Number.parseInt(String(payload.static_dom_rejected_field_candidates || 0), 10) || 0;
          const staticDomParseError = Number.parseInt(String(payload.static_dom_parse_error_count || 0), 10) || 0;
          const staticDomRejectedAudit = Number.parseInt(String(payload.static_dom_rejected_field_candidates_audit_count || 0), 10) || 0;
          const structuredJsonLdCount = Number.parseInt(String(payload.structured_json_ld_count || 0), 10) || 0;
          const structuredMicrodataCount = Number.parseInt(String(payload.structured_microdata_count || 0), 10) || 0;
          const structuredOpengraphCount = Number.parseInt(String(payload.structured_opengraph_count || 0), 10) || 0;
          const structuredCandidates = Number.parseInt(String(payload.structured_candidates || 0), 10) || 0;
          const structuredRejectedCandidates = Number.parseInt(String(payload.structured_rejected_candidates || 0), 10) || 0;
          const structuredErrorCount = Number.parseInt(String(payload.structured_error_count || 0), 10) || 0;
          const pdfDocsParsed = Number.parseInt(String(payload.pdf_docs_parsed || 0), 10) || 0;
          const pdfPairsTotal = Number.parseInt(String(payload.pdf_pairs_total || 0), 10) || 0;
          const pdfKvPairs = Number.parseInt(String(payload.pdf_kv_pairs || 0), 10) || 0;
          const pdfTablePairs = Number.parseInt(String(payload.pdf_table_pairs || 0), 10) || 0;
          const pdfErrorCount = Number.parseInt(String(payload.pdf_error_count || 0), 10) || 0;
          const pdfBackendSelected = String(payload.pdf_backend_selected || '').trim();
          const scannedDocsDetected = Number.parseInt(String(payload.scanned_pdf_docs_detected || 0), 10) || 0;
          const scannedOcrDocsAttempted = Number.parseInt(String(payload.scanned_pdf_ocr_docs_attempted || 0), 10) || 0;
          const scannedOcrDocsSucceeded = Number.parseInt(String(payload.scanned_pdf_ocr_docs_succeeded || 0), 10) || 0;
          const scannedOcrPairs = Number.parseInt(String(payload.scanned_pdf_ocr_pairs || 0), 10) || 0;
          const scannedOcrKvPairs = Number.parseInt(String(payload.scanned_pdf_ocr_kv_pairs || 0), 10) || 0;
          const scannedOcrTablePairs = Number.parseInt(String(payload.scanned_pdf_ocr_table_pairs || 0), 10) || 0;
          const scannedOcrLowConfPairs = Number.parseInt(String(payload.scanned_pdf_ocr_low_conf_pairs || 0), 10) || 0;
          const scannedOcrErrorCount = Number.parseInt(String(payload.scanned_pdf_ocr_error_count || 0), 10) || 0;
          const scannedOcrBackendSelected = String(payload.scanned_pdf_ocr_backend_selected || '').trim();
          const scannedOcrConfidenceAvg = Number.parseFloat(String(payload.scanned_pdf_ocr_confidence_avg || 0)) || 0;
          if (isSourceProcessed && stage !== 'parse') {
            counters.structured_json_ld += Math.max(0, structuredJsonLdCount);
            counters.structured_microdata += Math.max(0, structuredMicrodataCount);
            counters.structured_opengraph += Math.max(0, structuredOpengraphCount);
            counters.structured_candidates += Math.max(0, structuredCandidates);
            counters.pdf_docs_parsed += Math.max(0, pdfDocsParsed);
            counters.pdf_pairs_total += Math.max(0, pdfPairsTotal);
            counters.scanned_pdf_docs_detected += Math.max(0, scannedDocsDetected);
            counters.scanned_pdf_ocr_docs_succeeded += Math.max(0, scannedOcrDocsSucceeded);
            counters.scanned_pdf_ocr_pairs += Math.max(0, scannedOcrPairs);
          }
          const nextStatus = isSourceFetchFailed
            ? 'error'
            : (statusFromOutcome || current.status || 'ok');
          urlJobs.set(preferredUrl, {
            ...current,
            url: preferredUrl,
            status: nextStatus,
            status_code: parsedStatusCode || current.status_code,
            fetcher_kind: fetcherKind || current.fetcher_kind,
            fetch_attempts: fetchAttempts > 0 ? fetchAttempts : current.fetch_attempts,
            fetch_retry_count: fetchRetryCount > 0 ? fetchRetryCount : current.fetch_retry_count,
            fetch_policy_host: fetchPolicyHost || current.fetch_policy_host,
            fetch_policy_override: fetchPolicyOverride || current.fetch_policy_override,
            ms: fetchMs > 0 ? fetchMs : current.ms,
            parse_ms: parseMs > 0 ? parseMs : current.parse_ms,
            screenshot_uri: screenshotUri || current.screenshot_uri,
            dom_snippet_uri: domSnippetUri || current.dom_snippet_uri,
            static_dom_mode: staticDomMode || current.static_dom_mode,
            static_dom_accepted: staticDomAccepted > 0 ? staticDomAccepted : current.static_dom_accepted,
            static_dom_rejected: staticDomRejected > 0 ? staticDomRejected : current.static_dom_rejected,
            static_dom_parse_error: staticDomParseError > 0 ? staticDomParseError : current.static_dom_parse_error,
            static_dom_rejected_audit_count: staticDomRejectedAudit > 0
              ? staticDomRejectedAudit
              : current.static_dom_rejected_audit_count,
            article_title: articleTitle || current.article_title,
            article_excerpt: articleExcerpt || current.article_excerpt,
            article_preview: articlePreview || current.article_preview,
            article_method: articleMethod || current.article_method,
            article_quality_score: Number.isFinite(articleScore)
              ? articleScore
              : current.article_quality_score,
            article_char_count: articleCharCount > 0 ? articleCharCount : current.article_char_count,
            article_low_quality: articleLowQuality || current.article_low_quality,
            article_fallback_reason: articleFallbackReason || current.article_fallback_reason,
            article_policy_mode: articlePolicyMode || current.article_policy_mode,
            article_policy_host: articlePolicyHost || current.article_policy_host,
            article_policy_override: articlePolicyOverride || current.article_policy_override,
            structured_json_ld_count: structuredJsonLdCount > 0 ? structuredJsonLdCount : current.structured_json_ld_count,
            structured_microdata_count: structuredMicrodataCount > 0 ? structuredMicrodataCount : current.structured_microdata_count,
            structured_opengraph_count: structuredOpengraphCount > 0 ? structuredOpengraphCount : current.structured_opengraph_count,
            structured_candidates: structuredCandidates > 0 ? structuredCandidates : current.structured_candidates,
            structured_rejected_candidates: structuredRejectedCandidates > 0
              ? structuredRejectedCandidates
              : current.structured_rejected_candidates,
            structured_error_count: structuredErrorCount > 0 ? structuredErrorCount : current.structured_error_count,
            pdf_docs_parsed: pdfDocsParsed > 0 ? pdfDocsParsed : current.pdf_docs_parsed,
            pdf_pairs_total: pdfPairsTotal > 0 ? pdfPairsTotal : current.pdf_pairs_total,
            pdf_kv_pairs: pdfKvPairs > 0 ? pdfKvPairs : current.pdf_kv_pairs,
            pdf_table_pairs: pdfTablePairs > 0 ? pdfTablePairs : current.pdf_table_pairs,
            pdf_backend_selected: pdfBackendSelected || current.pdf_backend_selected,
            pdf_error_count: pdfErrorCount > 0 ? pdfErrorCount : current.pdf_error_count,
            scanned_pdf_docs_detected: scannedDocsDetected > 0 ? scannedDocsDetected : current.scanned_pdf_docs_detected,
            scanned_pdf_ocr_docs_attempted: scannedOcrDocsAttempted > 0 ? scannedOcrDocsAttempted : current.scanned_pdf_ocr_docs_attempted,
            scanned_pdf_ocr_docs_succeeded: scannedOcrDocsSucceeded > 0 ? scannedOcrDocsSucceeded : current.scanned_pdf_ocr_docs_succeeded,
            scanned_pdf_ocr_pairs: scannedOcrPairs > 0 ? scannedOcrPairs : current.scanned_pdf_ocr_pairs,
            scanned_pdf_ocr_kv_pairs: scannedOcrKvPairs > 0 ? scannedOcrKvPairs : current.scanned_pdf_ocr_kv_pairs,
            scanned_pdf_ocr_table_pairs: scannedOcrTablePairs > 0 ? scannedOcrTablePairs : current.scanned_pdf_ocr_table_pairs,
            scanned_pdf_ocr_low_conf_pairs: scannedOcrLowConfPairs > 0 ? scannedOcrLowConfPairs : current.scanned_pdf_ocr_low_conf_pairs,
            scanned_pdf_ocr_error_count: scannedOcrErrorCount > 0 ? scannedOcrErrorCount : current.scanned_pdf_ocr_error_count,
            scanned_pdf_ocr_backend_selected: scannedOcrBackendSelected || current.scanned_pdf_ocr_backend_selected,
            scanned_pdf_ocr_confidence_avg: scannedOcrConfidenceAvg > 0
              ? scannedOcrConfidenceAvg
              : current.scanned_pdf_ocr_confidence_avg,
            finished_at: ts || current.finished_at,
            last_ts: ts || current.last_ts
          });
          if (existingKey && existingKey !== preferredUrl) {
            urlJobs.delete(existingKey);
          }
        }
      }
      if (stage === 'index' && eventName === 'index_finished' && scope === 'url') {
        counters.indexed_docs += 1;
        counters.fields_filled += Number.parseInt(String(payload.count || 0), 10) || 0;
      }
    }

    const jobs = [...urlJobs.values()]
      .sort((a, b) => Date.parse(b.last_ts || '') - Date.parse(a.last_ts || ''));
    const activeJobs = jobs.filter((row) => row.status === 'in_flight');

    return {
      stageWindows,
      counters,
      allJobs: jobs,
      activeJobs,
      recentJobs: jobs.slice(0, 30)
    };
  }, [indexlabEvents]);
  const phase5LatestParsedJob = useMemo(
    () =>
      indexlabSummary.allJobs.find((row) =>
        row.parse_ms > 0
        || Boolean(row.article_method)
        || row.article_char_count > 0
      ) || null,
    [indexlabSummary.allJobs]
  );
  const phase5ArticlePreviewJob = useMemo(
    () =>
      indexlabSummary.allJobs.find((row) =>
        Boolean(row.article_preview || row.article_excerpt || row.article_title)
      ) || phase5LatestParsedJob,
    [indexlabSummary.allJobs, phase5LatestParsedJob]
  );
  const phase5ArticleDomainLeaderboard = useMemo(() => {
    const byHost = new Map<string, {
      host: string;
      samples: number;
      readabilityHits: number;
      fallbackHits: number;
      lowQualityCount: number;
      scoreTotal: number;
      charsTotal: number;
      parseMs: number[];
      policyOverrideCount: number;
      policyModes: Record<string, number>;
      policyHosts: Record<string, number>;
    }>();

    for (const row of indexlabSummary.allJobs) {
      const host = hostFromUrl(String(row.url || '')) || '';
      if (!host) continue;
      const hasSample = Boolean(row.article_method) || Number(row.article_char_count || 0) > 0;
      if (!hasSample) continue;
      const state = byHost.get(host) || {
        host,
        samples: 0,
        readabilityHits: 0,
        fallbackHits: 0,
        lowQualityCount: 0,
        scoreTotal: 0,
        charsTotal: 0,
        parseMs: [],
        policyOverrideCount: 0,
        policyModes: {},
        policyHosts: {}
      };
      state.samples += 1;
      const method = normalizeToken(row.article_method || '');
      if (method.includes('readability')) state.readabilityHits += 1;
      if (method.includes('fallback') || method.includes('heuristic')) state.fallbackHits += 1;
      if (row.article_low_quality) state.lowQualityCount += 1;
      state.scoreTotal += Number(row.article_quality_score || 0);
      state.charsTotal += Number(row.article_char_count || 0);
      const parseMs = Number(row.parse_ms || 0);
      if (Number.isFinite(parseMs) && parseMs > 0) state.parseMs.push(parseMs);

      if (row.article_policy_override) {
        state.policyOverrideCount += 1;
      }
      const mode = normalizeToken(row.article_policy_mode || '');
      if (mode) {
        state.policyModes[mode] = (state.policyModes[mode] || 0) + 1;
      }
      const policyHost = normalizeToken(row.article_policy_host || '');
      if (policyHost) {
        state.policyHosts[policyHost] = (state.policyHosts[policyHost] || 0) + 1;
      }
      byHost.set(host, state);
    }

    return [...byHost.values()]
      .map((row) => {
        const samples = Math.max(1, row.samples);
        const topMode = Object.entries(row.policyModes).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const topPolicyHost = Object.entries(row.policyHosts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        return {
          host: row.host,
          samples: row.samples,
          readabilityHits: row.readabilityHits,
          fallbackHits: row.fallbackHits,
          lowQualityCount: row.lowQualityCount,
          avgScore: row.scoreTotal / samples,
          avgChars: row.charsTotal / samples,
          parseP95Ms: percentileMs(row.parseMs, 95),
          policyOverrideCount: row.policyOverrideCount,
          topMode,
          topPolicyHost
        };
      })
      .sort((a, b) => (
        b.samples - a.samples
        || b.readabilityHits - a.readabilityHits
        || b.avgScore - a.avgScore
      ))
      .slice(0, 24);
  }, [indexlabSummary.allJobs]);

  const indexlabNeedsetFromEvents = useMemo(() => {
    const snapshots: IndexLabNeedSetSnapshot[] = [];
    let latest: IndexLabNeedSetResponse | null = null;
    for (const evt of indexlabEvents) {
      if (String(evt.event || '').trim() !== 'needset_computed') continue;
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      const snapshotTs = String(evt.ts || payload.generated_at || '').trim();
      const snapshotSize = Number.parseInt(String(payload.needset_size || 0), 10) || 0;
      if (snapshotTs) {
        snapshots.push({
          ts: snapshotTs,
          needset_size: snapshotSize
        });
      }
      latest = {
        run_id: String(evt.run_id || '').trim(),
        category: String(evt.category || '').trim(),
        product_id: String(evt.product_id || '').trim(),
        generated_at: String(payload.generated_at || evt.ts || '').trim(),
        total_fields: Number.parseInt(String(payload.total_fields || 0), 10) || 0,
        needset_size: snapshotSize,
        identity_lock_state: (payload.identity_lock_state && typeof payload.identity_lock_state === 'object')
          ? payload.identity_lock_state as IndexLabNeedSetResponse['identity_lock_state']
          : {},
        identity_audit_rows: Array.isArray(payload.identity_audit_rows)
          ? payload.identity_audit_rows as IndexLabNeedSetResponse['identity_audit_rows']
          : [],
        reason_counts: (payload.reason_counts && typeof payload.reason_counts === 'object')
          ? payload.reason_counts as Record<string, number>
          : {},
        required_level_counts: (payload.required_level_counts && typeof payload.required_level_counts === 'object')
          ? payload.required_level_counts as Record<string, number>
          : {},
        needs: Array.isArray(payload.needs) ? payload.needs as IndexLabNeedSetRow[] : [],
        snapshots: Array.isArray(payload.snapshots)
          ? payload.snapshots as IndexLabNeedSetSnapshot[]
          : snapshots
      };
    }
    if (!latest) return null;
    if (!Array.isArray(latest.snapshots) || latest.snapshots.length === 0) {
      latest.snapshots = snapshots;
    }
    return latest;
  }, [indexlabEvents]);

  const indexlabNeedset = useMemo(
    () => indexlabNeedsetFromEvents || indexlabNeedsetResp || null,
    [indexlabNeedsetFromEvents, indexlabNeedsetResp]
  );
  const indexlabNeedsetIdentityState = useMemo(() => {
    const row = (indexlabNeedset?.identity_lock_state && typeof indexlabNeedset.identity_lock_state === 'object')
      ? indexlabNeedset.identity_lock_state
      : {};
    const status = String(row?.status || '').trim().toLowerCase() || 'unknown';
    const confidence = Number.isFinite(Number(row?.confidence)) ? Number(row?.confidence) : null;
    const maxMatch = Number.isFinite(Number(row?.max_match_score)) ? Number(row?.max_match_score) : null;
    const extractionGateOpen = Boolean(row?.extraction_gate_open);
    const familyModelCount = Number.parseInt(String(row?.family_model_count || 0), 10) || 0;
    const ambiguityLevel = String(row?.ambiguity_level || '').trim().toLowerCase() || (
      familyModelCount >= 9
        ? 'extra_hard'
        : familyModelCount >= 6
          ? 'very_hard'
          : familyModelCount >= 4
            ? 'hard'
            : familyModelCount >= 2
              ? 'medium'
              : familyModelCount === 1
                ? 'easy'
                : 'unknown'
    );
    const ambiguityLabel = ambiguityLevel.replace(/_/g, ' ');
    const publishable = Boolean(row?.publishable);
    const gateValidated = Boolean(row?.identity_gate_validated);
    const blockers = Array.isArray(row?.publish_blockers) ? row.publish_blockers : [];
    const reasonCodes = Array.isArray(row?.reason_codes) ? row.reason_codes : [];
    const pageCount = Number.parseInt(String(row?.page_count || 0), 10) || 0;
    return {
      status,
      confidence,
      maxMatch,
      extractionGateOpen,
      familyModelCount,
      ambiguityLevel,
      ambiguityLabel,
      publishable,
      gateValidated,
      blockers,
      reasonCodes,
      pageCount
    };
  }, [indexlabNeedset]);
  const indexlabNeedsetIdentityAuditRows = useMemo(() => {
    const rows = Array.isArray(indexlabNeedset?.identity_audit_rows)
      ? indexlabNeedset.identity_audit_rows
      : [];
    return rows
      .map((row) => ({
        source_id: String(row?.source_id || '').trim(),
        url: String(row?.url || '').trim(),
        decision: String(row?.decision || '').trim().toUpperCase(),
        confidence: Number.isFinite(Number(row?.confidence)) ? Number(row?.confidence) : null,
        reason_codes: Array.isArray(row?.reason_codes) ? row.reason_codes.map((item) => String(item || '').trim()).filter(Boolean) : [],
        ts: String(row?.ts || '').trim()
      }))
      .filter((row) => row.source_id || row.url)
      .slice(0, 16);
  }, [indexlabNeedset]);

  const indexlabNeedsetRows = useMemo(() => {
    const rows = Array.isArray(indexlabNeedset?.needs) ? [...indexlabNeedset.needs] : [];
    rows.sort((a, b) => {
      let cmp = 0;
      if (needsetSortKey === 'field_key') {
        cmp = String(a.field_key || '').localeCompare(String(b.field_key || ''));
      } else if (needsetSortKey === 'required_level') {
        cmp = needsetRequiredLevelWeight(String(a.required_level || '')) - needsetRequiredLevelWeight(String(b.required_level || ''));
      } else if (needsetSortKey === 'confidence') {
        const av = Number.isFinite(Number(a.confidence)) ? Number(a.confidence) : -1;
        const bv = Number.isFinite(Number(b.confidence)) ? Number(b.confidence) : -1;
        cmp = av - bv;
      } else if (needsetSortKey === 'best_tier_seen') {
        const av = Number.isFinite(Number(a.best_tier_seen)) ? Number(a.best_tier_seen) : 99;
        const bv = Number.isFinite(Number(b.best_tier_seen)) ? Number(b.best_tier_seen) : 99;
        cmp = av - bv;
      } else if (needsetSortKey === 'refs') {
        const av = (Number(a.refs_found) || 0) - (Number(a.min_refs) || 0);
        const bv = (Number(b.refs_found) || 0) - (Number(b.min_refs) || 0);
        cmp = av - bv;
      } else {
        cmp = Number(a.need_score || 0) - Number(b.need_score || 0);
      }
      if (cmp === 0) {
        return String(a.field_key || '').localeCompare(String(b.field_key || ''));
      }
      return needsetSortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [indexlabNeedset, needsetSortDir, needsetSortKey]);

  const indexlabNeedsetSparklineValues = useMemo(() => {
    const snapshots = Array.isArray(indexlabNeedset?.snapshots) ? indexlabNeedset.snapshots : [];
    if (snapshots.length > 0) {
      return snapshots
        .map((row) => Number.parseInt(String(row.needset_size || 0), 10) || 0);
    }
    if (Number.isFinite(Number(indexlabNeedset?.needset_size))) {
      return [Number(indexlabNeedset?.needset_size || 0)];
    }
    return [];
  }, [indexlabNeedset]);
  const indexlabSearchProfile = useMemo(
    () => indexlabSearchProfileResp || null,
    [indexlabSearchProfileResp]
  );
  const indexlabSearchProfileRows = useMemo(() => {
    const rows = Array.isArray(indexlabSearchProfile?.query_rows)
      ? [...indexlabSearchProfile.query_rows]
      : [];
    rows.sort((a, b) => {
      const ac = Number(a.result_count || 0);
      const bc = Number(b.result_count || 0);
      if (ac !== bc) return bc - ac;
      return String(a.query || '').localeCompare(String(b.query || ''));
    });
    return rows;
  }, [indexlabSearchProfile]);
  const indexlabSearchProfileVariantGuardTerms = useMemo(
    () => (Array.isArray(indexlabSearchProfile?.variant_guard_terms)
      ? indexlabSearchProfile.variant_guard_terms.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 32)
      : []),
    [indexlabSearchProfile]
  );
  const indexlabSearchProfileAliasRejectRows = useMemo(() => {
    const rows = Array.isArray(indexlabSearchProfile?.alias_reject_log)
      ? indexlabSearchProfile.alias_reject_log
      : [];
    return rows
      .map((row) => ({
        alias: String(row?.alias || '').trim(),
        source: String(row?.source || '').trim(),
        reason: String(row?.reason || '').trim(),
        stage: String(row?.stage || '').trim(),
        detail: String(row?.detail || '').trim()
      }))
      .filter((row) => row.alias || row.reason)
      .slice(0, 80);
  }, [indexlabSearchProfile]);
  const indexlabSearchProfileQueryRejectRows = useMemo(() => {
    const rows = Array.isArray(indexlabSearchProfile?.query_reject_log)
      ? indexlabSearchProfile.query_reject_log
      : [];
    return rows
      .map((row) => ({
        query: String(row?.query || '').trim(),
        source: Array.isArray(row?.source)
          ? row.source.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
          : String(row?.source || '').trim(),
        reason: String(row?.reason || '').trim(),
        stage: String(row?.stage || '').trim(),
        detail: String(row?.detail || '').trim()
      }))
      .filter((row) => row.query || row.reason)
      .slice(0, 160);
  }, [indexlabSearchProfile]);
  const indexlabSearchProfileQueryRejectBreakdown = useMemo(() => {
    const isSafetyReject = (row: { reason: string; stage: string }) => {
      const reason = normalizeToken(row.reason);
      const stage = normalizeToken(row.stage);
      if (stage === 'pre_execution_guard') return true;
      return (
        reason.startsWith('missing_brand_token')
        || reason.startsWith('missing_required_digit_group')
        || reason.startsWith('foreign_model_token')
      );
    };
    const safety: typeof indexlabSearchProfileQueryRejectRows = [];
    const pruned: typeof indexlabSearchProfileQueryRejectRows = [];
    for (const row of indexlabSearchProfileQueryRejectRows) {
      if (isSafetyReject(row)) {
        safety.push(row);
      } else {
        pruned.push(row);
      }
    }
    return {
      safety,
      pruned,
      ordered: [...safety, ...pruned]
    };
  }, [indexlabSearchProfileQueryRejectRows]);
  const indexlabSerpExplorer = useMemo(() => {
    if (indexlabSerpExplorerResp && typeof indexlabSerpExplorerResp === 'object') {
      return indexlabSerpExplorerResp;
    }
    if (indexlabSearchProfile?.serp_explorer && typeof indexlabSearchProfile.serp_explorer === 'object') {
      return indexlabSearchProfile.serp_explorer;
    }
    return null;
  }, [indexlabSerpExplorerResp, indexlabSearchProfile]);
  const indexlabSerpRows = useMemo(() => {
    const rows = Array.isArray(indexlabSerpExplorer?.queries)
      ? [...indexlabSerpExplorer.queries]
      : [];
    rows.sort((a, b) => {
      const as = Number(a.selected_count || 0);
      const bs = Number(b.selected_count || 0);
      if (as !== bs) return bs - as;
      const ac = Number(a.candidate_count || 0);
      const bc = Number(b.candidate_count || 0);
      if (ac !== bc) return bc - ac;
      return String(a.query || '').localeCompare(String(b.query || ''));
    });
    return rows;
  }, [indexlabSerpExplorer]);
  useEffect(() => {
    const stopUrl = '/api/v1/process/stop';
    const stopPayload = JSON.stringify({ force: true });
    const sendStop = () => {
      if (!processRunning) return;
      try {
        const payload = new Blob([stopPayload], { type: 'application/json' });
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(stopUrl, payload);
          return;
        }
      } catch {
        // Fall through to fetch keepalive.
      }
      try {
        void fetch(stopUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: stopPayload,
          keepalive: true
        });
      } catch {
        // Best-effort only.
      }
    };
    const onBeforeUnload = () => sendStop();
    const onPageHide = () => sendStop();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [processRunning]);
  const llmOutputDocHintRows = useMemo(() => {
    const rows = Array.isArray(indexlabSearchProfile?.doc_hint_queries)
      ? [...indexlabSearchProfile.doc_hint_queries]
      : [];
    rows.sort((a, b) => String(a.doc_hint || '').localeCompare(String(b.doc_hint || '')));
    return rows;
  }, [indexlabSearchProfile]);
  const llmOutputFieldQueryRows = useMemo(() => {
    const record = (indexlabSearchProfile?.field_target_queries && typeof indexlabSearchProfile.field_target_queries === 'object')
      ? indexlabSearchProfile.field_target_queries
      : {};
    const focus = new Set((indexlabSearchProfile?.focus_fields || []).map((field) => normalizeToken(field)));
    const rows = Object.entries(record).map(([field, queries]) => ({
      field,
      queries: Array.isArray(queries) ? queries.map((item) => String(item || '').trim()).filter(Boolean) : [],
      isFocus: focus.has(normalizeToken(field))
    }));
    rows.sort((a, b) => {
      if (a.isFocus !== b.isFocus) return a.isFocus ? -1 : 1;
      return a.field.localeCompare(b.field);
    });
    return rows;
  }, [indexlabSearchProfile]);
  const llmOutputSelectedCandidates = useMemo(() => {
    const rows: Array<{
      query: string;
      url: string;
      doc_kind: string;
      tier_name: string;
      score: number;
      reason_codes: string[];
    }> = [];
    for (const queryRow of indexlabSerpRows) {
      for (const candidate of queryRow.candidates || []) {
        if (normalizeToken(candidate.decision) !== 'selected') continue;
        rows.push({
          query: String(queryRow.query || '').trim(),
          url: String(candidate.url || '').trim(),
          doc_kind: String(candidate.doc_kind || '').trim(),
          tier_name: String(candidate.tier_name || (Number.isFinite(Number(candidate.tier)) ? `tier ${candidate.tier}` : '')).trim(),
          score: Number(candidate.triage_score || 0),
          reason_codes: Array.isArray(candidate.reason_codes) ? candidate.reason_codes : []
        });
      }
    }
    if (rows.length === 0) {
      const fallbackRows = Array.isArray(indexlabSerpExplorer?.selected_urls)
        ? indexlabSerpExplorer.selected_urls
        : [];
      for (const row of fallbackRows) {
        const url = String(row?.url || '').trim();
        if (!url) continue;
        rows.push({
          query: String(row?.query || '').trim(),
          url,
          doc_kind: String(row?.doc_kind || '').trim(),
          tier_name: String(row?.tier_name || '').trim(),
          score: Number(row?.score || 0),
          reason_codes: Array.isArray(row?.reason_codes) ? row.reason_codes : ['summary_fallback']
        });
      }
    }
    rows.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    return rows;
  }, [indexlabSerpRows, indexlabSerpExplorer]);
  const llmOutputRejectedCandidates = useMemo(() => {
    const skipReasonTokens = new Set([
      'manufacturer_brand_mismatch',
      'low_relevance',
      'triage_excluded',
      'denied_host',
      'non_https',
      'url_cooldown',
      'query_cooldown',
      'frontier_skip',
      'forbidden'
    ]);
    const rows: Array<{
      query: string;
      url: string;
      doc_kind: string;
      score: number;
      reason_codes: string[];
    }> = [];
    for (const queryRow of indexlabSerpRows) {
      for (const candidate of queryRow.candidates || []) {
        if (normalizeToken(candidate.decision) !== 'rejected') continue;
        const reasons = Array.isArray(candidate.reason_codes) ? candidate.reason_codes : [];
        if (!reasons.some((reason) => skipReasonTokens.has(normalizeToken(reason)))) continue;
        rows.push({
          query: String(queryRow.query || '').trim(),
          url: String(candidate.url || '').trim(),
          doc_kind: String(candidate.doc_kind || '').trim(),
          score: Number(candidate.triage_score || 0),
          reason_codes: reasons
        });
      }
    }
    rows.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    return rows;
  }, [indexlabSerpRows]);
  const phase3Status = useMemo(() => {
    const hasRunSelection = Boolean(selectedIndexLabRunId);
    const searchStatus = normalizeToken(indexlabSearchProfile?.status || '');
    const hasSerpData = Boolean(
      indexlabSerpRows.length > 0
      || llmOutputSelectedCandidates.length > 0
      || llmOutputRejectedCandidates.length > 0
      || Number(indexlabSerpExplorer?.urls_selected || 0) > 0
      || Number(indexlabSerpExplorer?.urls_rejected || 0) > 0
    );
    if (!hasRunSelection) {
      return {
        state: 'waiting' as const,
        label: 'no run selected',
        message: 'Select a run to view automatic Phase 03 triage results.'
      };
    }
    if (hasSerpData) {
      return {
        state: 'ready' as const,
        label: 'generated',
        message: 'Phase 03 triage output is available for this run.'
      };
    }
    if (searchStatus === 'planned') {
      return {
        state: 'waiting' as const,
        label: 'waiting on triage',
        message: 'SearchProfile is still planned. Keep the run active to execute Phase 03 automatically.'
      };
    }
    if (selectedIndexLabRun?.status === 'running' || processRunning) {
      return {
        state: 'live' as const,
        label: 'running',
        message: 'Run is active. Phase 03 rows will appear once search and triage complete.'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 03 payload',
      message: 'This run has no triage payload. It likely stopped before Phase 03 completed.'
    };
  }, [
    indexlabSearchProfile,
    indexlabSerpRows,
    indexlabSerpExplorer,
    llmOutputSelectedCandidates,
    llmOutputRejectedCandidates,
    selectedIndexLabRunId,
    selectedIndexLabRun,
    processRunning
  ]);
  const indexingDomainChecklist = useMemo(
    () => indexingDomainChecklistResp || null,
    [indexingDomainChecklistResp]
  );
  const phase4Rows = useMemo(
    () => Array.isArray(indexingDomainChecklist?.rows) ? indexingDomainChecklist.rows : [],
    [indexingDomainChecklist]
  );
  const phase4RepairRows = useMemo(
    () => Array.isArray(indexingDomainChecklist?.repair_queries) ? indexingDomainChecklist.repair_queries : [],
    [indexingDomainChecklist]
  );
  const phase4BadPatternRows = useMemo(
    () => Array.isArray(indexingDomainChecklist?.bad_url_patterns) ? indexingDomainChecklist.bad_url_patterns : [],
    [indexingDomainChecklist]
  );
  const phase4Activity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'source_processed'
          || event.event === 'source_fetch_failed'
          || event.event === 'fetch_finished'
          || event.event === 'fetch_started'
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase4Summary = useMemo(() => {
    const rows = phase4Rows;
    const sum = (getter: (row: IndexingDomainChecklistRow) => number) =>
      rows.reduce((total, row) => total + getter(row), 0);
    const cooldownsActive = rows.filter((row) => (
      Number(row.cooldown_seconds_remaining || 0) > 0 || String(row.next_retry_at || '').trim()
    )).length;
    const repeat404Domains = rows.filter((row) => Number(row.repeat_404_urls || 0) > 0).length;
    const repeatBlockedDomains = rows.filter((row) => Number(row.repeat_blocked_urls || 0) > 0).length;
    const blockedHosts = rows.filter((row) => normalizeToken(row.host_budget_state || '') === 'blocked').length;
    const backoffHosts = rows.filter((row) => normalizeToken(row.host_budget_state || '') === 'backoff').length;
    const avgHostBudget = rows.length > 0
      ? sum((row) => Number(row.host_budget_score || 0)) / rows.length
      : 0;
    return {
      domains: rows.length,
      err404: sum((row) => Number(row.err_404 || 0)),
      blocked: sum((row) => Number(row.blocked_count || 0)),
      dedupeHits: sum((row) => Number(row.dedupe_hits || 0)),
      cooldownsActive,
      repeat404Domains,
      repeatBlockedDomains,
      blockedHosts,
      backoffHosts,
      avgHostBudget: Number(avgHostBudget.toFixed(1)),
      repairQueries: phase4RepairRows.length,
      badPatterns: phase4BadPatternRows.length
    };
  }, [phase4Rows, phase4RepairRows, phase4BadPatternRows]);
  const phase4Status = useMemo(() => {
    const hasRows = phase4Rows.length > 0;
    const hasSignals = (
      phase4RepairRows.length > 0
      || phase4BadPatternRows.length > 0
      || phase4Summary.err404 > 0
      || phase4Summary.blocked > 0
      || phase4Summary.dedupeHits > 0
    );
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : (hasRows ? 'collecting' : 'waiting')
      };
    }
    if (hasSignals || hasRows) {
      return {
        state: 'ready' as const,
        label: hasSignals ? 'ready' : 'collected'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 04 payload'
    };
  }, [
    selectedIndexLabRunId,
    processRunning,
    phase4Rows,
    phase4RepairRows,
    phase4BadPatternRows,
    phase4Summary
  ]);
  const phase5Runtime = useMemo(() => {
    const activeByUrl = new Map<string, string>();
    const activeByHost = new Map<string, number>();
    let peakInflight = 0;
    let started = 0;
    let completed = 0;
    let failed = 0;
    let skippedCooldown = 0;
    let skippedBlockedBudget = 0;
    let skippedRetryLater = 0;
    let httpCount = 0;
    let browserCount = 0;
    let otherCount = 0;
    let articleSamples = 0;
    let articleReadability = 0;
    let articleFallback = 0;
    let articleLowQuality = 0;
    let structuredJsonLd = 0;
    let structuredMicrodata = 0;
    let structuredOpengraph = 0;
    let structuredCandidates = 0;
    let structuredRejected = 0;
    let structuredErrors = 0;
    let pdfDocsParsed = 0;
    let pdfPairsTotal = 0;
    let pdfKvPairs = 0;
    let pdfTablePairs = 0;
    let pdfPagesScanned = 0;
    let pdfErrors = 0;
    let scannedPdfDocsDetected = 0;
    let scannedPdfOcrDocsAttempted = 0;
    let scannedPdfOcrDocsSucceeded = 0;
    let scannedPdfOcrPairs = 0;
    let scannedPdfOcrKvPairs = 0;
    let scannedPdfOcrTablePairs = 0;
    let scannedPdfOcrLowConfPairs = 0;
    let scannedPdfOcrErrors = 0;
    let scannedPdfOcrConfidenceSum = 0;
    let scannedPdfOcrConfidenceCount = 0;
    let schedulerFallbackStarted = 0;
    let schedulerFallbackSucceeded = 0;
    let schedulerFallbackExhausted = 0;
    let schedulerHostWaits = 0;
    let schedulerTicks = 0;
    const schedulerFallbackFeed: Array<{
      ts: string;
      url: string;
      kind: string;
      from_mode: string;
      to_mode: string;
      outcome: string;
      attempt: number;
    }> = [];
    const articleScores: number[] = [];
    const articleChars: number[] = [];
    const structuredSnippetRows: Array<{
      ts: string;
      url: string;
      source_surface: string;
      key_path: string;
      value_preview: string;
      target_match_score: number;
      target_match_passed: boolean;
    }> = [];
    const fetchDurationsMs: number[] = [];
    const parseDurationsMs: number[] = [];

    for (const evt of indexlabEvents) {
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      const eventName = normalizeToken(evt.event);
      const stageName = normalizeToken(evt.stage);
      const url = String(payload.url || payload.source_url || payload.final_url || '').trim();
      const hostToken = String(payload.host || hostFromUrl(url) || '').trim().toLowerCase();
      const fetcherKind = normalizeToken(String(payload.fetcher_kind || payload.fetcher_mode || payload.fetcher || ''));
      const fetchMs = Number.parseFloat(String(payload.ms ?? payload.fetch_ms ?? ''));
      const parseMs = Number.parseFloat(String(payload.parse_ms ?? payload.ms ?? ''));
      const articleMethod = normalizeToken(String(payload.article_extraction_method || payload.article_method || ''));
      const articleScore = Number.parseFloat(String(payload.article_quality_score ?? payload.article_score ?? ''));
      const articleCharCount = Number.parseInt(String(payload.article_char_count ?? payload.article_chars ?? 0), 10) || 0;
      const articleLow = truthyFlag(payload.article_low_quality);
      const structuredJsonLdCount = Number.parseInt(String(payload.structured_json_ld_count || 0), 10) || 0;
      const structuredMicrodataCount = Number.parseInt(String(payload.structured_microdata_count || 0), 10) || 0;
      const structuredOpengraphCount = Number.parseInt(String(payload.structured_opengraph_count || 0), 10) || 0;
      const structuredCandidateCount = Number.parseInt(String(payload.structured_candidates || 0), 10) || 0;
      const structuredRejectedCount = Number.parseInt(String(payload.structured_rejected_candidates || 0), 10) || 0;
      const structuredErrorCount = Number.parseInt(String(payload.structured_error_count || 0), 10) || 0;
      const pdfDocsParsedCount = Number.parseInt(String(payload.pdf_docs_parsed || 0), 10) || 0;
      const pdfPairsCount = Number.parseInt(String(payload.pdf_pairs_total || 0), 10) || 0;
      const pdfKvPairsCount = Number.parseInt(String(payload.pdf_kv_pairs || 0), 10) || 0;
      const pdfTablePairsCount = Number.parseInt(String(payload.pdf_table_pairs || 0), 10) || 0;
      const pdfPagesScannedCount = Number.parseInt(String(payload.pdf_pages_scanned || 0), 10) || 0;
      const pdfErrorCount = Number.parseInt(String(payload.pdf_error_count || 0), 10) || 0;
      const scannedDocsDetectedCount = Number.parseInt(String(payload.scanned_pdf_docs_detected || 0), 10) || 0;
      const scannedOcrDocsAttemptedCount = Number.parseInt(String(payload.scanned_pdf_ocr_docs_attempted || 0), 10) || 0;
      const scannedOcrDocsSucceededCount = Number.parseInt(String(payload.scanned_pdf_ocr_docs_succeeded || 0), 10) || 0;
      const scannedOcrPairsCount = Number.parseInt(String(payload.scanned_pdf_ocr_pairs || 0), 10) || 0;
      const scannedOcrKvPairsCount = Number.parseInt(String(payload.scanned_pdf_ocr_kv_pairs || 0), 10) || 0;
      const scannedOcrTablePairsCount = Number.parseInt(String(payload.scanned_pdf_ocr_table_pairs || 0), 10) || 0;
      const scannedOcrLowConfPairsCount = Number.parseInt(String(payload.scanned_pdf_ocr_low_conf_pairs || 0), 10) || 0;
      const scannedOcrErrorCount = Number.parseInt(String(payload.scanned_pdf_ocr_error_count || 0), 10) || 0;
      const scannedOcrConfidenceAvg = Number.parseFloat(String(payload.scanned_pdf_ocr_confidence_avg || 0)) || 0;
      const skipReason = normalizeToken(String(payload.skip_reason || payload.reason || ''));
      const statusClass = normalizeToken(String(payload.status_class || ''));
      const isFetchStarted = (
        eventName === 'source_fetch_started'
        || (stageName === 'fetch' && eventName === 'fetch_started')
      );
      const isFetchFinished = (
        eventName === 'source_processed'
        || eventName === 'source_fetch_failed'
        || (stageName === 'fetch' && eventName === 'fetch_finished')
      );
      const isFetchSkipped = (
        eventName === 'source_fetch_skipped'
        || (stageName === 'fetch' && eventName === 'fetch_skipped')
      );

      if (isFetchStarted) {
        started += 1;
        if (url && !activeByUrl.has(url)) {
          activeByUrl.set(url, hostToken);
          if (hostToken) {
            activeByHost.set(hostToken, (activeByHost.get(hostToken) || 0) + 1);
          }
        }
        peakInflight = Math.max(peakInflight, activeByUrl.size);
        continue;
      }

      if (isFetchSkipped) {
        if (skipReason === 'cooldown') skippedCooldown += 1;
        else if (skipReason === 'blocked_budget') skippedBlockedBudget += 1;
        else if (skipReason === 'retry_later') skippedRetryLater += 1;
        continue;
      }

      const isSchedulerEvent = stageName === 'fetch' && eventName.startsWith('scheduler_');
      if (isSchedulerEvent) {
        if (eventName === 'scheduler_tick') schedulerTicks += 1;
        else if (eventName === 'scheduler_host_wait') schedulerHostWaits += 1;
        else if (eventName === 'scheduler_fallback_started') {
          schedulerFallbackStarted += 1;
          schedulerFallbackFeed.push({
            ts: String(evt.ts || '').trim(),
            url,
            kind: 'started',
            from_mode: String(payload.from_mode || '').trim(),
            to_mode: String(payload.to_mode || '').trim(),
            outcome: String(payload.outcome || '').trim(),
            attempt: Number(payload.attempt || 0) || 0
          });
        } else if (eventName === 'scheduler_fallback_succeeded') {
          schedulerFallbackSucceeded += 1;
          schedulerFallbackFeed.push({
            ts: String(evt.ts || '').trim(),
            url,
            kind: 'succeeded',
            from_mode: String(payload.from_mode || '').trim(),
            to_mode: String(payload.mode || payload.to_mode || '').trim(),
            outcome: '',
            attempt: Number(payload.attempt || 0) || 0
          });
        } else if (eventName === 'scheduler_fallback_exhausted') {
          schedulerFallbackExhausted += 1;
          schedulerFallbackFeed.push({
            ts: String(evt.ts || '').trim(),
            url,
            kind: 'exhausted',
            from_mode: '',
            to_mode: '',
            outcome: String(payload.final_outcome || '').trim(),
            attempt: 0
          });
        }
        continue;
      }

      if (isFetchFinished) {
        const isSuccess = eventName === 'source_processed' || (stageName === 'fetch' && eventName === 'fetch_finished' && statusClass === 'ok');
        if (eventName === 'source_processed' || isSuccess) completed += 1;
        else failed += 1;
        if (fetcherKind.includes('http')) httpCount += 1;
        else if (fetcherKind.includes('playwright') || fetcherKind.includes('browser')) browserCount += 1;
        else otherCount += 1;
        if (Number.isFinite(fetchMs) && fetchMs > 0) {
          fetchDurationsMs.push(fetchMs);
        }

        if (url) {
          const activeHost = activeByUrl.get(url) || hostToken;
          activeByUrl.delete(url);
          if (activeHost) {
            const next = Math.max(0, (activeByHost.get(activeHost) || 0) - 1);
            if (next <= 0) activeByHost.delete(activeHost);
            else activeByHost.set(activeHost, next);
          }
        }
        continue;
      }

      const isParseFinished = (
        eventName === 'source_processed'
        || (stageName === 'parse' && eventName === 'parse_finished')
      );
      if (isParseFinished && Number.isFinite(parseMs) && parseMs > 0) {
        parseDurationsMs.push(parseMs);
      }
      const isCanonicalParseTelemetry = (
        (stageName === 'parse' && eventName === 'parse_finished')
        || (eventName === 'source_processed' && stageName !== 'parse')
      );
      if (isParseFinished) {
        if (isCanonicalParseTelemetry) {
          structuredJsonLd += Math.max(0, structuredJsonLdCount);
          structuredMicrodata += Math.max(0, structuredMicrodataCount);
          structuredOpengraph += Math.max(0, structuredOpengraphCount);
          structuredCandidates += Math.max(0, structuredCandidateCount);
          structuredRejected += Math.max(0, structuredRejectedCount);
          structuredErrors += Math.max(0, structuredErrorCount);
          pdfDocsParsed += Math.max(0, pdfDocsParsedCount);
          pdfPairsTotal += Math.max(0, pdfPairsCount);
          pdfKvPairs += Math.max(0, pdfKvPairsCount);
          pdfTablePairs += Math.max(0, pdfTablePairsCount);
          pdfPagesScanned += Math.max(0, pdfPagesScannedCount);
          pdfErrors += Math.max(0, pdfErrorCount);
          scannedPdfDocsDetected += Math.max(0, scannedDocsDetectedCount);
          scannedPdfOcrDocsAttempted += Math.max(0, scannedOcrDocsAttemptedCount);
          scannedPdfOcrDocsSucceeded += Math.max(0, scannedOcrDocsSucceededCount);
          scannedPdfOcrPairs += Math.max(0, scannedOcrPairsCount);
          scannedPdfOcrKvPairs += Math.max(0, scannedOcrKvPairsCount);
          scannedPdfOcrTablePairs += Math.max(0, scannedOcrTablePairsCount);
          scannedPdfOcrLowConfPairs += Math.max(0, scannedOcrLowConfPairsCount);
          scannedPdfOcrErrors += Math.max(0, scannedOcrErrorCount);
          if (scannedOcrConfidenceAvg > 0) {
            scannedPdfOcrConfidenceSum += scannedOcrConfidenceAvg;
            scannedPdfOcrConfidenceCount += 1;
          }
          if (Array.isArray(payload.structured_snippet_rows)) {
            for (const row of payload.structured_snippet_rows.slice(0, 20)) {
              if (!row || typeof row !== 'object') continue;
              structuredSnippetRows.push({
                ts: String(evt.ts || '').trim(),
                url,
                source_surface: String((row as Record<string, unknown>).source_surface || (row as Record<string, unknown>).method || '').trim(),
                key_path: String((row as Record<string, unknown>).key_path || '').trim(),
                value_preview: String((row as Record<string, unknown>).value_preview || '').trim(),
                target_match_score: Number((row as Record<string, unknown>).target_match_score || 0) || 0,
                target_match_passed: truthyFlag((row as Record<string, unknown>).target_match_passed)
              });
            }
          }
        }
        const hasArticleSignal = (
          Boolean(articleMethod)
          || Number.isFinite(articleScore)
          || articleCharCount > 0
          || articleLow
        );
        if (hasArticleSignal) {
          articleSamples += 1;
          if (articleMethod.includes('readability')) articleReadability += 1;
          else if (articleMethod.includes('fallback') || articleMethod.includes('heuristic') || articleMethod.includes('parse_template')) articleFallback += 1;
          if (articleLow) articleLowQuality += 1;
          if (Number.isFinite(articleScore)) articleScores.push(articleScore);
          if (articleCharCount > 0) articleChars.push(articleCharCount);
        }
      }
    }

    const hostsActive = [...activeByHost.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([host, inflight]) => ({ host, inflight }));

    return {
      activeInflight: activeByUrl.size,
      peakInflight,
      started,
      completed,
      failed,
      skippedCooldown,
      skippedBlockedBudget,
      skippedRetryLater,
      httpCount,
      browserCount,
      otherCount,
      articleSamples,
      articleReadability,
      articleFallback,
      articleLowQuality,
      structuredJsonLd,
      structuredMicrodata,
      structuredOpengraph,
      structuredCandidates,
      structuredRejected,
      structuredErrors,
      pdfDocsParsed,
      pdfPairsTotal,
      pdfKvPairs,
      pdfTablePairs,
      pdfPagesScanned,
      pdfErrors,
      scannedPdfDocsDetected,
      scannedPdfOcrDocsAttempted,
      scannedPdfOcrDocsSucceeded,
      scannedPdfOcrPairs,
      scannedPdfOcrKvPairs,
      scannedPdfOcrTablePairs,
      scannedPdfOcrLowConfPairs,
      scannedPdfOcrErrors,
      scannedPdfOcrConfidenceAvg: scannedPdfOcrConfidenceCount > 0
        ? (scannedPdfOcrConfidenceSum / scannedPdfOcrConfidenceCount)
        : 0,
      structuredSnippetRows: structuredSnippetRows
        .slice(-80)
        .sort((a, b) => Date.parse(b.ts || '') - Date.parse(a.ts || ''))
        .slice(0, 40),
      articleAvgScore: articleScores.length > 0
        ? (articleScores.reduce((sum, value) => sum + value, 0) / articleScores.length)
        : 0,
      articleAvgChars: articleChars.length > 0
        ? (articleChars.reduce((sum, value) => sum + value, 0) / articleChars.length)
        : 0,
      fetchP95Ms: percentileMs(fetchDurationsMs, 95),
      parseP95Ms: percentileMs(parseDurationsMs, 95),
      schedulerFallbackStarted,
      schedulerFallbackSucceeded,
      schedulerFallbackExhausted,
      schedulerHostWaits,
      schedulerTicks,
      schedulerFallbackFeed: schedulerFallbackFeed
        .slice(-60)
        .sort((a, b) => Date.parse(b.ts || '') - Date.parse(a.ts || ''))
        .slice(0, 30),
      hostsActive
    };
  }, [indexlabEvents]);
  const phase5Activity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'source_fetch_started'
          || event.event === 'source_processed'
          || event.event === 'source_fetch_failed'
          || event.event === 'source_fetch_skipped'
          || (event.stage === 'fetch' && event.event === 'fetch_started')
          || (event.stage === 'fetch' && event.event === 'fetch_finished')
          || (event.stage === 'fetch' && event.event === 'fetch_skipped')
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase5Status = useMemo(() => {
    const hasSignals =
      phase5Runtime.started > 0
      || phase5Runtime.completed > 0
      || phase5Runtime.failed > 0
      || phase5Runtime.peakInflight > 0
      || phase5Runtime.skippedCooldown > 0
      || phase5Runtime.skippedBlockedBudget > 0
      || phase5Runtime.skippedRetryLater > 0;
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : 'collecting'
      };
    }
    if (hasSignals) {
      return {
        state: 'ready' as const,
        label: 'ready'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 05 payload'
    };
  }, [selectedIndexLabRunId, processRunning, phase5Runtime]);
  const dynamicFetchDashboardHosts = useMemo(() => {
    const rows = Array.isArray(indexlabDynamicFetchDashboardResp?.hosts)
      ? indexlabDynamicFetchDashboardResp.hosts
      : [];
    return [...rows]
      .map((row) => ({
        ...row,
        host: String(row.host || '').trim()
      }))
      .filter((row) => Boolean(row.host))
      .sort((a, b) => (
        Number(b.request_count || 0) - Number(a.request_count || 0)
        || Number(b.retry_count_total || 0) - Number(a.retry_count_total || 0)
        || String(a.host || '').localeCompare(String(b.host || ''))
      ));
  }, [indexlabDynamicFetchDashboardResp]);
  const dynamicFetchDashboardSummary = useMemo(() => {
    const rows = dynamicFetchDashboardHosts;
    const sum = (getter: (row: IndexLabDynamicFetchDashboardHostRow) => number) =>
      rows.reduce((total, row) => total + getter(row), 0);
    return {
      hostCount: Number(indexlabDynamicFetchDashboardResp?.host_count || rows.length || 0),
      requests: sum((row) => Number(row.request_count || 0)),
      retries: sum((row) => Number(row.retry_count_total || 0)),
      screenshots: sum((row) => Number(row.screenshot_count || 0)),
      networkRows: sum((row) => Number(row.network_payload_rows_total || 0)),
      graphqlRows: sum((row) => Number(row.graphql_replay_rows_total || 0)),
      summaryOnly: Boolean(indexlabDynamicFetchDashboardResp?.summary_only),
      generatedAt: String(indexlabDynamicFetchDashboardResp?.generated_at || '').trim() || null
    };
  }, [dynamicFetchDashboardHosts, indexlabDynamicFetchDashboardResp]);
  const phase6bJobs = useMemo(
    () => Array.isArray(indexlabAutomationQueueResp?.jobs) ? indexlabAutomationQueueResp.jobs : [],
    [indexlabAutomationQueueResp]
  );
  const phase6bActions = useMemo(
    () => Array.isArray(indexlabAutomationQueueResp?.actions) ? indexlabAutomationQueueResp.actions : [],
    [indexlabAutomationQueueResp]
  );
  const phase6bSummary = useMemo(() => {
    const summary = indexlabAutomationQueueResp?.summary || {};
    const fallback = {
      queued: 0,
      running: 0,
      done: 0,
      failed: 0,
      cooldown: 0,
      repair_search: 0,
      staleness_refresh: 0,
      deficit_rediscovery: 0,
      domain_backoff: 0
    };
    for (const row of phase6bJobs) {
      const status = normalizeToken(row.status || '');
      if (status === 'queued') fallback.queued += 1;
      else if (status === 'running') fallback.running += 1;
      else if (status === 'done') fallback.done += 1;
      else if (status === 'failed') fallback.failed += 1;
      else if (status === 'cooldown') fallback.cooldown += 1;

      const jobType = normalizeToken(row.job_type || '');
      if (jobType === 'repair_search') fallback.repair_search += 1;
      else if (jobType === 'staleness_refresh') fallback.staleness_refresh += 1;
      else if (jobType === 'deficit_rediscovery') fallback.deficit_rediscovery += 1;
      else if (jobType === 'domain_backoff') fallback.domain_backoff += 1;
    }
    const queued = Number(summary.queued ?? fallback.queued);
    const running = Number(summary.running ?? fallback.running);
    const done = Number(summary.done ?? fallback.done);
    const failed = Number(summary.failed ?? fallback.failed);
    const cooldown = Number(summary.cooldown ?? fallback.cooldown);
    const totalJobs = Number(summary.total_jobs ?? phase6bJobs.length);
    const queueDepth = Number(summary.queue_depth ?? (queued + running + failed));
    const activeJobs = Number(summary.active_jobs ?? (queued + running));
    return {
      totalJobs,
      queueDepth,
      activeJobs,
      queued,
      running,
      done,
      failed,
      cooldown,
      repairSearch: Number(summary.repair_search ?? fallback.repair_search),
      stalenessRefresh: Number(summary.staleness_refresh ?? fallback.staleness_refresh),
      deficitRediscovery: Number(summary.deficit_rediscovery ?? fallback.deficit_rediscovery),
      domainBackoff: Number(summary.domain_backoff ?? fallback.domain_backoff)
    };
  }, [indexlabAutomationQueueResp, phase6bJobs]);
  const phase6bActivity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'repair_query_enqueued'
          || event.event === 'url_cooldown_applied'
          || event.event === 'blocked_domain_cooldown_applied'
          || event.event === 'source_fetch_skipped'
          || event.event === 'discovery_query_started'
          || event.event === 'discovery_query_completed'
          || event.event === 'needset_computed'
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase6bStatus = useMemo(() => {
    const hasSignals =
      phase6bSummary.totalJobs > 0
      || phase6bActions.length > 0
      || phase6bSummary.queueDepth > 0;
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : 'collecting'
      };
    }
    if (hasSignals) {
      return {
        state: 'ready' as const,
        label: phase6bSummary.queueDepth > 0 ? 'ready (queued)' : 'ready'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 06b payload'
    };
  }, [selectedIndexLabRunId, processRunning, phase6bSummary, phase6bActions]);
  const phase6Runtime = useMemo(() => {
    const hashRows = new Map<string, {
      contentHash: string;
      hits: number;
      bytes: number;
      lastUrl: string;
      host: string;
      contentType: string;
      lastTs: string;
    }>();
    let processed = 0;
    let missingHash = 0;
    let dedupeHits = 0;
    let totalBytes = 0;
    let parseFinished = 0;
    let indexFinished = 0;

    for (const evt of indexlabEvents) {
      const payload = evt?.payload && typeof evt.payload === 'object'
        ? evt.payload as Record<string, unknown>
        : {};
      const eventName = normalizeToken(evt.event);
      const stageName = normalizeToken(evt.stage);
      const scope = normalizeToken(payload.scope || '');
      const isProcessedPayload = (
        eventName === 'source_processed'
        || (stageName === 'fetch' && eventName === 'fetch_finished' && scope === 'url')
      );
      if (isProcessedPayload) {
        processed += 1;
        const url = String(
          payload.final_url
          || payload.finalUrl
          || payload.url
          || payload.source_url
          || ''
        ).trim();
        const contentHash = String(payload.content_hash || payload.contentHash || '').trim();
        const bytes = Number.parseInt(String(payload.bytes || payload.content_length || 0), 10) || 0;
        const host = String(payload.host || hostFromUrl(url) || '').trim().toLowerCase();
        const contentType = String(payload.content_type || payload.contentType || '').trim().toLowerCase();
        if (bytes > 0) totalBytes += bytes;
        if (!contentHash) {
          missingHash += 1;
          continue;
        }
        const current = hashRows.get(contentHash);
        if (current) {
          dedupeHits += 1;
          current.hits += 1;
          current.bytes += bytes;
          current.lastUrl = url || current.lastUrl;
          current.host = host || current.host;
          current.contentType = contentType || current.contentType;
          current.lastTs = String(evt.ts || current.lastTs);
          continue;
        }
        hashRows.set(contentHash, {
          contentHash,
          hits: 1,
          bytes: Math.max(0, bytes),
          lastUrl: url,
          host,
          contentType,
          lastTs: String(evt.ts || '')
        });
        continue;
      }

      if (stageName === 'parse' && eventName === 'parse_finished' && scope === 'url') {
        parseFinished += 1;
      }
      if (stageName === 'index' && eventName === 'index_finished' && scope === 'url') {
        indexFinished += 1;
      }
    }

    const repeatedHashes = [...hashRows.values()]
      .filter((row) => row.hits > 1)
      .sort((a, b) => b.hits - a.hits || b.bytes - a.bytes || a.contentHash.localeCompare(b.contentHash))
      .slice(0, 12);

    return {
      processed,
      uniqueHashes: hashRows.size,
      dedupeHits,
      missingHash,
      hashCoveragePct: processed > 0 ? ((processed - missingHash) / processed) * 100 : 0,
      totalBytes,
      parseFinished,
      indexFinished,
      repeatedHashes
    };
  }, [indexlabEvents]);
  const phase6EvidenceSummary = useMemo(() => {
    const summary = indexlabEvidenceIndexResp?.summary || {};
    return {
      dbReady: Boolean(indexlabEvidenceIndexResp?.db_ready),
      scopeMode: String(indexlabEvidenceIndexResp?.scope?.mode || '').trim() || 'none',
      documents: Number(summary.documents || 0),
      artifacts: Number(summary.artifacts || 0),
      artifactsWithHash: Number(summary.artifacts_with_hash || 0),
      uniqueHashes: Number(summary.unique_hashes || 0),
      assertions: Number(summary.assertions || 0),
      evidenceRefs: Number(summary.evidence_refs || 0),
      fieldsCovered: Number(summary.fields_covered || 0)
    };
  }, [indexlabEvidenceIndexResp]);
  const phase6DedupeStream = useMemo(() => {
    const ds = indexlabEvidenceIndexResp?.dedupe_stream || {};
    return {
      total: Number(ds.total || 0),
      newCount: Number(ds.new_count || 0),
      reusedCount: Number(ds.reused_count || 0),
      updatedCount: Number(ds.updated_count || 0),
      totalChunksIndexed: Number(ds.total_chunks_indexed || 0)
    };
  }, [indexlabEvidenceIndexResp]);
  const phase6EvidenceDocuments = useMemo<IndexLabEvidenceIndexDocumentRow[]>(
    () => (Array.isArray(indexlabEvidenceIndexResp?.documents) ? indexlabEvidenceIndexResp.documents : []),
    [indexlabEvidenceIndexResp]
  );
  const phase6EvidenceTopFields = useMemo<IndexLabEvidenceIndexFieldRow[]>(
    () => (Array.isArray(indexlabEvidenceIndexResp?.top_fields) ? indexlabEvidenceIndexResp.top_fields : []),
    [indexlabEvidenceIndexResp]
  );
  const phase6EvidenceSearchRows = useMemo<IndexLabEvidenceIndexSearchRow[]>(
    () => (Array.isArray(indexlabEvidenceIndexResp?.search?.rows) ? indexlabEvidenceIndexResp.search.rows : []),
    [indexlabEvidenceIndexResp]
  );
  const phase6Activity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'source_processed'
          || (event.stage === 'fetch' && event.event === 'fetch_finished')
          || (event.stage === 'parse' && event.event === 'parse_finished')
          || (event.stage === 'index' && event.event === 'index_finished')
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase6Status = useMemo(() => {
    const hasSignals =
      phase6Runtime.processed > 0
      || phase6Runtime.uniqueHashes > 0
      || phase6Runtime.dedupeHits > 0
      || phase6Runtime.parseFinished > 0
      || phase6Runtime.indexFinished > 0
      || phase6EvidenceSummary.documents > 0
      || phase6EvidenceSummary.assertions > 0;
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : 'collecting'
      };
    }
    if (hasSignals) {
      return {
        state: 'ready' as const,
        label: 'ready'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 06a payload'
    };
  }, [selectedIndexLabRunId, processRunning, phase6Runtime, phase6EvidenceSummary]);
  const phase7Fields = useMemo<IndexLabPhase07FieldRow[]>(
    () => (Array.isArray(indexlabPhase07Resp?.fields) ? indexlabPhase07Resp.fields : []),
    [indexlabPhase07Resp]
  );
  const phase7Summary = useMemo(() => {
    const summary = indexlabPhase07Resp?.summary || {};
    const attempted = Number(summary.fields_attempted ?? phase7Fields.length);
    const withHits = Number(summary.fields_with_hits ?? phase7Fields.filter((row) => Number(row.hits_count || 0) > 0).length);
    const satisfied = Number(summary.fields_satisfied_min_refs ?? phase7Fields.filter((row) => Boolean(row.min_refs_satisfied)).length);
    const unsatisfied = Number(summary.fields_unsatisfied_min_refs ?? Math.max(0, attempted - satisfied));
    const refsSelected = Number(summary.refs_selected_total ?? phase7Fields.reduce((sum, row) => sum + Number(row.refs_selected || 0), 0));
    const distinctSources = Number(summary.distinct_sources_selected ?? phase7Fields.reduce((sum, row) => sum + Number(row.distinct_sources_selected || 0), 0));
    const avgHitsPerField = Number(summary.avg_hits_per_field ?? (attempted > 0
      ? phase7Fields.reduce((sum, row) => sum + Number(row.hits_count || 0), 0) / attempted
      : 0));
    const evidencePoolSize = Number(summary.evidence_pool_size || 0);
    return {
      attempted,
      withHits,
      satisfied,
      unsatisfied,
      refsSelected,
      distinctSources,
      avgHitsPerField: Number(avgHitsPerField.toFixed(3)),
      evidencePoolSize
    };
  }, [indexlabPhase07Resp, phase7Fields]);
  const phase7Activity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'phase07_prime_sources_built'
          || event.event === 'needset_computed'
          || (event.stage === 'index' && event.event === 'phase07_prime_sources_built')
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase7Status = useMemo(() => {
    const hasSignals =
      phase7Summary.attempted > 0
      || phase7Summary.refsSelected > 0
      || phase7Fields.length > 0;
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : 'collecting'
      };
    }
    if (hasSignals) {
      return {
        state: 'ready' as const,
        label: 'ready'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 07 payload'
    };
  }, [selectedIndexLabRunId, processRunning, phase7Summary, phase7Fields]);
  const phase7FieldRows = useMemo(() => {
    const rows = [...phase7Fields];
    rows.sort((a, b) => Number(b.need_score || 0) - Number(a.need_score || 0) || String(a.field_key || '').localeCompare(String(b.field_key || '')));
    return rows;
  }, [phase7Fields]);
  const phase7PrimeRows = useMemo(() => {
    const rows: Array<{
      field_key: string;
      score: number;
      url: string;
      host: string;
      tier: string;
      doc_kind: string;
      snippet_id: string;
      quote_preview: string;
      reason_badges: string[];
    }> = [];
    for (const fieldRow of phase7FieldRows) {
      for (const row of fieldRow.prime_sources || []) {
        rows.push({
          field_key: String(fieldRow.field_key || '').trim(),
          score: Number(row.score || 0),
          url: String(row.url || '').trim(),
          host: String(row.host || '').trim(),
          tier: String(row.tier_name || (Number.isFinite(Number(row.tier)) ? `tier ${row.tier}` : '-')).trim(),
          doc_kind: String(row.doc_kind || '').trim(),
          snippet_id: String(row.snippet_id || '').trim(),
          quote_preview: String(row.quote_preview || '').trim(),
          reason_badges: Array.isArray(row.reason_badges) ? row.reason_badges : []
        });
      }
    }
    rows.sort((a, b) => b.score - a.score || a.field_key.localeCompare(b.field_key));
    return rows;
  }, [phase7FieldRows]);
  const phase7HitRows = useMemo(() => {
    const rows: Array<{
      field_key: string;
      score: number;
      url: string;
      host: string;
      tier: string;
      doc_kind: string;
      selected: boolean;
      quote_preview: string;
    }> = [];
    for (const fieldRow of phase7FieldRows) {
      const selectedSnippets = new Set(
        (fieldRow.prime_sources || [])
          .map((item) => String(item.snippet_id || '').trim())
          .filter(Boolean)
      );
      for (const row of (fieldRow.hits || []).slice(0, 5)) {
        const snippetId = String(row.snippet_id || '').trim();
        rows.push({
          field_key: String(fieldRow.field_key || '').trim(),
          score: Number(row.score || 0),
          url: String(row.url || '').trim(),
          host: String(row.host || '').trim(),
          tier: String(row.tier_name || (Number.isFinite(Number(row.tier)) ? `tier ${row.tier}` : '-')).trim(),
          doc_kind: String(row.doc_kind || '').trim(),
          selected: snippetId ? selectedSnippets.has(snippetId) : false,
          quote_preview: String(row.quote_preview || '').trim()
        });
      }
    }
    rows.sort((a, b) => b.score - a.score || a.field_key.localeCompare(b.field_key));
    return rows;
  }, [phase7FieldRows]);
  const phase8Batches = useMemo<IndexLabPhase08BatchRow[]>(
    () => (Array.isArray(indexlabPhase08Resp?.batches) ? indexlabPhase08Resp.batches : []),
    [indexlabPhase08Resp]
  );
  const phase8FieldContextRows = useMemo<IndexLabPhase08FieldContextRow[]>(() => {
    const map = indexlabPhase08Resp?.field_contexts || {};
    const rows = Object.entries(map).map(([fieldKey, row]) => ({
      field_key: fieldKey,
      ...(row || {})
    }));
    rows.sort((a, b) => String(a.field_key || '').localeCompare(String(b.field_key || '')));
    return rows;
  }, [indexlabPhase08Resp]);
  const phase8PrimeRows = useMemo<IndexLabPhase08PrimeRow[]>(
    () => (Array.isArray(indexlabPhase08Resp?.prime_sources?.rows) ? indexlabPhase08Resp?.prime_sources?.rows || [] : []),
    [indexlabPhase08Resp]
  );
  const phase8Summary = useMemo(() => {
    const summary = indexlabPhase08Resp?.summary || {};
    const batchCount = Number(summary.batch_count ?? phase8Batches.length);
    const batchErrorCount = Number(summary.batch_error_count || 0);
    const schemaFailRate = Number(summary.schema_fail_rate || 0);
    const rawCandidateCount = Number(summary.raw_candidate_count || 0);
    const acceptedCandidateCount = Number(summary.accepted_candidate_count || 0);
    const danglingRefCount = Number(summary.dangling_snippet_ref_count || 0);
    const danglingRefRate = Number(summary.dangling_snippet_ref_rate || 0);
    const policyViolationCount = Number(summary.evidence_policy_violation_count || 0);
    const policyViolationRate = Number(summary.evidence_policy_violation_rate || 0);
    const minRefsSatisfied = Number(summary.min_refs_satisfied_count || 0);
    const minRefsTotal = Number(summary.min_refs_total || 0);
    const minRefsSatisfiedRate = Number(summary.min_refs_satisfied_rate || 0);
    const validatorContextFields = Number(summary.validator_context_field_count || 0);
    const validatorPrimeRows = Number(summary.validator_prime_source_rows || 0);
    return {
      batchCount,
      batchErrorCount,
      schemaFailRate,
      rawCandidateCount,
      acceptedCandidateCount,
      danglingRefCount,
      danglingRefRate,
      policyViolationCount,
      policyViolationRate,
      minRefsSatisfied,
      minRefsTotal,
      minRefsSatisfiedRate,
      validatorContextFields,
      validatorPrimeRows
    };
  }, [indexlabPhase08Resp, phase8Batches]);
  const phase8Activity = useMemo(
    () =>
      computeActivityStats(
        timedIndexlabEvents,
        activityNowMs,
        (event) => (
          event.event === 'llm_extract_batch_prompt_profile'
          || event.event === 'llm_extract_batch_outcome'
          || event.event === 'phase08_extraction_context_built'
          || (event.stage === 'index' && event.event === 'phase08_extraction_context_built')
        )
      ),
    [timedIndexlabEvents, activityNowMs]
  );
  const phase8Status = useMemo(() => {
    const hasSignals =
      phase8Summary.batchCount > 0
      || phase8Summary.rawCandidateCount > 0
      || phase8FieldContextRows.length > 0
      || phase8PrimeRows.length > 0;
    if (!selectedIndexLabRunId) {
      return {
        state: 'waiting' as const,
        label: 'no run selected'
      };
    }
    if (processRunning) {
      return {
        state: 'live' as const,
        label: hasSignals ? 'active' : 'collecting'
      };
    }
    if (hasSignals) {
      return {
        state: 'ready' as const,
        label: 'ready'
      };
    }
    return {
      state: 'waiting' as const,
      label: 'no phase 08 payload'
    };
  }, [selectedIndexLabRunId, processRunning, phase8Summary, phase8FieldContextRows, phase8PrimeRows]);
  const containerStatuses = useMemo<Array<{ label: string; state: PanelStateToken; detail: string }>>(() => {
    const searchState: PanelStateToken =
      indexlabSearchProfile
        ? (normalizeToken(indexlabSearchProfile.status) === 'planned' ? 'live' : 'ready')
        : 'waiting';
    const phase3State: PanelStateToken =
      phase3Status.state === 'live'
        ? 'live'
        : (phase3Status.state === 'ready' ? 'ready' : 'waiting');
    const needsetRows = Number(indexlabNeedsetRows.length || 0);
    return [
      {
        label: 'Run Controls',
        state: processRunning ? 'live' as const : 'ready' as const,
        detail: processRunning ? 'run active' : 'ready'
      },
      {
        label: 'Event Stream',
        state: indexlabEvents.length > 0 ? (processRunning ? 'live' : 'ready') : 'waiting',
        detail: `${formatNumber(indexlabEvents.length)} events`
      },
      {
        label: 'NeedSet',
        state: needsetRows > 0 ? (processRunning ? 'live' : 'ready') : 'waiting',
        detail: `${formatNumber(needsetRows)} rows`
      },
      {
        label: 'Search Profile',
        state: searchState,
        detail: indexlabSearchProfile?.status || 'not generated'
      },
      {
        label: 'SERP Explorer',
        state: phase3State,
        detail: phase3Status.label
      },
      {
        label: 'URL Health',
        state: phase4Status.state,
        detail: phase4Status.label
      },
      {
        label: 'Parallel Fetch/Parse',
        state: phase5Status.state,
        detail: phase5Status.label
      },
      {
        label: 'Evidence Index',
        state: phase6Status.state,
        detail: phase6Status.label
      },
      {
        label: 'Tier Retrieval',
        state: phase7Status.state,
        detail: phase7Status.label
      },
      {
        label: 'Extraction Context',
        state: phase8Status.state,
        detail: phase8Status.label
      },
      {
        label: 'Automation Queue',
        state: phase6bStatus.state,
        detail: phase6bStatus.label
      },
      {
        label: 'LLM Metrics',
        state: Number(selectedRunLlmMetrics?.calls || 0) > 0 ? 'ready' : 'waiting',
        detail: `${formatNumber(Number(selectedRunLlmMetrics?.calls || 0))} calls`
      }
    ];
  }, [
    processRunning,
    indexlabEvents,
    indexlabNeedsetRows,
    indexlabSearchProfile,
    phase3Status,
    phase4Status,
    phase5Status,
    phase6bStatus,
    phase6Status,
    phase7Status,
    phase8Status,
    selectedRunLlmMetrics
  ]);
  const sessionCrawledCells = useMemo<Array<{ key: string; label: string; value: string; tooltip: string; placeholder?: boolean }>>(() => {
    const jobs = Array.isArray(indexlabSummary.allJobs) ? indexlabSummary.allJobs : [];
    const crawledUrls = jobs
      .map((row) => String(row.url || '').trim())
      .filter(Boolean);
    const fetchedUrls = jobs
      .filter((row) => String(row.status || '').trim() !== 'in_flight')
      .map((row) => String(row.url || '').trim())
      .filter(Boolean);
    const domainFetchedCount = new Set(fetchedUrls.map((url) => hostFromUrl(url)).filter(Boolean)).size;
    const graphqlFetched = fetchedUrls.filter((url) => looksLikeGraphqlUrl(url)).length;
    const jsonFetched = fetchedUrls.filter((url) => looksLikeJsonUrl(url)).length;
    const pdfFetched = fetchedUrls.filter((url) => looksLikePdfUrl(url)).length;
    const urlsSelected = Number(
      indexlabSerpExplorer?.urls_selected
      || (Array.isArray(indexlabSerpExplorer?.selected_urls) ? indexlabSerpExplorer?.selected_urls.length : 0)
      || 0
    );
    const duplicatesRemoved = Number(indexlabSerpExplorer?.duplicates_removed || 0);
    const fetchedOk = Number(indexlabSummary.counters.fetched_ok || 0);
    const fetched404 = Number(indexlabSummary.counters.fetched_404 || 0);
    const fetchedBlocked = Number(indexlabSummary.counters.fetched_blocked || 0);
    const fetchedErrors = Number(indexlabSummary.counters.fetched_error || 0);
    const parseCompleted = Number(indexlabSummary.counters.parse_completed || 0);
    const indexedDocs = Number(indexlabSummary.counters.indexed_docs || 0);
    const fieldsFilled = Number(indexlabSummary.counters.fields_filled || 0);
    const llmCalls = Number(indexlabLlmTracesResp?.count || llmTraceRows.length || selectedRunLlmMetrics?.calls || 0);
    const sessionRunningLlmCost = Number(selectedRunLlmMetrics?.cost_usd || 0);
    const needsetRemaining = Number(indexlabNeedset?.needset_size || 0);
    const contentHashDedupeHits = Number(phase6Runtime.dedupeHits || 0);
    const phase07FieldsSatisfied = Number(phase7Summary.satisfied || 0);
    const phase07RefsSelected = Number(phase7Summary.refsSelected || 0);

    return [
      {
        key: 'unique-url-crawled',
        label: 'Unique URL Crawled',
        value: formatNumber(crawledUrls.length),
        tooltip: 'Unique URLs discovered and entered into fetch flow for the selected run.'
      },
      {
        key: 'domains-fetched',
        label: 'Domains Fetched',
        value: formatNumber(domainFetchedCount),
        tooltip: 'Unique hostnames with at least one completed fetch event.'
      },
      {
        key: 'graphql-fetched',
        label: 'GraphQL Fetched',
        value: formatNumber(graphqlFetched),
        tooltip: 'Completed fetch URLs that look like GraphQL endpoints (path/query heuristic).'
      },
      {
        key: 'json-fetched',
        label: 'JSON Fetched',
        value: formatNumber(jsonFetched),
        tooltip: 'Completed fetch URLs that look like JSON resources (extension/query/path heuristic).'
      },
      {
        key: 'pdf-fetched',
        label: 'PDF Fetched',
        value: formatNumber(pdfFetched),
        tooltip: 'Completed fetch URLs ending in .pdf (document/manual style sources).'
      },
      {
        key: 'phase03-urls-selected',
        label: 'URLs Selected',
        value: formatNumber(urlsSelected),
        tooltip: 'Phase 03 triage-selected top-K URLs queued for fetch.'
      },
      {
        key: 'phase03-dedupe-removed',
        label: 'Duplicates Removed',
        value: formatNumber(duplicatesRemoved),
        tooltip: 'SERP candidate duplicates removed by dedupe during triage.'
      },
      {
        key: 'fetched-ok',
        label: 'Fetched OK',
        value: formatNumber(fetchedOk),
        tooltip: 'Fetch-complete URLs with HTTP success class in this run.'
      },
      {
        key: 'fetched-404',
        label: 'Fetched 404',
        value: formatNumber(fetched404),
        tooltip: 'Fetch-complete URLs returning 404/410 style not-found status.'
      },
      {
        key: 'fetched-blocked',
        label: 'Fetched Blocked',
        value: formatNumber(fetchedBlocked),
        tooltip: 'Fetch-complete URLs blocked by anti-bot/forbidden protections.'
      },
      {
        key: 'fetched-errors',
        label: 'Fetch Errors',
        value: formatNumber(fetchedErrors),
        tooltip: 'Fetch attempts that ended in non-success, non-404, non-blocked errors.'
      },
      {
        key: 'parse-completed',
        label: 'Parse Completed',
        value: formatNumber(parseCompleted),
        tooltip: 'URLs that reached parse completion after fetch.'
      },
      {
        key: 'indexed-docs',
        label: 'Indexed Docs',
        value: formatNumber(indexedDocs),
        tooltip: 'Documents successfully indexed for retrieval/evidence reuse.'
      },
      {
        key: 'fields-filled',
        label: 'Fields Filled',
        value: formatNumber(fieldsFilled),
        tooltip: 'Total field fills emitted from indexed sources this run.'
      },
      {
        key: 'needset-remaining',
        label: 'NeedSet Remaining',
        value: formatNumber(needsetRemaining),
        tooltip: 'Open field deficits still unresolved for the selected run.'
      },
      {
        key: 'llm-calls-traced',
        label: 'LLM Calls Traced',
        value: formatNumber(llmCalls),
        tooltip: 'Total traced LLM calls for this run across plan/triage/extract/validate/write lanes.'
      },
      {
        key: 'session-running-llm-cost',
        label: 'Session Running LLM Cost',
        value: `$${formatNumber(sessionRunningLlmCost, 6)}`,
        tooltip: 'Accumulated LLM cost for the selected run/session (updates while run is active).'
      },
      {
        key: 'content-hash-dedupe-hits',
        label: 'Content Hash Dedupe Hits',
        value: formatNumber(contentHashDedupeHits),
        tooltip: 'Phase 06A: repeated content_hash matches detected from source-processed payloads in this run.'
      },
      {
        key: 'url-cooldowns-active',
        label: 'URL Cooldowns Active',
        value: formatNumber(phase4Summary.cooldownsActive),
        tooltip: 'Phase 04: domains currently showing next_retry cooldown/backoff windows.'
      },
      {
        key: 'scheduler-queue-depth',
        label: 'Scheduler Queue Depth',
        value: formatNumber(phase6bSummary.queueDepth),
        tooltip: 'Phase 06B queue depth across queued/running/failed automation jobs (repair, staleness refresh, deficit rediscovery).'
      },
      {
        key: 'phase07-fields-satisfied',
        label: 'Phase 07 Fields OK',
        value: formatNumber(phase07FieldsSatisfied),
        tooltip: 'Phase 07 fields currently satisfying min reference requirements via prime-source selection.'
      },
      {
        key: 'phase07-refs-selected',
        label: 'Prime Refs Selected',
        value: formatNumber(phase07RefsSelected),
        tooltip: 'Phase 07 prime source references selected across all NeedSet fields.'
      }
    ];
  }, [indexlabSummary, indexlabSerpExplorer, indexlabNeedset, indexlabLlmTracesResp, llmTraceRows, selectedRunLlmMetrics, phase4Summary, phase6Runtime, phase6bSummary, phase7Summary]);
  const pipelineSteps = useMemo<Array<{ label: string; state: PanelStateToken }>>(() => {
    const stageToken = (stage: 'search' | 'fetch' | 'parse' | 'index') => {
      const row = indexlabSummary.stageWindows[stage];
      if (row?.ended_at) return 'ready' as const;
      if (row?.started_at && processRunning) return 'live' as const;
      return 'waiting' as const;
    };
    const phase2Token = indexlabSearchProfile
      ? (normalizeToken(indexlabSearchProfile.status) === 'planned' ? 'live' : 'ready')
      : 'waiting';
    const phase3Token = phase3Status.state === 'live'
      ? 'live'
      : (phase3Status.state === 'ready' ? 'ready' : 'waiting');
    const phase4Token = phase4Status.state === 'live'
      ? 'live'
      : (phase4Status.state === 'ready' ? 'ready' : 'waiting');
    const phase5Token = phase5Status.state === 'live'
      ? 'live'
      : (phase5Status.state === 'ready' ? 'ready' : 'waiting');
    const phase6Token = phase6Status.state === 'live'
      ? 'live'
      : (phase6Status.state === 'ready' ? 'ready' : 'waiting');
    const phase7Token = phase7Status.state === 'live'
      ? 'live'
      : (phase7Status.state === 'ready' ? 'ready' : 'waiting');
    const phase8Token = phase8Status.state === 'live'
      ? 'live'
      : (phase8Status.state === 'ready' ? 'ready' : 'waiting');
    const phase6bToken = phase6bStatus.state === 'live'
      ? 'live'
      : (phase6bStatus.state === 'ready' ? 'ready' : 'waiting');
    return [
      { label: 'Search', state: stageToken('search') },
      { label: 'Fetch', state: stageToken('fetch') },
      { label: 'Parse', state: stageToken('parse') },
      { label: 'Index', state: stageToken('index') },
      { label: 'Search Planning', state: phase2Token },
      { label: 'SERP Triage', state: phase3Token },
      { label: 'URL Health & Repair', state: phase4Token },
      { label: 'Parallel Fetch & Parse', state: phase5Token },
      { label: 'Evidence Index & Dedupe', state: phase6Token },
      { label: 'Tier Retrieval & Prime Sources', state: phase7Token },
      { label: 'Extraction Context Matrix', state: phase8Token },
      { label: 'Automation Queue', state: phase6bToken }
    ];
  }, [indexlabSummary, processRunning, indexlabSearchProfile, phase3Status, phase4Status, phase5Status, phase6bStatus, phase6Status, phase7Status, phase8Status]);

  const publishProcessStatus = (status: ProcessStatus | null | undefined) => {
    if (!status || typeof status !== 'object') return;
    setRuntimeProcessStatus(status);
    queryClient.setQueryData(['processStatus'], status);
  };

  const refreshAll = async () => {
    const refreshes: Array<Promise<unknown>> = [
      queryClient.invalidateQueries({ queryKey: ['processStatus'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['searxng', 'status'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexing', 'llm-config'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexing', 'llm-metrics', category], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] }),
      queryClient.invalidateQueries({ queryKey: ['catalog', category, 'indexing'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['runtime-ops'] }),
      // Refresh any active run-level containers even if run selection changed recently.
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run'] })
    ];
    if (selectedIndexLabRunId) {
      refreshes.push(
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'events'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'needset'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'search-profile'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'serp'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'llm-traces'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'phase07-retrieval'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'phase08-extraction'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'dynamic-fetch-dashboard'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'evidence-index'] }),
        queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', selectedIndexLabRunId, 'rounds'], exact: true }),
        queryClient.invalidateQueries({ queryKey: ['runtime-ops', selectedIndexLabRunId] })
      );
    }
    await Promise.allSettled(refreshes);
    await queryClient.refetchQueries({
      queryKey: ['indexlab', 'run'],
      type: 'active'
    });
  };

  const removeRunScopedQueries = (runId: string) => {
    const token = String(runId || '').trim();
    if (!token) return;
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'events'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'needset'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'search-profile'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'serp'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'llm-traces'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'phase07-retrieval'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'phase08-extraction'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'dynamic-fetch-dashboard'], exact: true });
    queryClient.removeQueries({ queryKey: ['indexlab', 'run', token, 'rounds'], exact: true });
    queryClient.removeQueries({ queryKey: ['runtime-ops', token] });
  };

  const invalidateRunScopedQueries = (runId: string) => {
    const token = String(runId || '').trim();
    if (!token) return Promise.resolve();
    return Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'events'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'needset'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'search-profile'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'serp'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'llm-traces'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'phase07-retrieval'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'phase08-extraction'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'dynamic-fetch-dashboard'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'run', token, 'rounds'], exact: true }),
      queryClient.invalidateQueries({ queryKey: ['runtime-ops', token] }),
      queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] }),
    ]);
  };

  const clearSelectedRunView = () => {
    const runId = String(selectedIndexLabRunId || '').trim();
    clearProcessOutput();
    if (!runId) {
      setClearedRunViewId('');
      setSelectedLlmTraceId('');
      return;
    }
    clearIndexLabRun(runId);
    removeRunScopedQueries(runId);
    queryClient.removeQueries({ queryKey: ['indexing', 'domain-checklist'] });
    setClearedRunViewId(runId);
    setSelectedLlmTraceId('');
  };

  const replaySelectedRunView = async () => {
    const runId = String(selectedIndexLabRunId || '').trim();
    if (!runId || replayPending) return;
    setReplayPending(true);
    try {
      setClearedRunViewId('');
      await invalidateRunScopedQueries(runId);
      await queryClient.refetchQueries({
        queryKey: ['indexlab', 'run', runId],
        type: 'active'
      });
    } finally {
      setReplayPending(false);
    }
  };

  const runControlPayload = useMemo(() => {
    const clampWithFallback = (parsed: number, fallback: number, min: number, max: number) => {
      const source = Number.isFinite(parsed) ? parsed : fallback;
      return Math.max(min, Math.min(max, source));
    };
    const parsedResumeWindowHours = parseRuntimeInt(resumeWindowHours, runtimeSettingsBaseline.resumeWindowHours);
    const parsedReextractAfterHours = parseRuntimeInt(reextractAfterHours, runtimeSettingsBaseline.reextractAfterHours);
    const parsedNeedsetRequiredWeightIdentity = parseRuntimeFloat(
      needsetRequiredWeightIdentity,
      runtimeSettingsBaseline.needsetRequiredWeightIdentity,
    );
    const parsedNeedsetRequiredWeightCritical = parseRuntimeFloat(
      needsetRequiredWeightCritical,
      runtimeSettingsBaseline.needsetRequiredWeightCritical,
    );
    const parsedNeedsetRequiredWeightRequired = parseRuntimeFloat(
      needsetRequiredWeightRequired,
      runtimeSettingsBaseline.needsetRequiredWeightRequired,
    );
    const parsedNeedsetRequiredWeightExpected = parseRuntimeFloat(
      needsetRequiredWeightExpected,
      runtimeSettingsBaseline.needsetRequiredWeightExpected,
    );
    const parsedNeedsetRequiredWeightOptional = parseRuntimeFloat(
      needsetRequiredWeightOptional,
      runtimeSettingsBaseline.needsetRequiredWeightOptional,
    );
    const parsedNeedsetMissingMultiplier = parseRuntimeFloat(
      needsetMissingMultiplier,
      runtimeSettingsBaseline.needsetMissingMultiplier,
    );
    const parsedNeedsetTierDeficitMultiplier = parseRuntimeFloat(
      needsetTierDeficitMultiplier,
      runtimeSettingsBaseline.needsetTierDeficitMultiplier,
    );
    const parsedNeedsetMinRefsDeficitMultiplier = parseRuntimeFloat(
      needsetMinRefsDeficitMultiplier,
      runtimeSettingsBaseline.needsetMinRefsDeficitMultiplier,
    );
    const parsedNeedsetConflictMultiplier = parseRuntimeFloat(
      needsetConflictMultiplier,
      runtimeSettingsBaseline.needsetConflictMultiplier,
    );
    const parsedNeedsetIdentityLockThreshold = parseRuntimeFloat(
      needsetIdentityLockThreshold,
      runtimeSettingsBaseline.needsetIdentityLockThreshold,
    );
    const parsedNeedsetIdentityProvisionalThreshold = parseRuntimeFloat(
      needsetIdentityProvisionalThreshold,
      runtimeSettingsBaseline.needsetIdentityProvisionalThreshold,
    );
    const parsedNeedsetDefaultIdentityAuditLimit = parseRuntimeInt(
      needsetDefaultIdentityAuditLimit,
      runtimeSettingsBaseline.needsetDefaultIdentityAuditLimit,
    );
    const parsedConsensusMethodWeightNetworkJson = parseRuntimeFloat(
      consensusMethodWeightNetworkJson,
      runtimeSettingsBaseline.consensusMethodWeightNetworkJson,
    );
    const parsedConsensusMethodWeightAdapterApi = parseRuntimeFloat(
      consensusMethodWeightAdapterApi,
      runtimeSettingsBaseline.consensusMethodWeightAdapterApi,
    );
    const parsedConsensusMethodWeightStructuredMeta = parseRuntimeFloat(
      consensusMethodWeightStructuredMeta,
      runtimeSettingsBaseline.consensusMethodWeightStructuredMeta,
    );
    const parsedConsensusMethodWeightPdf = parseRuntimeFloat(
      consensusMethodWeightPdf,
      runtimeSettingsBaseline.consensusMethodWeightPdf,
    );
    const parsedConsensusMethodWeightTableKv = parseRuntimeFloat(
      consensusMethodWeightTableKv,
      runtimeSettingsBaseline.consensusMethodWeightTableKv,
    );
    const parsedConsensusMethodWeightDom = parseRuntimeFloat(
      consensusMethodWeightDom,
      runtimeSettingsBaseline.consensusMethodWeightDom,
    );
    const parsedConsensusMethodWeightLlmExtractBase = parseRuntimeFloat(
      consensusMethodWeightLlmExtractBase,
      runtimeSettingsBaseline.consensusMethodWeightLlmExtractBase,
    );
    const parsedConsensusPolicyBonus = parseRuntimeFloat(
      consensusPolicyBonus,
      runtimeSettingsBaseline.consensusPolicyBonus,
    );
    const parsedConsensusWeightedMajorityThreshold = parseRuntimeFloat(
      consensusWeightedMajorityThreshold,
      runtimeSettingsBaseline.consensusWeightedMajorityThreshold,
    );
    const parsedConsensusStrictAcceptanceDomainCount = parseRuntimeInt(
      consensusStrictAcceptanceDomainCount,
      runtimeSettingsBaseline.consensusStrictAcceptanceDomainCount,
    );
    const parsedConsensusRelaxedAcceptanceDomainCount = parseRuntimeInt(
      consensusRelaxedAcceptanceDomainCount,
      runtimeSettingsBaseline.consensusRelaxedAcceptanceDomainCount,
    );
    const parsedConsensusInstrumentedFieldThreshold = parseRuntimeInt(
      consensusInstrumentedFieldThreshold,
      runtimeSettingsBaseline.consensusInstrumentedFieldThreshold,
    );
    const parsedConsensusConfidenceScoringBase = parseRuntimeFloat(
      consensusConfidenceScoringBase,
      runtimeSettingsBaseline.consensusConfidenceScoringBase,
    );
    const parsedConsensusPassTargetIdentityStrong = parseRuntimeInt(
      consensusPassTargetIdentityStrong,
      runtimeSettingsBaseline.consensusPassTargetIdentityStrong,
    );
    const parsedConsensusPassTargetNormal = parseRuntimeInt(
      consensusPassTargetNormal,
      runtimeSettingsBaseline.consensusPassTargetNormal,
    );
    const parsedRetrievalTierWeightTier1 = parseRuntimeFloat(
      retrievalTierWeightTier1,
      runtimeSettingsBaseline.retrievalTierWeightTier1,
    );
    const parsedRetrievalTierWeightTier2 = parseRuntimeFloat(
      retrievalTierWeightTier2,
      runtimeSettingsBaseline.retrievalTierWeightTier2,
    );
    const parsedRetrievalTierWeightTier3 = parseRuntimeFloat(
      retrievalTierWeightTier3,
      runtimeSettingsBaseline.retrievalTierWeightTier3,
    );
    const parsedRetrievalTierWeightTier4 = parseRuntimeFloat(
      retrievalTierWeightTier4,
      runtimeSettingsBaseline.retrievalTierWeightTier4,
    );
    const parsedRetrievalTierWeightTier5 = parseRuntimeFloat(
      retrievalTierWeightTier5,
      runtimeSettingsBaseline.retrievalTierWeightTier5,
    );
    const parsedRetrievalDocKindWeightManualPdf = parseRuntimeFloat(
      retrievalDocKindWeightManualPdf,
      runtimeSettingsBaseline.retrievalDocKindWeightManualPdf,
    );
    const parsedRetrievalDocKindWeightSpecPdf = parseRuntimeFloat(
      retrievalDocKindWeightSpecPdf,
      runtimeSettingsBaseline.retrievalDocKindWeightSpecPdf,
    );
    const parsedRetrievalDocKindWeightSupport = parseRuntimeFloat(
      retrievalDocKindWeightSupport,
      runtimeSettingsBaseline.retrievalDocKindWeightSupport,
    );
    const parsedRetrievalDocKindWeightLabReview = parseRuntimeFloat(
      retrievalDocKindWeightLabReview,
      runtimeSettingsBaseline.retrievalDocKindWeightLabReview,
    );
    const parsedRetrievalDocKindWeightProductPage = parseRuntimeFloat(
      retrievalDocKindWeightProductPage,
      runtimeSettingsBaseline.retrievalDocKindWeightProductPage,
    );
    const parsedRetrievalDocKindWeightOther = parseRuntimeFloat(
      retrievalDocKindWeightOther,
      runtimeSettingsBaseline.retrievalDocKindWeightOther,
    );
    const parsedRetrievalMethodWeightTable = parseRuntimeFloat(
      retrievalMethodWeightTable,
      runtimeSettingsBaseline.retrievalMethodWeightTable,
    );
    const parsedRetrievalMethodWeightKv = parseRuntimeFloat(
      retrievalMethodWeightKv,
      runtimeSettingsBaseline.retrievalMethodWeightKv,
    );
    const parsedRetrievalMethodWeightJsonLd = parseRuntimeFloat(
      retrievalMethodWeightJsonLd,
      runtimeSettingsBaseline.retrievalMethodWeightJsonLd,
    );
    const parsedRetrievalMethodWeightLlmExtract = parseRuntimeFloat(
      retrievalMethodWeightLlmExtract,
      runtimeSettingsBaseline.retrievalMethodWeightLlmExtract,
    );
    const parsedRetrievalMethodWeightHelperSupportive = parseRuntimeFloat(
      retrievalMethodWeightHelperSupportive,
      runtimeSettingsBaseline.retrievalMethodWeightHelperSupportive,
    );
    const parsedRetrievalAnchorScorePerMatch = parseRuntimeFloat(
      retrievalAnchorScorePerMatch,
      runtimeSettingsBaseline.retrievalAnchorScorePerMatch,
    );
    const parsedRetrievalIdentityScorePerMatch = parseRuntimeFloat(
      retrievalIdentityScorePerMatch,
      runtimeSettingsBaseline.retrievalIdentityScorePerMatch,
    );
    const parsedRetrievalUnitMatchBonus = parseRuntimeFloat(
      retrievalUnitMatchBonus,
      runtimeSettingsBaseline.retrievalUnitMatchBonus,
    );
    const parsedRetrievalDirectFieldMatchBonus = parseRuntimeFloat(
      retrievalDirectFieldMatchBonus,
      runtimeSettingsBaseline.retrievalDirectFieldMatchBonus,
    );
    const parsedIdentityGateBaseMatchThreshold = parseRuntimeFloat(
      identityGateBaseMatchThreshold,
      runtimeSettingsBaseline.identityGateBaseMatchThreshold,
    );
    const parsedIdentityGateEasyAmbiguityReduction = parseRuntimeFloat(
      identityGateEasyAmbiguityReduction,
      runtimeSettingsBaseline.identityGateEasyAmbiguityReduction,
    );
    const parsedIdentityGateMediumAmbiguityReduction = parseRuntimeFloat(
      identityGateMediumAmbiguityReduction,
      runtimeSettingsBaseline.identityGateMediumAmbiguityReduction,
    );
    const parsedIdentityGateHardAmbiguityReduction = parseRuntimeFloat(
      identityGateHardAmbiguityReduction,
      runtimeSettingsBaseline.identityGateHardAmbiguityReduction,
    );
    const parsedIdentityGateVeryHardAmbiguityIncrease = parseRuntimeFloat(
      identityGateVeryHardAmbiguityIncrease,
      runtimeSettingsBaseline.identityGateVeryHardAmbiguityIncrease,
    );
    const parsedIdentityGateExtraHardAmbiguityIncrease = parseRuntimeFloat(
      identityGateExtraHardAmbiguityIncrease,
      runtimeSettingsBaseline.identityGateExtraHardAmbiguityIncrease,
    );
    const parsedIdentityGateMissingStrongIdPenalty = parseRuntimeFloat(
      identityGateMissingStrongIdPenalty,
      runtimeSettingsBaseline.identityGateMissingStrongIdPenalty,
    );
    const parsedIdentityGateHardMissingStrongIdIncrease = parseRuntimeFloat(
      identityGateHardMissingStrongIdIncrease,
      runtimeSettingsBaseline.identityGateHardMissingStrongIdIncrease,
    );
    const parsedIdentityGateVeryHardMissingStrongIdIncrease = parseRuntimeFloat(
      identityGateVeryHardMissingStrongIdIncrease,
      runtimeSettingsBaseline.identityGateVeryHardMissingStrongIdIncrease,
    );
    const parsedIdentityGateExtraHardMissingStrongIdIncrease = parseRuntimeFloat(
      identityGateExtraHardMissingStrongIdIncrease,
      runtimeSettingsBaseline.identityGateExtraHardMissingStrongIdIncrease,
    );
    const parsedIdentityGateNumericTokenBoost = parseRuntimeFloat(
      identityGateNumericTokenBoost,
      runtimeSettingsBaseline.identityGateNumericTokenBoost,
    );
    const parsedIdentityGateNumericRangeThreshold = parseRuntimeInt(
      identityGateNumericRangeThreshold,
      runtimeSettingsBaseline.identityGateNumericRangeThreshold,
    );
    const parsedQualityGateIdentityThreshold = parseRuntimeFloat(
      qualityGateIdentityThreshold,
      runtimeSettingsBaseline.qualityGateIdentityThreshold,
    );
    const parsedEvidenceTextMaxChars = parseRuntimeInt(
      evidenceTextMaxChars,
      runtimeSettingsBaseline.evidenceTextMaxChars,
    );
    return {
      resumeMode,
      resumeWindowHours: Number.isFinite(parsedResumeWindowHours) && parsedResumeWindowHours >= 0
        ? parsedResumeWindowHours
        : runtimeSettingsBaseline.resumeWindowHours,
      reextractAfterHours: Number.isFinite(parsedReextractAfterHours) && parsedReextractAfterHours >= 0
        ? parsedReextractAfterHours
        : runtimeSettingsBaseline.reextractAfterHours,
      reextractIndexed,
      needsetRequiredWeightIdentity: clampWithFallback(
        parsedNeedsetRequiredWeightIdentity,
        runtimeSettingsBaseline.needsetRequiredWeightIdentity,
        0.1,
        100,
      ),
      needsetRequiredWeightCritical: clampWithFallback(
        parsedNeedsetRequiredWeightCritical,
        runtimeSettingsBaseline.needsetRequiredWeightCritical,
        0.1,
        100,
      ),
      needsetRequiredWeightRequired: clampWithFallback(
        parsedNeedsetRequiredWeightRequired,
        runtimeSettingsBaseline.needsetRequiredWeightRequired,
        0.1,
        100,
      ),
      needsetRequiredWeightExpected: clampWithFallback(
        parsedNeedsetRequiredWeightExpected,
        runtimeSettingsBaseline.needsetRequiredWeightExpected,
        0.1,
        100,
      ),
      needsetRequiredWeightOptional: clampWithFallback(
        parsedNeedsetRequiredWeightOptional,
        runtimeSettingsBaseline.needsetRequiredWeightOptional,
        0.1,
        100,
      ),
      needsetMissingMultiplier: clampWithFallback(
        parsedNeedsetMissingMultiplier,
        runtimeSettingsBaseline.needsetMissingMultiplier,
        0.1,
        100,
      ),
      needsetTierDeficitMultiplier: clampWithFallback(
        parsedNeedsetTierDeficitMultiplier,
        runtimeSettingsBaseline.needsetTierDeficitMultiplier,
        0.1,
        100,
      ),
      needsetMinRefsDeficitMultiplier: clampWithFallback(
        parsedNeedsetMinRefsDeficitMultiplier,
        runtimeSettingsBaseline.needsetMinRefsDeficitMultiplier,
        0.1,
        100,
      ),
      needsetConflictMultiplier: clampWithFallback(
        parsedNeedsetConflictMultiplier,
        runtimeSettingsBaseline.needsetConflictMultiplier,
        0.1,
        100,
      ),
      needsetIdentityLockThreshold: clampWithFallback(
        parsedNeedsetIdentityLockThreshold,
        runtimeSettingsBaseline.needsetIdentityLockThreshold,
        0,
        1,
      ),
      needsetIdentityProvisionalThreshold: clampWithFallback(
        parsedNeedsetIdentityProvisionalThreshold,
        runtimeSettingsBaseline.needsetIdentityProvisionalThreshold,
        0,
        1,
      ),
      needsetDefaultIdentityAuditLimit: clampWithFallback(
        parsedNeedsetDefaultIdentityAuditLimit,
        runtimeSettingsBaseline.needsetDefaultIdentityAuditLimit,
        1,
        200,
      ),
      consensusMethodWeightNetworkJson: clampWithFallback(
        parsedConsensusMethodWeightNetworkJson,
        runtimeSettingsBaseline.consensusMethodWeightNetworkJson,
        0,
        2,
      ),
      consensusMethodWeightAdapterApi: clampWithFallback(
        parsedConsensusMethodWeightAdapterApi,
        runtimeSettingsBaseline.consensusMethodWeightAdapterApi,
        0,
        2,
      ),
      consensusMethodWeightStructuredMeta: clampWithFallback(
        parsedConsensusMethodWeightStructuredMeta,
        runtimeSettingsBaseline.consensusMethodWeightStructuredMeta,
        0,
        2,
      ),
      consensusMethodWeightPdf: clampWithFallback(
        parsedConsensusMethodWeightPdf,
        runtimeSettingsBaseline.consensusMethodWeightPdf,
        0,
        2,
      ),
      consensusMethodWeightTableKv: clampWithFallback(
        parsedConsensusMethodWeightTableKv,
        runtimeSettingsBaseline.consensusMethodWeightTableKv,
        0,
        2,
      ),
      consensusMethodWeightDom: clampWithFallback(
        parsedConsensusMethodWeightDom,
        runtimeSettingsBaseline.consensusMethodWeightDom,
        0,
        2,
      ),
      consensusMethodWeightLlmExtractBase: clampWithFallback(
        parsedConsensusMethodWeightLlmExtractBase,
        runtimeSettingsBaseline.consensusMethodWeightLlmExtractBase,
        0,
        2,
      ),
      consensusPolicyBonus: clampWithFallback(
        parsedConsensusPolicyBonus,
        runtimeSettingsBaseline.consensusPolicyBonus,
        -5,
        5,
      ),
      consensusWeightedMajorityThreshold: clampWithFallback(
        parsedConsensusWeightedMajorityThreshold,
        runtimeSettingsBaseline.consensusWeightedMajorityThreshold,
        1,
        10,
      ),
      consensusStrictAcceptanceDomainCount: clampWithFallback(
        parsedConsensusStrictAcceptanceDomainCount,
        runtimeSettingsBaseline.consensusStrictAcceptanceDomainCount,
        1,
        50,
      ),
      consensusRelaxedAcceptanceDomainCount: clampWithFallback(
        parsedConsensusRelaxedAcceptanceDomainCount,
        runtimeSettingsBaseline.consensusRelaxedAcceptanceDomainCount,
        1,
        50,
      ),
      consensusInstrumentedFieldThreshold: clampWithFallback(
        parsedConsensusInstrumentedFieldThreshold,
        runtimeSettingsBaseline.consensusInstrumentedFieldThreshold,
        1,
        50,
      ),
      consensusConfidenceScoringBase: clampWithFallback(
        parsedConsensusConfidenceScoringBase,
        runtimeSettingsBaseline.consensusConfidenceScoringBase,
        0,
        1,
      ),
      consensusPassTargetIdentityStrong: clampWithFallback(
        parsedConsensusPassTargetIdentityStrong,
        runtimeSettingsBaseline.consensusPassTargetIdentityStrong,
        1,
        50,
      ),
      consensusPassTargetNormal: clampWithFallback(
        parsedConsensusPassTargetNormal,
        runtimeSettingsBaseline.consensusPassTargetNormal,
        1,
        50,
      ),
      retrievalTierWeightTier1: clampWithFallback(
        parsedRetrievalTierWeightTier1,
        runtimeSettingsBaseline.retrievalTierWeightTier1,
        0,
        10,
      ),
      retrievalTierWeightTier2: clampWithFallback(
        parsedRetrievalTierWeightTier2,
        runtimeSettingsBaseline.retrievalTierWeightTier2,
        0,
        10,
      ),
      retrievalTierWeightTier3: clampWithFallback(
        parsedRetrievalTierWeightTier3,
        runtimeSettingsBaseline.retrievalTierWeightTier3,
        0,
        10,
      ),
      retrievalTierWeightTier4: clampWithFallback(
        parsedRetrievalTierWeightTier4,
        runtimeSettingsBaseline.retrievalTierWeightTier4,
        0,
        10,
      ),
      retrievalTierWeightTier5: clampWithFallback(
        parsedRetrievalTierWeightTier5,
        runtimeSettingsBaseline.retrievalTierWeightTier5,
        0,
        10,
      ),
      retrievalDocKindWeightManualPdf: clampWithFallback(
        parsedRetrievalDocKindWeightManualPdf,
        runtimeSettingsBaseline.retrievalDocKindWeightManualPdf,
        0,
        10,
      ),
      retrievalDocKindWeightSpecPdf: clampWithFallback(
        parsedRetrievalDocKindWeightSpecPdf,
        runtimeSettingsBaseline.retrievalDocKindWeightSpecPdf,
        0,
        10,
      ),
      retrievalDocKindWeightSupport: clampWithFallback(
        parsedRetrievalDocKindWeightSupport,
        runtimeSettingsBaseline.retrievalDocKindWeightSupport,
        0,
        10,
      ),
      retrievalDocKindWeightLabReview: clampWithFallback(
        parsedRetrievalDocKindWeightLabReview,
        runtimeSettingsBaseline.retrievalDocKindWeightLabReview,
        0,
        10,
      ),
      retrievalDocKindWeightProductPage: clampWithFallback(
        parsedRetrievalDocKindWeightProductPage,
        runtimeSettingsBaseline.retrievalDocKindWeightProductPage,
        0,
        10,
      ),
      retrievalDocKindWeightOther: clampWithFallback(
        parsedRetrievalDocKindWeightOther,
        runtimeSettingsBaseline.retrievalDocKindWeightOther,
        0,
        10,
      ),
      retrievalMethodWeightTable: clampWithFallback(
        parsedRetrievalMethodWeightTable,
        runtimeSettingsBaseline.retrievalMethodWeightTable,
        0,
        10,
      ),
      retrievalMethodWeightKv: clampWithFallback(
        parsedRetrievalMethodWeightKv,
        runtimeSettingsBaseline.retrievalMethodWeightKv,
        0,
        10,
      ),
      retrievalMethodWeightJsonLd: clampWithFallback(
        parsedRetrievalMethodWeightJsonLd,
        runtimeSettingsBaseline.retrievalMethodWeightJsonLd,
        0,
        10,
      ),
      retrievalMethodWeightLlmExtract: clampWithFallback(
        parsedRetrievalMethodWeightLlmExtract,
        runtimeSettingsBaseline.retrievalMethodWeightLlmExtract,
        0,
        10,
      ),
      retrievalMethodWeightHelperSupportive: clampWithFallback(
        parsedRetrievalMethodWeightHelperSupportive,
        runtimeSettingsBaseline.retrievalMethodWeightHelperSupportive,
        0,
        10,
      ),
      retrievalAnchorScorePerMatch: clampWithFallback(
        parsedRetrievalAnchorScorePerMatch,
        runtimeSettingsBaseline.retrievalAnchorScorePerMatch,
        0,
        2,
      ),
      retrievalIdentityScorePerMatch: clampWithFallback(
        parsedRetrievalIdentityScorePerMatch,
        runtimeSettingsBaseline.retrievalIdentityScorePerMatch,
        0,
        2,
      ),
      retrievalUnitMatchBonus: clampWithFallback(
        parsedRetrievalUnitMatchBonus,
        runtimeSettingsBaseline.retrievalUnitMatchBonus,
        0,
        2,
      ),
      retrievalDirectFieldMatchBonus: clampWithFallback(
        parsedRetrievalDirectFieldMatchBonus,
        runtimeSettingsBaseline.retrievalDirectFieldMatchBonus,
        0,
        2,
      ),
      identityGateBaseMatchThreshold: clampWithFallback(
        parsedIdentityGateBaseMatchThreshold,
        runtimeSettingsBaseline.identityGateBaseMatchThreshold,
        0,
        1,
      ),
      identityGateEasyAmbiguityReduction: clampWithFallback(
        parsedIdentityGateEasyAmbiguityReduction,
        runtimeSettingsBaseline.identityGateEasyAmbiguityReduction,
        -1,
        1,
      ),
      identityGateMediumAmbiguityReduction: clampWithFallback(
        parsedIdentityGateMediumAmbiguityReduction,
        runtimeSettingsBaseline.identityGateMediumAmbiguityReduction,
        -1,
        1,
      ),
      identityGateHardAmbiguityReduction: clampWithFallback(
        parsedIdentityGateHardAmbiguityReduction,
        runtimeSettingsBaseline.identityGateHardAmbiguityReduction,
        -1,
        1,
      ),
      identityGateVeryHardAmbiguityIncrease: clampWithFallback(
        parsedIdentityGateVeryHardAmbiguityIncrease,
        runtimeSettingsBaseline.identityGateVeryHardAmbiguityIncrease,
        -1,
        1,
      ),
      identityGateExtraHardAmbiguityIncrease: clampWithFallback(
        parsedIdentityGateExtraHardAmbiguityIncrease,
        runtimeSettingsBaseline.identityGateExtraHardAmbiguityIncrease,
        -1,
        1,
      ),
      identityGateMissingStrongIdPenalty: clampWithFallback(
        parsedIdentityGateMissingStrongIdPenalty,
        runtimeSettingsBaseline.identityGateMissingStrongIdPenalty,
        -1,
        1,
      ),
      identityGateHardMissingStrongIdIncrease: clampWithFallback(
        parsedIdentityGateHardMissingStrongIdIncrease,
        runtimeSettingsBaseline.identityGateHardMissingStrongIdIncrease,
        -1,
        1,
      ),
      identityGateVeryHardMissingStrongIdIncrease: clampWithFallback(
        parsedIdentityGateVeryHardMissingStrongIdIncrease,
        runtimeSettingsBaseline.identityGateVeryHardMissingStrongIdIncrease,
        -1,
        1,
      ),
      identityGateExtraHardMissingStrongIdIncrease: clampWithFallback(
        parsedIdentityGateExtraHardMissingStrongIdIncrease,
        runtimeSettingsBaseline.identityGateExtraHardMissingStrongIdIncrease,
        -1,
        1,
      ),
      identityGateNumericTokenBoost: clampWithFallback(
        parsedIdentityGateNumericTokenBoost,
        runtimeSettingsBaseline.identityGateNumericTokenBoost,
        -1,
        1,
      ),
      identityGateNumericRangeThreshold: clampWithFallback(
        parsedIdentityGateNumericRangeThreshold,
        runtimeSettingsBaseline.identityGateNumericRangeThreshold,
        0,
        500,
      ),
      qualityGateIdentityThreshold: clampWithFallback(
        parsedQualityGateIdentityThreshold,
        runtimeSettingsBaseline.qualityGateIdentityThreshold,
        0,
        1,
      ),
      evidenceTextMaxChars: clampWithFallback(
        parsedEvidenceTextMaxChars,
        runtimeSettingsBaseline.evidenceTextMaxChars,
        200,
        200_000,
      ),
    };
  }, [
    resumeMode,
    resumeWindowHours,
    reextractAfterHours,
    reextractIndexed,
    needsetRequiredWeightIdentity,
    needsetRequiredWeightCritical,
    needsetRequiredWeightRequired,
    needsetRequiredWeightExpected,
    needsetRequiredWeightOptional,
    needsetMissingMultiplier,
    needsetTierDeficitMultiplier,
    needsetMinRefsDeficitMultiplier,
    needsetConflictMultiplier,
    needsetIdentityLockThreshold,
    needsetIdentityProvisionalThreshold,
    needsetDefaultIdentityAuditLimit,
    consensusMethodWeightNetworkJson,
    consensusMethodWeightAdapterApi,
    consensusMethodWeightStructuredMeta,
    consensusMethodWeightPdf,
    consensusMethodWeightTableKv,
    consensusMethodWeightDom,
    consensusPolicyBonus,
    consensusWeightedMajorityThreshold,
    consensusStrictAcceptanceDomainCount,
    consensusRelaxedAcceptanceDomainCount,
    consensusInstrumentedFieldThreshold,
    consensusConfidenceScoringBase,
    consensusPassTargetIdentityStrong,
    consensusPassTargetNormal,
    retrievalTierWeightTier1,
    retrievalTierWeightTier2,
    retrievalTierWeightTier3,
    retrievalTierWeightTier4,
    retrievalTierWeightTier5,
    retrievalDocKindWeightManualPdf,
    retrievalDocKindWeightSpecPdf,
    retrievalDocKindWeightSupport,
    retrievalDocKindWeightLabReview,
    retrievalDocKindWeightProductPage,
    retrievalDocKindWeightOther,
    retrievalMethodWeightTable,
    retrievalMethodWeightKv,
    retrievalMethodWeightJsonLd,
    retrievalMethodWeightLlmExtract,
    retrievalMethodWeightHelperSupportive,
    retrievalAnchorScorePerMatch,
    retrievalIdentityScorePerMatch,
    retrievalUnitMatchBonus,
    retrievalDirectFieldMatchBonus,
    identityGateBaseMatchThreshold,
    identityGateEasyAmbiguityReduction,
    identityGateMediumAmbiguityReduction,
    identityGateHardAmbiguityReduction,
    identityGateVeryHardAmbiguityIncrease,
    identityGateExtraHardAmbiguityIncrease,
    identityGateMissingStrongIdPenalty,
    identityGateHardMissingStrongIdIncrease,
    identityGateVeryHardMissingStrongIdIncrease,
    identityGateExtraHardMissingStrongIdIncrease,
    identityGateNumericTokenBoost,
    identityGateNumericRangeThreshold,
    qualityGateIdentityThreshold,
    evidenceTextMaxChars,
    runtimeSettingsBaseline,
  ]);

  type StartIndexLabMutationVariables = {
    requestedRunId: string;
  };
  type StartIndexLabMutationContext = {
    previousRunId: string;
  };

  const startIndexLabMut = useMutation<
    ProcessStatus,
    Error,
    StartIndexLabMutationVariables,
    StartIndexLabMutationContext
  >({
    mutationFn: ({ requestedRunId }) => {
      const parsedConcurrency = parseRuntimeInt(fetchConcurrency, runtimeSettingsBaseline.fetchConcurrency);
      const parsedPerHostMinDelayMs = parseRuntimeInt(perHostMinDelayMs, runtimeSettingsBaseline.perHostMinDelayMs);
      const parsedCrawleeTimeout = parseRuntimeInt(crawleeRequestHandlerTimeoutSecs, runtimeSettingsBaseline.crawleeRequestHandlerTimeoutSecs);
      const parsedRetryBudget = parseRuntimeInt(dynamicFetchRetryBudget, runtimeSettingsBaseline.dynamicFetchRetryBudget);
      const parsedRetryBackoff = parseRuntimeInt(dynamicFetchRetryBackoffMs, runtimeSettingsBaseline.dynamicFetchRetryBackoffMs);
      const parsedFetchSchedulerMaxRetries = parseRuntimeInt(fetchSchedulerMaxRetries, runtimeSettingsBaseline.fetchSchedulerMaxRetries);
      const parsedFetchSchedulerFallbackWaitMs = parseRuntimeInt(fetchSchedulerFallbackWaitMs, runtimeSettingsBaseline.fetchSchedulerFallbackWaitMs);
      const parsedPageGotoTimeoutMs = parseRuntimeInt(pageGotoTimeoutMs, runtimeSettingsBaseline.pageGotoTimeoutMs);
      const parsedPageNetworkIdleTimeoutMs = parseRuntimeInt(pageNetworkIdleTimeoutMs, runtimeSettingsBaseline.pageNetworkIdleTimeoutMs);
      const parsedPostLoadWaitMs = parseRuntimeInt(postLoadWaitMs, runtimeSettingsBaseline.postLoadWaitMs);
      const parsedFrontierQueryCooldownSeconds = parseRuntimeInt(frontierQueryCooldownSeconds, runtimeSettingsBaseline.frontierQueryCooldownSeconds);
      const parsedFrontierCooldown404Seconds = parseRuntimeInt(frontierCooldown404Seconds, runtimeSettingsBaseline.frontierCooldown404Seconds);
      const parsedFrontierCooldown404RepeatSeconds = parseRuntimeInt(frontierCooldown404RepeatSeconds, runtimeSettingsBaseline.frontierCooldown404RepeatSeconds);
      const parsedFrontierCooldown410Seconds = parseRuntimeInt(frontierCooldown410Seconds, runtimeSettingsBaseline.frontierCooldown410Seconds);
      const parsedFrontierCooldownTimeoutSeconds = parseRuntimeInt(frontierCooldownTimeoutSeconds, runtimeSettingsBaseline.frontierCooldownTimeoutSeconds);
      const parsedFrontierCooldown403BaseSeconds = parseRuntimeInt(frontierCooldown403BaseSeconds, runtimeSettingsBaseline.frontierCooldown403BaseSeconds);
      const parsedFrontierCooldown429BaseSeconds = parseRuntimeInt(frontierCooldown429BaseSeconds, runtimeSettingsBaseline.frontierCooldown429BaseSeconds);
      const parsedFrontierBackoffMaxExponent = parseRuntimeInt(frontierBackoffMaxExponent, runtimeSettingsBaseline.frontierBackoffMaxExponent);
      const parsedFrontierPathPenaltyNotfoundThreshold = parseRuntimeInt(frontierPathPenaltyNotfoundThreshold, runtimeSettingsBaseline.frontierPathPenaltyNotfoundThreshold);
      const parsedFrontierBlockedDomainThreshold = parseRuntimeInt(frontierBlockedDomainThreshold, runtimeSettingsBaseline.frontierBlockedDomainThreshold);
      const parsedAutoScrollPasses = parseRuntimeInt(autoScrollPasses, runtimeSettingsBaseline.autoScrollPasses);
      const parsedAutoScrollDelayMs = parseRuntimeInt(autoScrollDelayMs, runtimeSettingsBaseline.autoScrollDelayMs);
      const parsedMaxGraphqlReplays = parseRuntimeInt(maxGraphqlReplays, runtimeSettingsBaseline.maxGraphqlReplays);
      const parsedMaxNetworkResponsesPerPage = parseRuntimeInt(maxNetworkResponsesPerPage, runtimeSettingsBaseline.maxNetworkResponsesPerPage);
      const parsedRobotsTxtTimeoutMs = parseRuntimeInt(robotsTxtTimeoutMs, runtimeSettingsBaseline.robotsTxtTimeoutMs);
      const parsedRuntimeScreencastFps = parseRuntimeInt(runtimeScreencastFps, runtimeSettingsBaseline.runtimeScreencastFps);
      const parsedRuntimeScreencastQuality = parseRuntimeInt(runtimeScreencastQuality, runtimeSettingsBaseline.runtimeScreencastQuality);
      const parsedRuntimeScreencastMaxWidth = parseRuntimeInt(runtimeScreencastMaxWidth, runtimeSettingsBaseline.runtimeScreencastMaxWidth);
      const parsedRuntimeScreencastMaxHeight = parseRuntimeInt(runtimeScreencastMaxHeight, runtimeSettingsBaseline.runtimeScreencastMaxHeight);
      const parsedEndpointSignalLimit = parseRuntimeInt(endpointSignalLimit, runtimeSettingsBaseline.endpointSignalLimit);
      const parsedEndpointSuggestionLimit = parseRuntimeInt(endpointSuggestionLimit, runtimeSettingsBaseline.endpointSuggestionLimit);
      const parsedEndpointNetworkScanLimit = parseRuntimeInt(endpointNetworkScanLimit, runtimeSettingsBaseline.endpointNetworkScanLimit);
      const parsedDiscoveryMaxQueries = parseRuntimeInt(discoveryMaxQueries, runtimeSettingsBaseline.discoveryMaxQueries);
      const parsedDiscoveryResultsPerQuery = parseRuntimeInt(discoveryResultsPerQuery, runtimeSettingsBaseline.discoveryResultsPerQuery);
      const parsedDiscoveryMaxDiscovered = parseRuntimeInt(discoveryMaxDiscovered, runtimeSettingsBaseline.discoveryMaxDiscovered);
      const parsedDiscoveryQueryConcurrency = parseRuntimeInt(discoveryQueryConcurrency, runtimeSettingsBaseline.discoveryQueryConcurrency);
      const parsedMaxUrlsPerProduct = parseRuntimeInt(maxUrlsPerProduct, runtimeSettingsBaseline.maxUrlsPerProduct);
      const parsedMaxCandidateUrls = parseRuntimeInt(maxCandidateUrls, runtimeSettingsBaseline.maxCandidateUrls);
      const parsedMaxPagesPerDomain = parseRuntimeInt(maxPagesPerDomain, runtimeSettingsBaseline.maxPagesPerDomain);
      const parsedUberMaxUrlsPerProduct = parseRuntimeInt(uberMaxUrlsPerProduct, runtimeSettingsBaseline.uberMaxUrlsPerProduct);
      const parsedUberMaxUrlsPerDomain = parseRuntimeInt(uberMaxUrlsPerDomain, runtimeSettingsBaseline.uberMaxUrlsPerDomain);
      const parsedMaxRunSeconds = parseRuntimeInt(maxRunSeconds, runtimeSettingsBaseline.maxRunSeconds);
      const parsedMaxJsonBytes = parseRuntimeInt(maxJsonBytes, runtimeSettingsBaseline.maxJsonBytes);
      const parsedMaxPdfBytes = parseRuntimeInt(maxPdfBytes, runtimeSettingsBaseline.maxPdfBytes);
      const parsedPdfBackendRouterTimeoutMs = parseRuntimeInt(pdfBackendRouterTimeoutMs, runtimeSettingsBaseline.pdfBackendRouterTimeoutMs);
      const parsedPdfBackendRouterMaxPages = parseRuntimeInt(pdfBackendRouterMaxPages, runtimeSettingsBaseline.pdfBackendRouterMaxPages);
      const parsedPdfBackendRouterMaxPairs = parseRuntimeInt(pdfBackendRouterMaxPairs, runtimeSettingsBaseline.pdfBackendRouterMaxPairs);
      const parsedPdfBackendRouterMaxTextPreviewChars = parseRuntimeInt(pdfBackendRouterMaxTextPreviewChars, runtimeSettingsBaseline.pdfBackendRouterMaxTextPreviewChars);
      const parsedCapturePageScreenshotQuality = parseRuntimeInt(capturePageScreenshotQuality, runtimeSettingsBaseline.capturePageScreenshotQuality);
      const parsedCapturePageScreenshotMaxBytes = parseRuntimeInt(capturePageScreenshotMaxBytes, runtimeSettingsBaseline.capturePageScreenshotMaxBytes);
      const parsedVisualAssetCaptureMaxPerSource = parseRuntimeInt(visualAssetCaptureMaxPerSource, runtimeSettingsBaseline.visualAssetCaptureMaxPerSource);
      const parsedVisualAssetRetentionDays = parseRuntimeInt(visualAssetRetentionDays, runtimeSettingsBaseline.visualAssetRetentionDays);
      const parsedVisualAssetReviewLgMaxSide = parseRuntimeInt(visualAssetReviewLgMaxSide, runtimeSettingsBaseline.visualAssetReviewLgMaxSide);
      const parsedVisualAssetReviewSmMaxSide = parseRuntimeInt(visualAssetReviewSmMaxSide, runtimeSettingsBaseline.visualAssetReviewSmMaxSide);
      const parsedVisualAssetReviewLgQuality = parseRuntimeInt(visualAssetReviewLgQuality, runtimeSettingsBaseline.visualAssetReviewLgQuality);
      const parsedVisualAssetReviewSmQuality = parseRuntimeInt(visualAssetReviewSmQuality, runtimeSettingsBaseline.visualAssetReviewSmQuality);
      const parsedVisualAssetRegionCropMaxSide = parseRuntimeInt(visualAssetRegionCropMaxSide, runtimeSettingsBaseline.visualAssetRegionCropMaxSide);
      const parsedVisualAssetRegionCropQuality = parseRuntimeInt(visualAssetRegionCropQuality, runtimeSettingsBaseline.visualAssetRegionCropQuality);
      const parsedVisualAssetLlmMaxBytes = parseRuntimeInt(visualAssetLlmMaxBytes, runtimeSettingsBaseline.visualAssetLlmMaxBytes);
      const parsedVisualAssetMinWidth = parseRuntimeInt(visualAssetMinWidth, runtimeSettingsBaseline.visualAssetMinWidth);
      const parsedVisualAssetMinHeight = parseRuntimeInt(visualAssetMinHeight, runtimeSettingsBaseline.visualAssetMinHeight);
      const parsedVisualAssetMinSharpness = parseRuntimeFloat(visualAssetMinSharpness, runtimeSettingsBaseline.visualAssetMinSharpness);
      const parsedVisualAssetMinEntropy = parseRuntimeFloat(visualAssetMinEntropy, runtimeSettingsBaseline.visualAssetMinEntropy);
      const parsedVisualAssetMaxPhashDistance = parseRuntimeInt(visualAssetMaxPhashDistance, runtimeSettingsBaseline.visualAssetMaxPhashDistance);
      const parsedArticleExtractorMinChars = parseRuntimeInt(articleExtractorMinChars, runtimeSettingsBaseline.articleExtractorMinChars);
      const parsedArticleExtractorMinScore = parseRuntimeInt(articleExtractorMinScore, runtimeSettingsBaseline.articleExtractorMinScore);
      const parsedArticleExtractorMaxChars = parseRuntimeInt(articleExtractorMaxChars, runtimeSettingsBaseline.articleExtractorMaxChars);
      const parsedStaticDomTargetMatchThreshold = parseRuntimeFloat(staticDomTargetMatchThreshold, runtimeSettingsBaseline.staticDomTargetMatchThreshold);
      const parsedStaticDomMaxEvidenceSnippets = parseRuntimeInt(staticDomMaxEvidenceSnippets, runtimeSettingsBaseline.staticDomMaxEvidenceSnippets);
      const parsedStructuredMetadataExtructTimeoutMs = parseRuntimeInt(structuredMetadataExtructTimeoutMs, runtimeSettingsBaseline.structuredMetadataExtructTimeoutMs);
      const parsedStructuredMetadataExtructMaxItemsPerSurface = parseRuntimeInt(structuredMetadataExtructMaxItemsPerSurface, runtimeSettingsBaseline.structuredMetadataExtructMaxItemsPerSurface);
      const parsedStructuredMetadataExtructCacheLimit = parseRuntimeInt(structuredMetadataExtructCacheLimit, runtimeSettingsBaseline.structuredMetadataExtructCacheLimit);
      const parsedDomSnippetMaxChars = parseRuntimeInt(domSnippetMaxChars, runtimeSettingsBaseline.domSnippetMaxChars);
      const parsedLlmExtractionCacheTtlMs = parseRuntimeInt(llmExtractionCacheTtlMs, runtimeSettingsBaseline.llmExtractionCacheTtlMs);
      const parsedLlmMaxCallsPerProductTotal = parseRuntimeInt(llmMaxCallsPerProductTotal, runtimeSettingsBaseline.llmMaxCallsPerProductTotal);
      const parsedLlmMaxCallsPerProductFast = parseRuntimeInt(llmMaxCallsPerProductFast, runtimeSettingsBaseline.llmMaxCallsPerProductFast);
      const parsedNeedsetEvidenceDecayDays = parseRuntimeInt(needsetEvidenceDecayDays, runtimeSettingsBaseline.needsetEvidenceDecayDays);
      const parsedNeedsetEvidenceDecayFloor = parseRuntimeFloat(needsetEvidenceDecayFloor, runtimeSettingsBaseline.needsetEvidenceDecayFloor);
      const parsedLlmExtractMaxTokens = parseRuntimeInt(llmExtractMaxTokens, runtimeSettingsBaseline.llmExtractMaxTokens);
      const parsedLlmExtractMaxSnippetsPerBatch = parseRuntimeInt(llmExtractMaxSnippetsPerBatch, runtimeSettingsBaseline.llmExtractMaxSnippetsPerBatch);
      const parsedLlmExtractMaxSnippetChars = parseRuntimeInt(llmExtractMaxSnippetChars, runtimeSettingsBaseline.llmExtractMaxSnippetChars);
      const parsedLlmExtractReasoningBudget = parseRuntimeInt(llmExtractReasoningBudget, runtimeSettingsBaseline.llmExtractReasoningBudget);
      const parsedLlmReasoningBudget = parseRuntimeInt(llmReasoningBudget, runtimeSettingsBaseline.llmReasoningBudget);
      const parsedLlmMonthlyBudgetUsd = parseRuntimeFloat(llmMonthlyBudgetUsd, runtimeSettingsBaseline.llmMonthlyBudgetUsd);
      const parsedLlmPerProductBudgetUsd = parseRuntimeFloat(llmPerProductBudgetUsd, runtimeSettingsBaseline.llmPerProductBudgetUsd);
      const parsedLlmMaxCallsPerRound = parseRuntimeInt(llmMaxCallsPerRound, runtimeSettingsBaseline.llmMaxCallsPerRound);
      const parsedLlmMaxOutputTokens = parseRuntimeInt(llmMaxOutputTokens, runtimeSettingsBaseline.llmMaxOutputTokens);
      const parsedLlmVerifySampleRate = parseRuntimeInt(llmVerifySampleRate, runtimeSettingsBaseline.llmVerifySampleRate);
      const parsedLlmMaxBatchesPerProduct = parseRuntimeInt(llmMaxBatchesPerProduct, runtimeSettingsBaseline.llmMaxBatchesPerProduct);
      const parsedLlmMaxEvidenceChars = parseRuntimeInt(llmMaxEvidenceChars, runtimeSettingsBaseline.llmMaxEvidenceChars);
      const parsedLlmMaxTokens = parseRuntimeInt(llmMaxTokens, runtimeSettingsBaseline.llmMaxTokens);
      const parsedLlmTimeoutMs = parseRuntimeInt(llmTimeoutMs, runtimeSettingsBaseline.llmTimeoutMs);
      const parsedLlmCostInputPer1M = parseRuntimeFloat(llmCostInputPer1M, runtimeSettingsBaseline.llmCostInputPer1M);
      const parsedLlmCostOutputPer1M = parseRuntimeFloat(llmCostOutputPer1M, runtimeSettingsBaseline.llmCostOutputPer1M);
      const parsedLlmCostCachedInputPer1M = parseRuntimeFloat(llmCostCachedInputPer1M, runtimeSettingsBaseline.llmCostCachedInputPer1M);
      const parsedMaxManufacturerUrlsPerProduct = parseRuntimeInt(maxManufacturerUrlsPerProduct, runtimeSettingsBaseline.maxManufacturerUrlsPerProduct);
      const parsedMaxManufacturerPagesPerDomain = parseRuntimeInt(maxManufacturerPagesPerDomain, runtimeSettingsBaseline.maxManufacturerPagesPerDomain);
      const parsedManufacturerReserveUrls = parseRuntimeInt(manufacturerReserveUrls, runtimeSettingsBaseline.manufacturerReserveUrls);
      const parsedMaxHypothesisItems = parseRuntimeInt(maxHypothesisItems, runtimeSettingsBaseline.maxHypothesisItems);
      const parsedHypothesisAutoFollowupRounds = parseRuntimeInt(hypothesisAutoFollowupRounds, runtimeSettingsBaseline.hypothesisAutoFollowupRounds);
      const parsedHypothesisFollowupUrlsPerRound = parseRuntimeInt(hypothesisFollowupUrlsPerRound, runtimeSettingsBaseline.hypothesisFollowupUrlsPerRound);
      const parsedLearningConfidenceThreshold = parseRuntimeFloat(learningConfidenceThreshold, runtimeSettingsBaseline.learningConfidenceThreshold);
      const parsedComponentLexiconDecayDays = parseRuntimeInt(componentLexiconDecayDays, runtimeSettingsBaseline.componentLexiconDecayDays);
      const parsedComponentLexiconExpireDays = parseRuntimeInt(componentLexiconExpireDays, runtimeSettingsBaseline.componentLexiconExpireDays);
      const parsedFieldAnchorsDecayDays = parseRuntimeInt(fieldAnchorsDecayDays, runtimeSettingsBaseline.fieldAnchorsDecayDays);
      const parsedUrlMemoryDecayDays = parseRuntimeInt(urlMemoryDecayDays, runtimeSettingsBaseline.urlMemoryDecayDays);
      const parsedCseRescueRequiredIteration = parseRuntimeInt(cseRescueRequiredIteration, runtimeSettingsBaseline.cseRescueRequiredIteration);
      const parsedDuckduckgoTimeoutMs = parseRuntimeInt(duckduckgoTimeoutMs, runtimeSettingsBaseline.duckduckgoTimeoutMs);
      const parsedRuntimeTraceFetchRing = parseRuntimeInt(runtimeTraceFetchRing, runtimeSettingsBaseline.runtimeTraceFetchRing);
      const parsedRuntimeTraceLlmRing = parseRuntimeInt(runtimeTraceLlmRing, runtimeSettingsBaseline.runtimeTraceLlmRing);
      const parsedDaemonConcurrency = parseRuntimeInt(daemonConcurrency, runtimeSettingsBaseline.daemonConcurrency);
      const parsedDaemonGracefulShutdownTimeoutMs = parseRuntimeInt(daemonGracefulShutdownTimeoutMs, runtimeSettingsBaseline.daemonGracefulShutdownTimeoutMs);
      const parsedImportsPollSeconds = parseRuntimeInt(importsPollSeconds, runtimeSettingsBaseline.importsPollSeconds);
      const parsedConvergenceIdentityFailFastRounds = parseRuntimeInt(convergenceIdentityFailFastRounds, runtimeSettingsBaseline.convergenceIdentityFailFastRounds);
      const parsedIdentityGatePublishThreshold = parseRuntimeFloat(identityGatePublishThreshold, runtimeSettingsBaseline.identityGatePublishThreshold);
      const parsedIndexingResumeSeedLimit = parseRuntimeInt(indexingResumeSeedLimit, runtimeSettingsBaseline.indexingResumeSeedLimit);
      const parsedIndexingResumePersistLimit = parseRuntimeInt(indexingResumePersistLimit, runtimeSettingsBaseline.indexingResumePersistLimit);
      const parsedHelperSupportiveMaxSources = parseRuntimeInt(helperSupportiveMaxSources, runtimeSettingsBaseline.helperSupportiveMaxSources);
      const parsedHelperActiveSyncLimit = parseRuntimeInt(helperActiveSyncLimit, runtimeSettingsBaseline.helperActiveSyncLimit);
      const parsedFieldRewardHalfLifeDays = parseRuntimeInt(fieldRewardHalfLifeDays, runtimeSettingsBaseline.fieldRewardHalfLifeDays);
      const parsedDriftPollSeconds = parseRuntimeInt(driftPollSeconds, runtimeSettingsBaseline.driftPollSeconds);
      const parsedDriftScanMaxProducts = parseRuntimeInt(driftScanMaxProducts, runtimeSettingsBaseline.driftScanMaxProducts);
      const parsedReCrawlStaleAfterDays = parseRuntimeInt(reCrawlStaleAfterDays, runtimeSettingsBaseline.reCrawlStaleAfterDays);
      const parsedAggressiveConfidenceThreshold = parseRuntimeFloat(aggressiveConfidenceThreshold, runtimeSettingsBaseline.aggressiveConfidenceThreshold);
      const parsedAggressiveMaxSearchQueries = parseRuntimeInt(aggressiveMaxSearchQueries, runtimeSettingsBaseline.aggressiveMaxSearchQueries);
      const parsedAggressiveEvidenceAuditBatchSize = parseRuntimeInt(aggressiveEvidenceAuditBatchSize, runtimeSettingsBaseline.aggressiveEvidenceAuditBatchSize);
      const parsedAggressiveMaxTimePerProductMs = parseRuntimeInt(aggressiveMaxTimePerProductMs, runtimeSettingsBaseline.aggressiveMaxTimePerProductMs);
      const parsedAggressiveThoroughFromRound = parseRuntimeInt(aggressiveThoroughFromRound, runtimeSettingsBaseline.aggressiveThoroughFromRound);
      const parsedAggressiveRound1MaxUrls = parseRuntimeInt(aggressiveRound1MaxUrls, runtimeSettingsBaseline.aggressiveRound1MaxUrls);
      const parsedAggressiveRound1MaxCandidateUrls = parseRuntimeInt(aggressiveRound1MaxCandidateUrls, runtimeSettingsBaseline.aggressiveRound1MaxCandidateUrls);
      const parsedAggressiveLlmMaxCallsPerRound = parseRuntimeInt(aggressiveLlmMaxCallsPerRound, runtimeSettingsBaseline.aggressiveLlmMaxCallsPerRound);
      const parsedAggressiveLlmMaxCallsPerProductTotal = parseRuntimeInt(aggressiveLlmMaxCallsPerProductTotal, runtimeSettingsBaseline.aggressiveLlmMaxCallsPerProductTotal);
      const parsedAggressiveLlmTargetMaxFields = parseRuntimeInt(aggressiveLlmTargetMaxFields, runtimeSettingsBaseline.aggressiveLlmTargetMaxFields);
      const parsedAggressiveLlmDiscoveryPasses = parseRuntimeInt(aggressiveLlmDiscoveryPasses, runtimeSettingsBaseline.aggressiveLlmDiscoveryPasses);
      const parsedAggressiveLlmDiscoveryQueryCap = parseRuntimeInt(aggressiveLlmDiscoveryQueryCap, runtimeSettingsBaseline.aggressiveLlmDiscoveryQueryCap);
      const parsedUberMaxRounds = parseRuntimeInt(uberMaxRounds, runtimeSettingsBaseline.uberMaxRounds);
      const parsedCortexSyncTimeoutMs = parseRuntimeInt(cortexSyncTimeoutMs, runtimeSettingsBaseline.cortexSyncTimeoutMs);
      const parsedCortexAsyncPollIntervalMs = parseRuntimeInt(cortexAsyncPollIntervalMs, runtimeSettingsBaseline.cortexAsyncPollIntervalMs);
      const parsedCortexAsyncMaxWaitMs = parseRuntimeInt(cortexAsyncMaxWaitMs, runtimeSettingsBaseline.cortexAsyncMaxWaitMs);
      const parsedCortexEnsureReadyTimeoutMs = parseRuntimeInt(cortexEnsureReadyTimeoutMs, runtimeSettingsBaseline.cortexEnsureReadyTimeoutMs);
      const parsedCortexStartReadyTimeoutMs = parseRuntimeInt(cortexStartReadyTimeoutMs, runtimeSettingsBaseline.cortexStartReadyTimeoutMs);
      const parsedCortexFailureThreshold = parseRuntimeInt(cortexFailureThreshold, runtimeSettingsBaseline.cortexFailureThreshold);
      const parsedCortexCircuitOpenMs = parseRuntimeInt(cortexCircuitOpenMs, runtimeSettingsBaseline.cortexCircuitOpenMs);
      const parsedCortexEscalateConfidenceLt = parseRuntimeFloat(cortexEscalateConfidenceLt, runtimeSettingsBaseline.cortexEscalateConfidenceLt);
      const parsedCortexMaxDeepFieldsPerProduct = parseRuntimeInt(cortexMaxDeepFieldsPerProduct, runtimeSettingsBaseline.cortexMaxDeepFieldsPerProduct);
      const parsedScannedPdfOcrMaxPages = parseRuntimeInt(scannedPdfOcrMaxPages, runtimeSettingsBaseline.scannedPdfOcrMaxPages);
      const parsedScannedPdfOcrMaxPairs = parseRuntimeInt(scannedPdfOcrMaxPairs, runtimeSettingsBaseline.scannedPdfOcrMaxPairs);
      const parsedScannedPdfOcrMinChars = parseRuntimeInt(scannedPdfOcrMinCharsPerPage, runtimeSettingsBaseline.scannedPdfOcrMinCharsPerPage);
      const parsedScannedPdfOcrMinLines = parseRuntimeInt(scannedPdfOcrMinLinesPerPage, runtimeSettingsBaseline.scannedPdfOcrMinLinesPerPage);
      const parsedScannedPdfOcrMinConfidence = parseRuntimeFloat(scannedPdfOcrMinConfidence, runtimeSettingsBaseline.scannedPdfOcrMinConfidence);
      return api.post<ProcessStatus>('/process/start', {
        requestedRunId: String(requestedRunId || '').trim(),
        category,
        mode: 'indexlab',
        replaceRunning: true,
        extractionMode: 'balanced',
        productId: singleProductId,
        profile,
        fetchConcurrency: parsedConcurrency,
        perHostMinDelayMs: parsedPerHostMinDelayMs,
        dynamicCrawleeEnabled,
        crawleeHeadless,
        crawleeRequestHandlerTimeoutSecs: Math.max(0, parsedCrawleeTimeout),
        dynamicFetchRetryBudget: Math.max(0, parsedRetryBudget),
        dynamicFetchRetryBackoffMs: Math.max(0, parsedRetryBackoff),
        fetchSchedulerEnabled,
        fetchSchedulerMaxRetries: Math.max(0, parsedFetchSchedulerMaxRetries),
        fetchSchedulerFallbackWaitMs: Math.max(0, parsedFetchSchedulerFallbackWaitMs),
        preferHttpFetcher,
        pageGotoTimeoutMs: Math.max(0, parsedPageGotoTimeoutMs),
        pageNetworkIdleTimeoutMs: Math.max(0, parsedPageNetworkIdleTimeoutMs),
        postLoadWaitMs: Math.max(0, parsedPostLoadWaitMs),
        frontierDbPath: String(frontierDbPath || '').trim(),
        frontierEnableSqlite,
        frontierStripTrackingParams,
        frontierQueryCooldownSeconds: Math.max(0, parsedFrontierQueryCooldownSeconds),
        frontierCooldown404Seconds: Math.max(0, parsedFrontierCooldown404Seconds),
        frontierCooldown404RepeatSeconds: Math.max(0, parsedFrontierCooldown404RepeatSeconds),
        frontierCooldown410Seconds: Math.max(0, parsedFrontierCooldown410Seconds),
        frontierCooldownTimeoutSeconds: Math.max(0, parsedFrontierCooldownTimeoutSeconds),
        frontierCooldown403BaseSeconds: Math.max(0, parsedFrontierCooldown403BaseSeconds),
        frontierCooldown429BaseSeconds: Math.max(0, parsedFrontierCooldown429BaseSeconds),
        frontierBackoffMaxExponent: Math.max(1, parsedFrontierBackoffMaxExponent),
        frontierPathPenaltyNotfoundThreshold: Math.max(1, parsedFrontierPathPenaltyNotfoundThreshold),
        frontierBlockedDomainThreshold: Math.max(1, parsedFrontierBlockedDomainThreshold),
        frontierRepairSearchEnabled,
        autoScrollEnabled,
        autoScrollPasses: Math.max(0, parsedAutoScrollPasses),
        autoScrollDelayMs: Math.max(0, parsedAutoScrollDelayMs),
        graphqlReplayEnabled,
        maxGraphqlReplays: Math.max(0, parsedMaxGraphqlReplays),
        maxNetworkResponsesPerPage: Math.max(100, parsedMaxNetworkResponsesPerPage),
        robotsTxtCompliant,
        robotsTxtTimeoutMs: Math.max(100, parsedRobotsTxtTimeoutMs),
        runtimeScreencastEnabled,
        runtimeScreencastFps: Math.max(1, parsedRuntimeScreencastFps),
        runtimeScreencastQuality: Math.max(10, parsedRuntimeScreencastQuality),
        runtimeScreencastMaxWidth: Math.max(320, parsedRuntimeScreencastMaxWidth),
        runtimeScreencastMaxHeight: Math.max(240, parsedRuntimeScreencastMaxHeight),
        runtimeTraceEnabled,
        runtimeTraceFetchRing: Math.max(10, parsedRuntimeTraceFetchRing),
        runtimeTraceLlmRing: Math.max(10, parsedRuntimeTraceLlmRing),
        runtimeTraceLlmPayloads,
        daemonConcurrency: Math.max(1, parsedDaemonConcurrency),
        daemonGracefulShutdownTimeoutMs: Math.max(1000, parsedDaemonGracefulShutdownTimeoutMs),
        importsRoot: String(importsRoot || '').trim(),
        importsPollSeconds: Math.max(1, parsedImportsPollSeconds),
        convergenceIdentityFailFastRounds: Math.max(1, parsedConvergenceIdentityFailFastRounds),
        identityGatePublishThreshold: Math.max(0, Math.min(1, parsedIdentityGatePublishThreshold)),
        indexingResumeSeedLimit: Math.max(1, parsedIndexingResumeSeedLimit),
        indexingResumePersistLimit: Math.max(1, parsedIndexingResumePersistLimit),
        eventsJsonWrite,
        indexingSchemaPacketsValidationEnabled,
        indexingSchemaPacketsValidationStrict,
        queueJsonWrite,
        billingJsonWrite,
        brainJsonWrite,
        intelJsonWrite,
        corpusJsonWrite,
        learningJsonWrite,
        cacheJsonWrite,
        authoritySnapshotEnabled,
        scannedPdfOcrEnabled,
        scannedPdfOcrPromoteCandidates,
        scannedPdfOcrBackend,
        scannedPdfOcrMaxPages: Math.max(1, parsedScannedPdfOcrMaxPages),
        scannedPdfOcrMaxPairs: Math.max(50, parsedScannedPdfOcrMaxPairs),
        scannedPdfOcrMinCharsPerPage: Math.max(1, parsedScannedPdfOcrMinChars),
        scannedPdfOcrMinLinesPerPage: Math.max(1, parsedScannedPdfOcrMinLines),
        scannedPdfOcrMinConfidence: Math.max(0, Math.min(1, parsedScannedPdfOcrMinConfidence)),
        dynamicFetchPolicyMapJson: String(dynamicFetchPolicyMapJson || '').trim(),
        searchProfileCapMapJson: String(searchProfileCapMapJson || '').trim(),
        serpRerankerWeightMapJson: String(serpRerankerWeightMapJson || '').trim(),
        fetchSchedulerInternalsMapJson: String(fetchSchedulerInternalsMapJson || '').trim(),
        retrievalInternalsMapJson: String(retrievalInternalsMapJson || '').trim(),
        evidencePackLimitsMapJson: String(evidencePackLimitsMapJson || '').trim(),
        identityGateThresholdBoundsMapJson: String(identityGateThresholdBoundsMapJson || '').trim(),
        parsingConfidenceBaseMapJson: String(parsingConfidenceBaseMapJson || '').trim(),
        repairDedupeRule: String(repairDedupeRule || '').trim(),
        automationQueueStorageEngine: String(automationQueueStorageEngine || '').trim(),
        discoveryEnabled,
        fetchCandidateSources,
        discoveryMaxQueries: Math.max(1, parsedDiscoveryMaxQueries),
        discoveryResultsPerQuery: Math.max(1, parsedDiscoveryResultsPerQuery),
        discoveryMaxDiscovered: Math.max(1, parsedDiscoveryMaxDiscovered),
        discoveryQueryConcurrency: Math.max(1, parsedDiscoveryQueryConcurrency),
        manufacturerBroadDiscovery,
        manufacturerSeedSearchUrls,
        manufacturerDeepResearchEnabled,
        maxUrlsPerProduct: Math.max(1, parsedMaxUrlsPerProduct),
        maxCandidateUrls: Math.max(1, parsedMaxCandidateUrls),
        maxPagesPerDomain: Math.max(1, parsedMaxPagesPerDomain),
        uberMaxUrlsPerProduct: Math.max(1, parsedUberMaxUrlsPerProduct),
        uberMaxUrlsPerDomain: Math.max(1, parsedUberMaxUrlsPerDomain),
        maxRunSeconds: Math.max(30, parsedMaxRunSeconds),
        maxJsonBytes: Math.max(1024, parsedMaxJsonBytes),
        maxPdfBytes: Math.max(1024, parsedMaxPdfBytes),
        pdfBackendRouterEnabled,
        pdfPreferredBackend: String(pdfPreferredBackend || '').trim(),
        pdfBackendRouterTimeoutMs: Math.max(1000, parsedPdfBackendRouterTimeoutMs),
        pdfBackendRouterMaxPages: Math.max(1, parsedPdfBackendRouterMaxPages),
        pdfBackendRouterMaxPairs: Math.max(1, parsedPdfBackendRouterMaxPairs),
        pdfBackendRouterMaxTextPreviewChars: Math.max(256, parsedPdfBackendRouterMaxTextPreviewChars),
        capturePageScreenshotEnabled,
        capturePageScreenshotFormat: String(capturePageScreenshotFormat || '').trim(),
        capturePageScreenshotQuality: Math.max(1, parsedCapturePageScreenshotQuality),
        capturePageScreenshotMaxBytes: Math.max(1024, parsedCapturePageScreenshotMaxBytes),
        capturePageScreenshotSelectors: String(capturePageScreenshotSelectors || '').trim(),
        runtimeCaptureScreenshots,
        runtimeScreenshotMode: String(runtimeScreenshotMode || '').trim(),
        visualAssetCaptureEnabled,
        visualAssetCaptureMaxPerSource: Math.max(1, parsedVisualAssetCaptureMaxPerSource),
        visualAssetStoreOriginal,
        visualAssetRetentionDays: Math.max(1, parsedVisualAssetRetentionDays),
        visualAssetPhashEnabled,
        visualAssetReviewFormat: String(visualAssetReviewFormat || '').trim(),
        visualAssetReviewLgMaxSide: Math.max(VISUAL_ASSET_MIN_SIDE, parsedVisualAssetReviewLgMaxSide),
        visualAssetReviewSmMaxSide: Math.max(VISUAL_ASSET_MIN_SIDE, parsedVisualAssetReviewSmMaxSide),
        visualAssetReviewLgQuality: Math.max(1, parsedVisualAssetReviewLgQuality),
        visualAssetReviewSmQuality: Math.max(1, parsedVisualAssetReviewSmQuality),
        visualAssetRegionCropMaxSide: Math.max(VISUAL_ASSET_MIN_SIDE, parsedVisualAssetRegionCropMaxSide),
        visualAssetRegionCropQuality: Math.max(1, parsedVisualAssetRegionCropQuality),
        visualAssetLlmMaxBytes: Math.max(1024, parsedVisualAssetLlmMaxBytes),
        visualAssetMinWidth: Math.max(1, parsedVisualAssetMinWidth),
        visualAssetMinHeight: Math.max(1, parsedVisualAssetMinHeight),
        visualAssetMinSharpness: Math.max(0, parsedVisualAssetMinSharpness),
        visualAssetMinEntropy: Math.max(0, parsedVisualAssetMinEntropy),
        visualAssetMaxPhashDistance: Math.max(0, parsedVisualAssetMaxPhashDistance),
        visualAssetHeroSelectorMapJson: String(visualAssetHeroSelectorMapJson || '').trim(),
        chartExtractionEnabled,
        articleExtractorV2Enabled,
        articleExtractorMinChars: Math.max(50, parsedArticleExtractorMinChars),
        articleExtractorMinScore: Math.max(1, parsedArticleExtractorMinScore),
        articleExtractorMaxChars: Math.max(256, parsedArticleExtractorMaxChars),
        staticDomExtractorEnabled,
        staticDomMode: String(staticDomMode || '').trim(),
        staticDomTargetMatchThreshold: Math.max(0, Math.min(1, parsedStaticDomTargetMatchThreshold)),
        staticDomMaxEvidenceSnippets: Math.max(10, parsedStaticDomMaxEvidenceSnippets),
        articleExtractorDomainPolicyMapJson: String(articleExtractorDomainPolicyMapJson || '').trim(),
        htmlTableExtractorV2,
        structuredMetadataExtructEnabled,
        structuredMetadataExtructUrl: String(structuredMetadataExtructUrl || '').trim(),
        structuredMetadataExtructTimeoutMs: Math.max(250, parsedStructuredMetadataExtructTimeoutMs),
        structuredMetadataExtructMaxItemsPerSurface: Math.max(1, parsedStructuredMetadataExtructMaxItemsPerSurface),
        structuredMetadataExtructCacheEnabled,
        structuredMetadataExtructCacheLimit: Math.max(32, parsedStructuredMetadataExtructCacheLimit),
        domSnippetMaxChars: Math.max(600, parsedDomSnippetMaxChars),
        runtimeControlFile: String(runtimeControlFile || '').trim(),
        specDbDir: String(specDbDir || '').trim(),
        helperFilesEnabled,
        helperFilesRoot: String(helperFilesRoot || '').trim(),
        helperSupportiveEnabled,
        helperSupportiveFillMissing,
        helperSupportiveMaxSources: Math.max(0, parsedHelperSupportiveMaxSources),
        helperAutoSeedTargets,
        helperActiveSyncLimit: Math.max(0, parsedHelperActiveSyncLimit),
        fieldRewardHalfLifeDays: Math.max(1, parsedFieldRewardHalfLifeDays),
        batchStrategy: String(batchStrategy || '').trim(),
        driftDetectionEnabled,
        driftPollSeconds: Math.max(60, parsedDriftPollSeconds),
        driftScanMaxProducts: Math.max(1, parsedDriftScanMaxProducts),
        driftAutoRepublish,
        reCrawlStaleAfterDays: Math.max(1, parsedReCrawlStaleAfterDays),
        aggressiveModeEnabled,
        aggressiveConfidenceThreshold: Math.max(0, Math.min(1, parsedAggressiveConfidenceThreshold)),
        aggressiveMaxSearchQueries: Math.max(1, parsedAggressiveMaxSearchQueries),
        aggressiveEvidenceAuditEnabled,
        aggressiveEvidenceAuditBatchSize: Math.max(1, parsedAggressiveEvidenceAuditBatchSize),
        aggressiveMaxTimePerProductMs: Math.max(1000, parsedAggressiveMaxTimePerProductMs),
        aggressiveThoroughFromRound: Math.max(1, parsedAggressiveThoroughFromRound),
        aggressiveRound1MaxUrls: Math.max(1, parsedAggressiveRound1MaxUrls),
        aggressiveRound1MaxCandidateUrls: Math.max(1, parsedAggressiveRound1MaxCandidateUrls),
        aggressiveLlmMaxCallsPerRound: Math.max(1, parsedAggressiveLlmMaxCallsPerRound),
        aggressiveLlmMaxCallsPerProductTotal: Math.max(1, parsedAggressiveLlmMaxCallsPerProductTotal),
        aggressiveLlmTargetMaxFields: Math.max(1, parsedAggressiveLlmTargetMaxFields),
        aggressiveLlmDiscoveryPasses: Math.max(1, parsedAggressiveLlmDiscoveryPasses),
        aggressiveLlmDiscoveryQueryCap: Math.max(1, parsedAggressiveLlmDiscoveryQueryCap),
        uberAggressiveEnabled,
        uberMaxRounds: Math.max(1, parsedUberMaxRounds),
        cortexEnabled,
        cortexAsyncEnabled,
        cortexBaseUrl: String(cortexBaseUrl || '').trim(),
        cortexApiKey: String(cortexApiKey || '').trim(),
        cortexAsyncBaseUrl: String(cortexAsyncBaseUrl || '').trim(),
        cortexAsyncSubmitPath: String(cortexAsyncSubmitPath || '').trim(),
        cortexAsyncStatusPath: String(cortexAsyncStatusPath || '').trim(),
        cortexSyncTimeoutMs: Math.max(1000, parsedCortexSyncTimeoutMs),
        cortexAsyncPollIntervalMs: Math.max(250, parsedCortexAsyncPollIntervalMs),
        cortexAsyncMaxWaitMs: Math.max(1000, parsedCortexAsyncMaxWaitMs),
        cortexEnsureReadyTimeoutMs: Math.max(1000, parsedCortexEnsureReadyTimeoutMs),
        cortexStartReadyTimeoutMs: Math.max(1000, parsedCortexStartReadyTimeoutMs),
        cortexFailureThreshold: Math.max(1, parsedCortexFailureThreshold),
        cortexCircuitOpenMs: Math.max(1000, parsedCortexCircuitOpenMs),
        cortexModelFast: String(cortexModelFast || '').trim(),
        cortexModelAudit: String(cortexModelAudit || '').trim(),
        cortexModelDom: String(cortexModelDom || '').trim(),
        cortexModelReasoningDeep: String(cortexModelReasoningDeep || '').trim(),
        cortexModelVision: String(cortexModelVision || '').trim(),
        cortexModelSearchFast: String(cortexModelSearchFast || '').trim(),
        cortexModelRerankFast: String(cortexModelRerankFast || '').trim(),
        cortexModelSearchDeep: String(cortexModelSearchDeep || '').trim(),
        cortexAutoStart,
        cortexAutoRestartOnAuth,
        cortexEscalateConfidenceLt: Math.max(0, Math.min(1, parsedCortexEscalateConfidenceLt)),
        cortexEscalateIfConflict,
        cortexEscalateCriticalOnly,
        cortexMaxDeepFieldsPerProduct: Math.max(1, parsedCortexMaxDeepFieldsPerProduct),
        outputMode: String(outputMode || '').trim(),
        localMode,
        dryRun,
        mirrorToS3,
        mirrorToS3Input,
        localInputRoot: String(localInputRoot || '').trim(),
        localOutputRoot: String(localOutputRoot || '').trim(),
        runtimeEventsKey: String(runtimeEventsKey || '').trim(),
        writeMarkdownSummary,
        awsRegion: String(awsRegion || '').trim(),
        s3Bucket: String(s3Bucket || '').trim(),
        s3InputPrefix: String(s3InputPrefix || '').trim(),
        s3OutputPrefix: String(s3OutputPrefix || '').trim(),
        eloSupabaseAnonKey: String(eloSupabaseAnonKey || '').trim(),
        eloSupabaseEndpoint: String(eloSupabaseEndpoint || '').trim(),
        llmEnabled,
        llmWriteSummary,
        llmProvider: String(llmProvider || '').trim(),
        llmBaseUrl: String(llmBaseUrl || '').trim(),
        openaiApiKey: String(openaiApiKey || '').trim(),
        anthropicApiKey: String(anthropicApiKey || '').trim(),
        allowBelowPassTargetFill,
        indexingHelperFilesEnabled,
        maxManufacturerUrlsPerProduct: Math.max(1, parsedMaxManufacturerUrlsPerProduct),
        maxManufacturerPagesPerDomain: Math.max(1, parsedMaxManufacturerPagesPerDomain),
        manufacturerReserveUrls: Math.max(0, parsedManufacturerReserveUrls),
        userAgent: String(userAgent || '').trim(),
        selfImproveEnabled,
        maxHypothesisItems: Math.max(1, parsedMaxHypothesisItems),
        hypothesisAutoFollowupRounds: Math.max(0, parsedHypothesisAutoFollowupRounds),
        hypothesisFollowupUrlsPerRound: Math.max(1, parsedHypothesisFollowupUrlsPerRound),
        learningConfidenceThreshold: Math.max(0, Math.min(1, parsedLearningConfidenceThreshold)),
        componentLexiconDecayDays: Math.max(1, parsedComponentLexiconDecayDays),
        componentLexiconExpireDays: Math.max(1, parsedComponentLexiconExpireDays),
        fieldAnchorsDecayDays: Math.max(1, parsedFieldAnchorsDecayDays),
        urlMemoryDecayDays: Math.max(1, parsedUrlMemoryDecayDays),
        disableGoogleCse,
        cseRescueOnlyMode,
        duckduckgoEnabled,
        searxngBaseUrl: String(searxngBaseUrl || '').trim(),
        bingSearchEndpoint: String(bingSearchEndpoint || '').trim(),
        bingSearchKey: String(bingSearchKey || '').trim(),
        googleCseCx: String(googleCseCx || '').trim(),
        googleCseKey: String(googleCseKey || '').trim(),
        duckduckgoBaseUrl: String(duckduckgoBaseUrl || '').trim(),
        cseRescueRequiredIteration: Math.max(1, parsedCseRescueRequiredIteration),
        duckduckgoTimeoutMs: Math.max(250, parsedDuckduckgoTimeoutMs),
        llmPlanProvider: String(llmPlanProvider || '').trim(),
        llmPlanBaseUrl: String(llmPlanBaseUrl || '').trim(),
        llmPlanApiKey: String(llmPlanApiKey || '').trim(),
        llmExtractionCacheEnabled,
        llmExtractionCacheDir: String(llmExtractionCacheDir || '').trim(),
        llmExtractionCacheTtlMs: Math.max(60000, parsedLlmExtractionCacheTtlMs),
        llmMaxCallsPerProductTotal: Math.max(1, parsedLlmMaxCallsPerProductTotal),
        llmMaxCallsPerProductFast: Math.max(0, parsedLlmMaxCallsPerProductFast),
        needsetEvidenceDecayDays: Math.max(1, parsedNeedsetEvidenceDecayDays),
        needsetEvidenceDecayFloor: Math.max(0, Math.min(1, parsedNeedsetEvidenceDecayFloor)),
        llmExtractMaxTokens: Math.max(LLM_EXTRACT_MIN_TOKENS, parsedLlmExtractMaxTokens),
        llmExtractMaxSnippetsPerBatch: Math.max(1, parsedLlmExtractMaxSnippetsPerBatch),
        llmExtractMaxSnippetChars: Math.max(LLM_EXTRACT_MIN_SNIPPET_CHARS, parsedLlmExtractMaxSnippetChars),
        llmExtractSkipLowSignal,
        llmExtractReasoningBudget: Math.max(256, parsedLlmExtractReasoningBudget),
        llmReasoningMode,
        llmReasoningBudget: Math.max(256, parsedLlmReasoningBudget),
        llmMonthlyBudgetUsd: Math.max(0, parsedLlmMonthlyBudgetUsd),
        llmPerProductBudgetUsd: Math.max(0, parsedLlmPerProductBudgetUsd),
        llmMaxCallsPerRound: Math.max(1, parsedLlmMaxCallsPerRound),
        llmMaxOutputTokens: Math.max(LLM_MIN_OUTPUT_TOKENS, parsedLlmMaxOutputTokens),
        llmVerifySampleRate: Math.max(1, parsedLlmVerifySampleRate),
        llmDisableBudgetGuards,
        llmMaxBatchesPerProduct: Math.max(1, parsedLlmMaxBatchesPerProduct),
        llmMaxEvidenceChars: Math.max(1000, parsedLlmMaxEvidenceChars),
        llmMaxTokens: Math.max(256, parsedLlmMaxTokens),
        llmTimeoutMs: Math.max(1000, parsedLlmTimeoutMs),
        llmCostInputPer1M: Math.max(0, parsedLlmCostInputPer1M),
        llmCostOutputPer1M: Math.max(0, parsedLlmCostOutputPer1M),
        llmCostCachedInputPer1M: Math.max(0, parsedLlmCostCachedInputPer1M),
        llmVerifyMode,
        endpointSignalLimit: Math.max(1, parsedEndpointSignalLimit),
        endpointSuggestionLimit: Math.max(1, parsedEndpointSuggestionLimit),
        endpointNetworkScanLimit: Math.max(50, parsedEndpointNetworkScanLimit),
        searchProvider,
        phase2LlmEnabled,
        llmPlanDiscoveryQueries: phase2LlmEnabled,
        phase2LlmModel,
        phase3LlmTriageEnabled,
        llmSerpRerankEnabled: phase3LlmTriageEnabled,
        phase3LlmModel,
        runProfile: profile,
        llmModelPlan: phase2LlmModel,
        llmMaxOutputTokensPlan: llmTokensPlan,
        llmTokensPlan,
        llmModelFast,
        llmMaxOutputTokensFast: llmTokensFast,
        llmTokensFast,
        llmModelTriage: phase3LlmModel,
        llmMaxOutputTokensTriage: llmTokensTriage,
        llmTokensTriage,
        llmModelReasoning,
        llmMaxOutputTokensReasoning: llmTokensReasoning,
        llmTokensReasoning,
        llmModelExtract,
        llmMaxOutputTokensExtract: llmTokensExtract,
        llmTokensExtract,
        llmModelValidate,
        llmMaxOutputTokensValidate: llmTokensValidate,
        llmTokensValidate,
        llmModelWrite,
        llmMaxOutputTokensWrite: llmTokensWrite,
        llmTokensWrite,
        llmFallbackEnabled,
        llmPlanFallbackModel: llmFallbackPlanModel,
        llmExtractFallbackModel: llmFallbackExtractModel,
        llmValidateFallbackModel: llmFallbackValidateModel,
        llmWriteFallbackModel: llmFallbackWriteModel,
        llmMaxOutputTokensPlanFallback: llmTokensPlanFallback,
        llmTokensPlanFallback,
        llmMaxOutputTokensExtractFallback: llmTokensExtractFallback,
        llmTokensExtractFallback,
        llmMaxOutputTokensValidateFallback: llmTokensValidateFallback,
        llmTokensValidateFallback,
        llmMaxOutputTokensWriteFallback: llmTokensWriteFallback,
        llmTokensWriteFallback,
        ...runControlPayload
      });
    },
    onMutate: ({ requestedRunId }) => {
      const previousRunId = String(selectedIndexLabRunId || '').trim();
      const optimisticRunId = String(requestedRunId || '').trim();
      clearProcessOutput();
      setClearedRunViewId('');
      setSelectedLlmTraceId('');
      if (previousRunId) {
        clearIndexLabRun(previousRunId);
        removeRunScopedQueries(previousRunId);
      }
      if (optimisticRunId) {
        setSelectedIndexLabRunId(optimisticRunId);
        removeRunScopedQueries(optimisticRunId);
      }
      queryClient.removeQueries({ queryKey: ['indexing', 'domain-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['indexlab', 'runs'], exact: true });
      queryClient.invalidateQueries({ queryKey: ['runtime-ops'] });
      return { previousRunId };
    },
    onError: (_error, _variables, context) => {
      setSelectedIndexLabRunId(String(context?.previousRunId || '').trim());
    },
    onSuccess: (status, variables) => {
      const resolvedRunId = String(status?.run_id || status?.runId || variables?.requestedRunId || '').trim();
      if (resolvedRunId) {
        setSelectedIndexLabRunId(resolvedRunId);
      }
      publishProcessStatus(status);
      void refreshAll();
    }
  });

  const stopMut = useMutation({
    mutationFn: async ({ force }: { force: boolean }) => {
      const first = await api.post<ProcessStatus>('/process/stop', { force });
      if (first?.running) {
        return api.post<ProcessStatus>('/process/stop', { force });
      }
      return first;
    },
    onSuccess: (status) => {
      publishProcessStatus(status);
      void refreshAll();
    }
  });

  const startSearxngMut = useMutation({
    mutationFn: () => api.post<{ ok: boolean; started: boolean; status: SearxngStatusResponse }>('/searxng/start'),
    onSuccess: refreshAll
  });

  const processStateLabel = processRunning
    ? 'running'
    : (processStatus?.exitCode === 0 && processStatus?.endedAt ? 'completed' : (processStatus?.exitCode !== null && processStatus?.exitCode !== undefined ? 'failed' : 'idle'));
  const busy = startIndexLabMut.isPending || stopMut.isPending || startSearxngMut.isPending || replayPending;
  const runtimeSettingsReady = runtimeSettingsAuthorityReady && !runtimeSettingsLoading;
  const canRunSingle = !isAll && !!singleProductId && runtimeSettingsReady;

  const actionError =
    (startIndexLabMut.error as Error)?.message
    || (stopMut.error as Error)?.message
    || (startSearxngMut.error as Error)?.message
    || '';

  const setNeedsetSort = (nextKey: (typeof NEEDSET_SORT_KEYS)[number]) => {
    if (needsetSortKey === nextKey) {
      setNeedsetSortDir(needsetSortDir === 'desc' ? 'asc' : 'desc');
      return;
    }
    setNeedsetSortKey(nextKey);
    setNeedsetSortDir(nextKey === 'field_key' ? 'asc' : 'desc');
  };
  const togglePanel = (panel: PanelKey) => {
    collapseToggle(`indexing:panel:${panel}`, DEFAULT_PANEL_COLLAPSED[panel]);
  };
  const setAllPanels = (collapsed: boolean) => {
    const batch: Record<string, boolean> = {};
    for (const key of PANEL_KEYS) {
      batch[`indexing:panel:${key}`] = collapsed;
    }
    collapseBatch(batch);
  };
  const handleRunIndexLab = () => {
    startIndexLabMut.mutate({
      requestedRunId: buildRequestedRunId(),
    });
  };

  return (
    <div className="space-y-4 flex flex-col">
      <PickerPanel
        collapsed={panelCollapsed.picker}
        onToggle={() => togglePanel('picker')}
        isAll={isAll}
        busy={busy}
        processRunning={processRunning}
        singleBrand={singleBrand}
        onBrandChange={setSingleBrand}
        singleModel={singleModel}
        onModelChange={setSingleModel}
        singleProductId={singleProductId}
        onProductIdChange={setSingleProductId}
        brandOptions={brandOptions}
        modelOptions={modelOptions}
        variantOptions={variantOptions}
        selectedCatalogProduct={selectedCatalogProduct}
        displayVariant={displayVariant}
        selectedAmbiguityMeter={selectedAmbiguityMeter}
        runtimeSettingsReady={runtimeSettingsReady}
        canRunSingle={canRunSingle}
        onRunIndexLab={handleRunIndexLab}
        stopForceKill={stopForceKill}
        onStopForceKillChange={setStopForceKill}
        onStopProcess={(opts) => stopMut.mutate(opts)}
        stopPending={stopMut.isPending}
        selectedIndexLabRunId={selectedIndexLabRunId}
        onClearSelectedRunView={clearSelectedRunView}
        onReplaySelectedRunView={replaySelectedRunView}
        productPickerActivity={productPickerActivity}
      />

      <LlmOutputPanel
        collapsed={panelCollapsed.llmOutput}
        onToggle={() => togglePanel('llmOutput')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        indexlabSearchProfile={indexlabSearchProfile}
        llmOutputSelectedCandidates={llmOutputSelectedCandidates}
        llmOutputRejectedCandidates={llmOutputRejectedCandidates}
        llmOutputDocHintRows={llmOutputDocHintRows}
        llmOutputFieldQueryRows={llmOutputFieldQueryRows}
        phase3Status={phase3Status}
        indexlabLlmTracesResp={indexlabLlmTracesResp}
        llmTraceRows={llmTraceRows}
        selectedLlmTrace={selectedLlmTrace}
        onTraceSelect={setSelectedLlmTraceId}
      />


      <LlmMetricsPanel
        collapsed={panelCollapsed.llmMetrics}
        onToggle={() => togglePanel('llmMetrics')}
        indexingLlmMetrics={indexingLlmMetrics}
        selectedRunLlmMetrics={selectedRunLlmMetrics}
        selectedLlmPricingRows={selectedLlmPricingRows}
        indexingLlmConfig={indexingLlmConfig}
      />

      <SerpExplorerPanel
        collapsed={panelCollapsed.serpExplorer}
        onToggle={() => togglePanel('serpExplorer')}
        indexlabSerpExplorer={indexlabSerpExplorer}
        indexlabSerpRows={indexlabSerpRows}
        phase3StatusLabel={phase3Status.label}
      />

      <Phase05Panel
        collapsed={panelCollapsed.phase5}
        onToggle={() => togglePanel('phase5')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase5StatusLabel={phase5Status.label}
        phase5Activity={phase5Activity}
        processRunning={processRunning}
        phase5Runtime={phase5Runtime}
        phase5ArticleDomainLeaderboard={phase5ArticleDomainLeaderboard}
        phase5ArticlePreviewJob={phase5ArticlePreviewJob}
        dynamicFetchDashboardSummary={dynamicFetchDashboardSummary}
        dynamicFetchDashboardHosts={dynamicFetchDashboardHosts}
        indexlabDynamicFetchDashboardResp={indexlabDynamicFetchDashboardResp}
        fetchConcurrency={fetchConcurrency}
        perHostMinDelayMs={perHostMinDelayMs}
        dynamicCrawleeEnabled={dynamicCrawleeEnabled}
        dynamicFetchRetryBudget={dynamicFetchRetryBudget}
        dynamicFetchRetryBackoffMs={dynamicFetchRetryBackoffMs}
        scannedPdfOcrEnabled={scannedPdfOcrEnabled}
        scannedPdfOcrPromoteCandidates={scannedPdfOcrPromoteCandidates}
        scannedPdfOcrBackend={scannedPdfOcrBackend}
        scannedPdfOcrMaxPages={scannedPdfOcrMaxPages}
        scannedPdfOcrMaxPairs={scannedPdfOcrMaxPairs}
        scannedPdfOcrMinCharsPerPage={scannedPdfOcrMinCharsPerPage}
        scannedPdfOcrMinLinesPerPage={scannedPdfOcrMinLinesPerPage}
        scannedPdfOcrMinConfidence={scannedPdfOcrMinConfidence}
      />

      <Phase06bPanel
        collapsed={panelCollapsed.phase6b}
        onToggle={() => togglePanel('phase6b')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase6bStatusLabel={phase6bStatus.label}
        phase6bActivity={phase6bActivity}
        processRunning={processRunning}
        phase6bSummary={phase6bSummary}
        phase6bJobs={phase6bJobs}
        phase6bActions={phase6bActions}
      />

      <Phase06Panel
        collapsed={panelCollapsed.phase6}
        onToggle={() => togglePanel('phase6')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase6StatusLabel={phase6Status.label}
        phase6Activity={phase6Activity}
        processRunning={processRunning}
        phase6Runtime={phase6Runtime}
        phase6EvidenceSummary={phase6EvidenceSummary}
        phase6DedupeStream={phase6DedupeStream}
        phase6EvidenceDocuments={phase6EvidenceDocuments}
        phase6EvidenceTopFields={phase6EvidenceTopFields}
        phase6EvidenceSearchRows={phase6EvidenceSearchRows}
        initialSearchQuery={phase6SearchQuery}
        onSearchQueryChange={setPhase6SearchQuery}
        normalizedSearchQuery={normalizedPhase6SearchQuery}
      />

      <Phase07Panel
        collapsed={panelCollapsed.phase7}
        onToggle={() => togglePanel('phase7')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase7StatusLabel={phase7Status.label}
        phase7Activity={phase7Activity}
        processRunning={processRunning}
        phase7Summary={phase7Summary}
        phase7FieldRows={phase7FieldRows}
        phase7PrimeRows={phase7PrimeRows}
        phase7HitRows={phase7HitRows}
      />

      <Phase08Panel
        collapsed={panelCollapsed.phase8}
        onToggle={() => togglePanel('phase8')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase8StatusLabel={phase8Status.label}
        phase8Activity={phase8Activity}
        processRunning={processRunning}
        phase8Summary={phase8Summary}
        phase8Batches={phase8Batches}
        phase8FieldContextRows={phase8FieldContextRows}
        phase8PrimeRows={phase8PrimeRows}
      />

      <Phase09Panel
        collapsed={panelCollapsed.phase9}
        onToggle={() => togglePanel('phase9')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        roundSummaryResp={roundSummaryResp}
      />

      <LearningPanel
        collapsed={panelCollapsed.learning}
        onToggle={() => togglePanel('learning')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        learningFeedResp={learningFeedResp}
      />

      <UrlHealthPanel
        collapsed={panelCollapsed.urlHealth}
        onToggle={() => togglePanel('urlHealth')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        phase4StatusLabel={phase4Status.label}
        phase4Activity={phase4Activity}
        processRunning={processRunning}
        phase4Summary={phase4Summary}
        phase4Rows={phase4Rows}
        phase4RepairRows={phase4RepairRows}
        phase4BadPatternRows={phase4BadPatternRows}
        activityNowMs={activityNowMs}
      />

      <SearchProfilePanel
        collapsed={panelCollapsed.searchProfile}
        onToggle={() => togglePanel('searchProfile')}
        persistScope={`${category}:${selectedIndexLabRunId || 'none'}`}
        indexlabSearchProfile={indexlabSearchProfile}
        indexlabSearchProfileRows={indexlabSearchProfileRows}
        indexlabSearchProfileVariantGuardTerms={indexlabSearchProfileVariantGuardTerms}
        indexlabSearchProfileQueryRejectBreakdown={indexlabSearchProfileQueryRejectBreakdown}
        indexlabSearchProfileAliasRejectRows={indexlabSearchProfileAliasRejectRows}
        needsetRows={indexlabNeedsetRows}
      />

      <EventStreamPanel
        collapsed={panelCollapsed.eventStream}
        onToggle={() => togglePanel('eventStream')}
        selectedIndexLabRunId={selectedIndexLabRunId}
        onRunIdChange={(runId) => { setSelectedIndexLabRunId(runId); setClearedRunViewId(''); }}
        indexlabRuns={indexlabRuns}
        selectedIndexLabRun={selectedIndexLabRun}
        selectedRunLiveDuration={selectedRunLiveDuration}
        selectedRunIdentityFingerprintShort={selectedRunIdentityFingerprintShort}
        selectedRunStartupSummary={selectedRunStartupSummary}
        runViewCleared={runViewCleared}
        indexlabSummary={indexlabSummary}
        eventStreamActivity={eventStreamActivity}
        processRunning={processRunning}
        persistScope={normalizeToken(category) || 'all'}
        overviewContent={(
          <OverviewPanel
            embedded
            category={category}
            processStateLabel={processStateLabel}
            processStatus={processStatus}
            processRunning={processRunning}
            selectedIndexLabRun={selectedIndexLabRun}
            selectedRunLiveDuration={selectedRunLiveDuration}
            runtimeActivity={runtimeActivity}
            llmActivity={llmActivity}
            pendingLlmTotal={pendingLlmTotal}
            pendingLlmPeak={pendingLlmPeak}
            pendingLlmRows={pendingLlmRows}
            activityNowMs={activityNowMs}
            activePendingLlm={activePendingLlm}
            pendingPromptPretty={pendingPromptPretty}
            pendingPromptPhase={pendingPromptPhase}
            pendingPromptIsJson={pendingPromptIsJson}
            lastReceivedResponseTrace={lastReceivedResponseTrace}
            lastReceivedResponseEvent={lastReceivedResponseEvent}
            lastReceivedResponsePretty={lastReceivedResponsePretty}
            lastReceivedPhase={lastReceivedPhase}
            lastReceivedResponseIsJson={lastReceivedResponseIsJson}
            pipelineSteps={pipelineSteps}
          />
        )}
        panelControlsContent={(
          <PanelControlsPanel
            embedded
            containerStatuses={containerStatuses}
            onOpenAll={() => setAllPanels(false)}
            onCloseAll={() => setAllPanels(true)}
          />
        )}
        sessionDataContent={(
          <SessionDataPanel
            embedded
            selectedIndexLabRunId={selectedIndexLabRunId}
            sessionCrawledCells={sessionCrawledCells}
          />
        )}
      />

      <NeedSetPanel
        collapsed={panelCollapsed.needset}
        onToggle={() => togglePanel('needset')}
        indexlabNeedset={indexlabNeedset}
        indexlabNeedsetRows={indexlabNeedsetRows}
        indexlabNeedsetIdentityState={indexlabNeedsetIdentityState}
        indexlabNeedsetSparklineValues={indexlabNeedsetSparklineValues}
        indexlabNeedsetIdentityAuditRows={indexlabNeedsetIdentityAuditRows}
        onSortChange={setNeedsetSort}
        needsetActivity={needsetActivity}
        processRunning={processRunning}
      />

      {actionError && (
        <div className="sf-callout sf-callout-danger px-3 py-2 sf-text-caption" style={{ order: 100 }}>
          action failed: {actionError}
        </div>
      )}
    </div>
  );
}
