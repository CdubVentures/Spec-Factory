import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { buildRawConfig, createManifestApplicator } from '../configBuilder.js';

const SAVED_ENV = { ...process.env };

function withCleanEnv(overrides = {}) {
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
    if (appPrefixes.some((prefix) => key.startsWith(prefix))) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, overrides);
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in SAVED_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, SAVED_ENV);
}

function createConfigBuilderHarness(overrides = {}) {
  withCleanEnv(overrides);
  const manifestApplicator = createManifestApplicator({});
  const result = buildRawConfig({ manifestApplicator });

  return {
    cfg: result.cfg,
    explicitEnvKeys: result.explicitEnvKeys,
    cleanup() {
      restoreEnv();
    },
  };
}

describe('configBuilder characterization contract', () => {
  it('returns a non-null config object with the expected baseline size', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    ok(harness.cfg && typeof harness.cfg === 'object');
    ok(Object.keys(harness.cfg).length >= 107);
  });

  it('exposes the expected string config fields as strings', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    const expectedStrings = [
      'userAgent',
      'localInputRoot', 'localOutputRoot', 'runtimeEventsKey',
      'runProfile', 'searchEngines', 'searchEnginesFallback',
      'searxngBaseUrl', 'searxngDefaultBaseUrl',
      'llmProvider', 'llmApiKey', 'llmBaseUrl',
      'llmModelExtract', 'llmModelPlan', 'llmModelReasoning',
      'llmPhaseOverridesJson', 'llmProviderRegistryJson',
      'openaiApiKey', 'openaiBaseUrl', 'openaiModelExtract', 'openaiModelPlan', 'openaiModelWrite',
      'specDbDir', 'repairDedupeRule',
      'indexingResumeMode', 'runtimeControlFile', 'runtimeScreenshotMode',
      'accuracyMode',
      'chatmockDir', 'chatmockComposeFile', 'categoryAuthorityRoot',
      'automationQueueStorageEngine',
    ];

    for (const key of expectedStrings) {
      strictEqual(typeof harness.cfg[key], 'string', `cfg.${key} should be string`);
    }
  });

  it('exposes the expected integer config fields as finite numbers', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    const expectedInts = [
      'maxPagesPerDomain',
      'serpSelectorUrlCap', 'domainClassifierUrlCap',
      'maxRunSeconds',
      'searchProfileQueryCap',
      'searxngMinQueryIntervalMs',
      'llmTimeoutMs', 'openaiTimeoutMs', 'openaiMaxInputChars',
      'llmMaxTokens', 'llmMaxOutputTokens', 'llmMaxOutputTokensPlan',
      'llmMaxOutputTokensReasoning', 'llmMaxOutputTokensPlanFallback',
      'llmReasoningBudget', 'llmMaxCallsPerRound', 'llmMaxCallsPerProductTotal',
      'autoScrollPasses', 'autoScrollDelayMs',
      'robotsTxtTimeoutMs',
    ];

    for (const key of expectedInts) {
      strictEqual(typeof harness.cfg[key], 'number', `cfg.${key} should be number`);
      ok(Number.isFinite(harness.cfg[key]), `cfg.${key} should be finite`);
    }
  });

  it('exposes the expected boolean config fields as booleans', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    const expectedBools = [
      'localMode', 'dryRun',
      'writeMarkdownSummary', 'discoveryEnabled',
      'crawleeHeadless',
      'capturePageScreenshotEnabled',
      'autoScrollEnabled', 'robotsTxtCompliant',
      'categoryAuthorityEnabled', 'runtimeTraceEnabled',
      'runtimeTraceLlmPayloads',
      'llmPlanUseReasoning', 'llmReasoningMode',
      'eventsJsonWrite', 'runtimeScreencastEnabled',
      'chartExtractionEnabled',
    ];

    for (const key of expectedBools) {
      strictEqual(typeof harness.cfg[key], 'boolean', `cfg.${key} should be boolean`);
    }
  });

  it('exposes the expected object config fields as objects', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    for (const key of [
      'retrievalInternalsMap',
      'searchProfileCapMap',
      'llmModelPricingMap',
      'llmModelOutputTokenMap',
    ]) {
      ok(harness.cfg[key] && typeof harness.cfg[key] === 'object', `cfg.${key} should be object`);
    }
  });

  it('preserves the observed numeric defaults', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    strictEqual(harness.cfg.searchProfileQueryCap, 10);
    strictEqual(harness.cfg.maxRunSeconds, 480);
  });

  it('preserves the observed hardcoded defaults', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    strictEqual(harness.cfg.runProfile, 'standard');
    strictEqual(harness.cfg.searchGlobalRps, 0);
    strictEqual(harness.cfg.searchGlobalBurst, 0);
    strictEqual(harness.cfg.searchPerHostRps, 0);
    strictEqual(harness.cfg.searchPerHostBurst, 0);
    strictEqual(harness.cfg.automationQueueStorageEngine, 'sqlite');
    strictEqual(harness.cfg.runtimeScreenshotMode, 'last_only');
    strictEqual(harness.cfg.accuracyMode, 'production');
  });

  it('preserves the observed string and boolean defaults', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    strictEqual(harness.cfg.repairDedupeRule, 'domain_once');
    strictEqual(harness.cfg.discoveryEnabled, true);
    strictEqual(harness.cfg.robotsTxtCompliant, true);
    strictEqual(harness.cfg.dryRun, false);
    strictEqual(harness.cfg.localMode, true);
  });

  it('returns explicitEnvKeys as a Set', (t) => {
    const harness = createConfigBuilderHarness();
    t.after(() => harness.cleanup());

    ok(harness.explicitEnvKeys instanceof Set);
  });
});
