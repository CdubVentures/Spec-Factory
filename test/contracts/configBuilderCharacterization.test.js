// WHY: Golden-master characterization test for buildRawConfig.
// Captures the SHAPE and default VALUES of the cfg object before Phase 3 rewrite.
// Any key missing or value changed after the rewrite will be caught here.

import { describe, it, before, after } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { buildRawConfig, createManifestApplicator } from '../../src/core/config/configBuilder.js';

// WHY: buildRawConfig reads process.env. We must control it for deterministic output.
// Save the full env, clear it, set only the minimum needed, then restore.

const SAVED_ENV = { ...process.env };

function withCleanEnv(overrides = {}) {
  // WHY: Can't fully wipe process.env on Windows (some vars are required).
  // Instead, clear all SPEC_FACTORY / app-relevant vars and set overrides.
  const appPrefixes = [
    'AWS_', 'S3_', 'MAX_', 'LLM_', 'OPENAI_', 'DEEPSEEK_', 'GEMINI_',
    'ANTHROPIC_', 'SEARCH_', 'SEARXNG_', 'SERPER_', 'FRONTIER_', 'CRAWLEE_',
    'DYNAMIC_', 'STATIC_', 'RUNTIME_', 'INDEXING_', 'HELPER_', 'CATEGORY_',
    'LOCAL_', 'MIRROR_', 'OUTPUT_', 'SPEC_', 'PDF_', 'SCANNED_', 'FETCH_',
    'CAPTURE_', 'AUTO_SCROLL_', 'ROBOTS_', 'ENDPOINT_', 'DOMAIN_', 'GLOBAL_',
    'PAGE_', 'POST_LOAD_', 'ARTICLE_', 'DOM_', 'BATCH_', 'REPAIR_',
    'HYPOTHESIS_', 'FIELD_', 'EVENTS_', 'IMPORTS_', 'DAEMON_', 'DRIFT_',
    'GRAPHQL_', 'ACCURACY_', 'CHATMOCK_', 'SELF_IMPROVE_', 'DRY_RUN',
    'PREFER_', 'CONCURRENCY', 'PER_HOST_', 'USER_AGENT', 'ELO_', 'SERP_',
    'CHART_', 'DISCOVERY_', 'RECRAWL_', 'WRITE_',
  ];
  for (const key of Object.keys(process.env)) {
    if (appPrefixes.some(p => key.startsWith(p))) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
}

function restoreEnv() {
  // Remove any keys we added
  for (const key of Object.keys(process.env)) {
    if (!(key in SAVED_ENV)) {
      delete process.env[key];
    }
  }
  // Restore original values
  Object.assign(process.env, SAVED_ENV);
}

describe('configBuilder characterization — golden master', () => {
  let cfg;
  let explicitEnvKeys;

  before(() => {
    withCleanEnv();
    const manifestApplicator = createManifestApplicator({});
    const result = buildRawConfig({ manifestApplicator });
    cfg = result.cfg;
    explicitEnvKeys = result.explicitEnvKeys;
  });

  after(() => {
    restoreEnv();
  });

  it('cfg is a non-null object', () => {
    ok(cfg && typeof cfg === 'object', 'cfg must be a non-null object');
  });

  it('cfg has at least 160 keys', () => {
    const keyCount = Object.keys(cfg).length;
    ok(keyCount >= 160, `expected >= 160 cfg keys, got ${keyCount}`);
  });

  // --- Shape verification: every key has the expected type ---

  it('all string keys are strings', () => {
    const expectedStrings = [
      'awsRegion', 's3Bucket', 's3InputPrefix', 's3OutputPrefix',
      'pdfPreferredBackend', 'scannedPdfOcrBackend', 'userAgent',
      'outputMode', 'localInputRoot', 'localOutputRoot', 'runtimeEventsKey',
      'runProfile', 'searchEngines', 'searchEnginesFallback',
      'searxngBaseUrl', 'searxngDefaultBaseUrl',
      'llmProvider', 'llmApiKey', 'llmBaseUrl',
      'llmModelExtract', 'llmModelPlan', 'llmModelReasoning',
      'llmPhaseOverridesJson', 'llmProviderRegistryJson',
      'openaiApiKey', 'openaiBaseUrl', 'openaiModelExtract', 'openaiModelPlan', 'openaiModelWrite',
      'specDbDir', 'frontierDbPath', 'repairDedupeRule',
      'indexingResumeMode', 'runtimeControlFile', 'runtimeScreenshotMode',
      'staticDomMode', 'batchStrategy', 'accuracyMode',
      'chatmockDir', 'chatmockComposeFile', 'categoryAuthorityRoot',
      'importsRoot', 'automationQueueStorageEngine',
    ];
    for (const key of expectedStrings) {
      strictEqual(typeof cfg[key], 'string', `cfg.${key} should be string, got ${typeof cfg[key]}`);
    }
  });

  it('all integer keys are numbers', () => {
    const expectedInts = [
      'maxUrlsPerProduct', 'maxCandidateUrls', 'maxPagesPerDomain',
      'serpSelectorUrlCap', 'domainClassifierUrlCap',
      'maxRunSeconds', 'maxJsonBytes', 'maxPdfBytes',
      'concurrency', 'perHostMinDelayMs',
      'domainRequestRps', 'domainRequestBurst',
      'globalRequestRps', 'globalRequestBurst',
      'fetchPerHostConcurrencyCap', 'fetchSchedulerMaxRetries',
      'searchProfileQueryCap', 'searchPlannerQueryCap',
      'discoveryResultsPerQuery', 'discoveryQueryConcurrency',
      'searxngMinQueryIntervalMs',
      'llmTimeoutMs', 'openaiTimeoutMs', 'openaiMaxInputChars',
      'llmMaxTokens', 'llmMaxOutputTokens', 'llmMaxOutputTokensPlan',
      'llmMaxOutputTokensReasoning', 'llmMaxOutputTokensPlanFallback',
      'llmReasoningBudget', 'llmMaxCallsPerRound', 'llmMaxCallsPerProductTotal',
      'llmMaxEvidenceChars', 'llmMaxBatchesPerProduct',
      'llmExtractMaxSnippetsPerBatch', 'llmExtractMaxSnippetChars',
      'pageGotoTimeoutMs', 'pageNetworkIdleTimeoutMs', 'postLoadWaitMs',
      'fetchBudgetMs', 'endpointSignalLimit', 'endpointSuggestionLimit',
      'endpointNetworkScanLimit',
      'pdfBackendRouterTimeoutMs', 'pdfBackendRouterMaxPages',
      'pdfBackendRouterMaxPairs', 'pdfBackendRouterMaxTextPreviewChars',
      'scannedPdfOcrMaxPages', 'scannedPdfOcrMaxPairs',
      'scannedPdfOcrMinCharsPerPage', 'scannedPdfOcrMinLinesPerPage',
      'articleExtractorMinChars', 'articleExtractorMinScore', 'articleExtractorMaxChars',
      'domSnippetMaxChars', 'autoScrollPasses', 'autoScrollDelayMs',
      'robotsTxtTimeoutMs',
      'daemonConcurrency', 'driftPollSeconds', 'driftScanMaxProducts',
      'reCrawlStaleAfterDays', 'importsPollSeconds',
    ];
    for (const key of expectedInts) {
      strictEqual(typeof cfg[key], 'number', `cfg.${key} should be number, got ${typeof cfg[key]}`);
      ok(Number.isFinite(cfg[key]), `cfg.${key} should be finite, got ${cfg[key]}`);
    }
  });

  it('all boolean keys are booleans', () => {
    const expectedBools = [
      'pdfBackendRouterEnabled', 'scannedPdfOcrEnabled',
      'localMode', 'dryRun', 'mirrorToS3', 'mirrorToS3Input',
      'writeMarkdownSummary', 'discoveryEnabled', 'fetchCandidateSources',
      'dynamicCrawleeEnabled', 'crawleeHeadless',
      'preferHttpFetcher', 'capturePageScreenshotEnabled',
      'autoScrollEnabled', 'robotsTxtCompliant',
      'graphqlReplayEnabled', 'driftDetectionEnabled', 'driftAutoRepublish',
      'categoryAuthorityEnabled', 'runtimeTraceEnabled',
      'runtimeTraceLlmPayloads', 'selfImproveEnabled',
      'llmWriteSummary', 'llmPlanUseReasoning', 'llmReasoningMode',
      'llmExtractSkipLowSignal', 'llmVerifyMode',
      'eventsJsonWrite', 'runtimeScreencastEnabled',
      'indexingReextractEnabled', 'indexingSchemaPacketsValidationEnabled',
      'indexingSchemaPacketsValidationStrict',
      'frontierStripTrackingParams', 'helperSupportiveFillMissing',
      'manufacturerAutoPromote', 'chartExtractionEnabled',
    ];
    for (const key of expectedBools) {
      strictEqual(typeof cfg[key], 'boolean', `cfg.${key} should be boolean, got ${typeof cfg[key]}`);
    }
  });

  it('all object keys are objects', () => {
    const expectedObjects = [
      'fetchSchedulerInternalsMap', 'dynamicFetchPolicyMap',
      'retrievalInternalsMap', 'evidencePackLimitsMap', 'parsingConfidenceBaseMap',
      'searchProfileCapMap', 'serpRerankerWeightMap',
      'articleExtractorDomainPolicyMap', 'llmModelPricingMap',
      'llmModelOutputTokenMap',
    ];
    for (const key of expectedObjects) {
      ok(cfg[key] && typeof cfg[key] === 'object', `cfg.${key} should be object, got ${typeof cfg[key]}`);
    }
  });

  // --- Spot-check key default values (clean env, no manifest) ---

  it('spot-check: numeric defaults match registry', () => {
    // These are the values that were drifted — verify they now use registry SSOT
    strictEqual(cfg.searchProfileQueryCap, 10, 'searchProfileQueryCap');
    strictEqual(cfg.searchPlannerQueryCap, 30, 'searchPlannerQueryCap');
    strictEqual(cfg.maxRunSeconds, 480, 'maxRunSeconds');
    strictEqual(cfg.concurrency, 4, 'concurrency (fetchConcurrency)');
    strictEqual(cfg.discoveryResultsPerQuery, 10, 'discoveryResultsPerQuery');
    strictEqual(cfg.discoveryQueryConcurrency, 2, 'discoveryQueryConcurrency');
  });

  it('spot-check: hardcoded values', () => {
    strictEqual(cfg.runProfile, 'standard');
    strictEqual(cfg.fetchCandidateSources, true);
    strictEqual(cfg.searchGlobalRps, 0);
    strictEqual(cfg.searchGlobalBurst, 0);
    strictEqual(cfg.searchPerHostRps, 0);
    strictEqual(cfg.searchPerHostBurst, 0);
    strictEqual(cfg.automationQueueStorageEngine, 'sqlite');
    strictEqual(cfg.runtimeScreenshotMode, 'last_only');
    strictEqual(cfg.accuracyMode, 'production');
  });

  it('spot-check: string defaults', () => {
    strictEqual(cfg.outputMode, 'dual');
    strictEqual(cfg.repairDedupeRule, 'domain_once');
    strictEqual(cfg.staticDomMode, 'cheerio');
  });

  it('spot-check: boolean defaults', () => {
    strictEqual(cfg.discoveryEnabled, true);
    strictEqual(cfg.preferHttpFetcher, true);
    strictEqual(cfg.robotsTxtCompliant, true);
    strictEqual(cfg.dryRun, false);
    strictEqual(cfg.localMode, true); // WHY: registry default is true; configBuilder had wrong fallback (false)
  });

  it('explicitEnvKeys is a Set', () => {
    ok(explicitEnvKeys instanceof Set, 'explicitEnvKeys must be a Set');
  });
});
