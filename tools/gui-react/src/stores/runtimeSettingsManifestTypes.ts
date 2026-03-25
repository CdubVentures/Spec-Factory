// AUTO-GENERATED from RUNTIME_SETTINGS_REGISTRY — do not edit manually.
// Run: node tools/gui-react/scripts/generateManifestTypes.js

export interface RuntimeSettingDefaults {
  anthropicApiKey: string;
  autoScrollDelayMs: number;
  autoScrollEnabled: boolean;
  autoScrollPasses: number;
  capturePageScreenshotEnabled: boolean;
  capturePageScreenshotFormat: string;
  capturePageScreenshotMaxBytes: number;
  capturePageScreenshotQuality: number;
  capturePageScreenshotSelectors: string;
  categoryAuthorityRoot: string;
  crawleeHeadless: boolean;
  crawleeRequestHandlerTimeoutSecs: number;
  fetcherAdapter: string;
  fetcherPlugins: string;
  deepseekApiKey: string;
  searchProfileQueryCap: number;
  domainClassifierUrlCap: number;

  eventsJsonWrite: boolean;
  geminiApiKey: string;
  googleSearchMaxRetries: number;
  googleSearchMinQueryIntervalMs: number;
  googleSearchProxyUrlsJson: string;
  googleSearchScreenshotsEnabled: boolean;
  googleSearchTimeoutMs: number;
  serperApiKey: string;
  serperEnabled: boolean;
  llmEnhancerMaxRetries: number;
  llmBaseUrl: string;
  llmCostCachedInputPer1M: number;
  llmCostInputPer1M: number;
  llmCostOutputPer1M: number;
  llmMaxOutputTokens: number;
  llmMaxOutputTokensPlan: number;
  llmMaxOutputTokensPlanFallback: number;
  llmMaxOutputTokensTriage: number;
  llmMaxOutputTokensReasoning: number;
  llmMaxOutputTokensReasoningFallback: number;
  llmMaxTokens: number;
  llmModelPlan: string;
  llmModelReasoning: string;
  llmPhaseOverridesJson: string;

  llmPlanFallbackModel: string;

  llmPlanUseReasoning: boolean;
  llmProvider: string;
  llmProviderRegistryJson: string;
  llmReasoningBudget: number;
  llmReasoningFallbackModel: string;
  llmReasoningMode: boolean;
  llmTimeoutMs: number;
  localInputRoot: string;
  localOutputRoot: string;
  maxPagesPerDomain: number;
  maxRunSeconds: number;
  openaiApiKey: string;
  pipelineSchemaEnforcementMode: string;

  runtimeControlFile: string;
  runtimeEventsKey: string;
  runtimeScreencastEnabled: boolean;
  runtimeTraceEnabled: boolean;
  runtimeTraceLlmPayloads: boolean;
  searchEngines: string;
  searchEnginesFallback: string;
  searchMaxRetries: number;
  serpSelectorUrlCap: number;
  searxngBaseUrl: string;
  searxngMinQueryIntervalMs: number;
  specDbDir: string;


  needsetGroupQueryTermsCap: number;
  needsetGroupSearchCoverageThreshold: number;
  needsetGroupSearchMinUnresolved: number;
  needsetGroupSearchMaxRepeats: number;
  needsetSeedCooldownDays: number;
  queryBuilderMaxAliases: number;
  queryBuilderFieldQueryCap: number;
  queryBuilderDocHintQueryCap: number;

  manufacturerPlanUrlCap: number;
  queryDedupeRowsCap: number;

  googleSearchPostResultsDelayMs: number;
  googleSearchScreenshotQuality: number;
  googleSearchSerpSelectorWaitMs: number;
  googleSearchScrollDelayMs: number;

  serperSearchMinIntervalMs: number;

  serperSearchTimeoutMs: number;
  serperSearchMaxRetries: number;
  searxngSearchTimeoutMs: number;
  braveSearchTimeoutMs: number;
  braveSearchResultCap: number;
  searchPacingJitterFactor: number;
  searchLoopMaxNoProgressRounds: number;
  searchLoopMaxLowQualityRounds: number;
  crawleeMaxRequestRetries: number;
  crawleeMaxPagesPerBrowser: number;
  crawleeBrowserRetirePageCount: number;
  crawleeNavigationTimeoutMs: number;
  crawlMaxConcurrentSlots: number;
  autoScrollPostLoadWaitMs: number;
  capturePageScreenshotMaxSelectors: number;
}

export type RuntimeProfile = 'standard';
export type SearxngEngine = 'google' | 'bing' | 'google-proxy' | 'duckduckgo' | 'brave';
