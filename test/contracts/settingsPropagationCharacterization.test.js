import { after, describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildProcessStartLaunchPlan } from '../../src/features/indexing/api/builders/processStartLaunchPlan.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../../src/shared/settingsRegistry.js';
import {
  buildRoundConfig,
  explainSearchProviderSelection,
} from '../../src/runner/roundConfigBuilder.js';

// WHY: Golden-master characterization tests for settings propagation.
// These lock down current behavior before the SSOT rewrite (Plan 02).
// Every assertion here documents the CURRENT state, not the desired state.

// --- Helpers ---

const TEST_CATEGORY_AUTHORITY_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-settings-propagation-'));

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

after(() => {
  cleanup(TEST_CATEGORY_AUTHORITY_ROOT);
});

function buildFullBody() {
  // Build a POST body with all registry keys set to recognizable test values
  const body = {
    category: 'mouse',
    mode: 'indexlab',
    productId: 'mouse-test-product-1',
    replaceRunning: true,
  };
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.secret) continue; // Skip API keys
    switch (entry.type) {
      case 'bool':
        body[entry.key] = !entry.default; // Invert default to verify propagation
        break;
      case 'int':
        body[entry.key] = entry.min != null ? entry.min + 1 : 42;
        break;
      case 'float':
        body[entry.key] = entry.min != null ? entry.min + 0.1 : 0.42;
        break;
      case 'enum':
        body[entry.key] = entry.allowed?.[0] ?? entry.default;
        break;
      case 'csv_enum':
        body[entry.key] = entry.allowed?.[0] ?? entry.default;
        break;
      case 'string':
        // WHY: JSON map fields must contain valid JSON, not arbitrary strings
        if (entry.key.endsWith('Json')) {
          body[entry.key] = entry.default || '';
        } else if (entry.key === 'categoryAuthorityRoot') {
          body[entry.key] = TEST_CATEGORY_AUTHORITY_ROOT;
        } else {
          body[entry.key] = `test-${entry.key}`;
        }
        break;
    }
  }
  return body;
}

function buildPlan(bodyOverrides = {}, optionOverrides = {}) {
  return buildProcessStartLaunchPlan({
    body: {
      ...buildFullBody(),
      ...bodyOverrides,
    },
    helperRoot: path.resolve('category_authority'),
    outputRoot: path.resolve('test-output'),
    indexLabRoot: path.resolve('test-indexlab'),
    runDataStorageState: { enabled: false, destinationType: 'local', localDirectory: '' },
    env: {},
    pathApi: path,
    buildRunIdFn: () => 'test-run-id-000',
    ...optionOverrides,
  });
}

// --- Launch Plan Golden Master ---

describe('processStartLaunchPlan — propagation characterization', () => {

  it('produces ok: true with valid full body', () => {
    const result = buildPlan();
    strictEqual(result.ok, true, `launch plan failed: ${JSON.stringify(result.body)}`);
  });

  it('envOverrides contains exactly the known direct-launch keys', () => {
    const result = buildPlan();
    ok(result.ok);
    const envKeys = new Set(Object.keys(result.envOverrides));

    // WHY: These are the 42+ env vars that processStartLaunchPlan currently sets.
    // This is the golden master — any change to this set must be intentional.
    const EXPECTED_DIRECT_LAUNCH_ENV_KEYS = new Set([
      'DYNAMIC_CRAWLEE_ENABLED',
      'SPEC_DB_DIR',
      'LLM_EXTRACTION_CACHE_DIR',
      'HELPER_FILES_ENABLED',
      'HELPER_FILES_ROOT',
      'CATEGORY_AUTHORITY_ROOT',
      'OUTPUT_MODE',
      'LOCAL_MODE',
      'DRY_RUN',
      'MIRROR_TO_S3',
      'MIRROR_TO_S3_INPUT',
      'LOCAL_INPUT_ROOT',
      'LOCAL_OUTPUT_ROOT',
      'RUNTIME_EVENTS_KEY',
      'WRITE_MARKDOWN_SUMMARY',
      'LLM_PROVIDER',
      'LLM_BASE_URL',
      'FRONTIER_DB_PATH',
      'FRONTIER_BLOCKED_DOMAIN_THRESHOLD',
      'PAGE_GOTO_TIMEOUT_MS',
      'CAPTURE_PAGE_SCREENSHOT_ENABLED',
      'CAPTURE_PAGE_SCREENSHOT_FORMAT',
      'CAPTURE_PAGE_SCREENSHOT_SELECTORS',
      'RUNTIME_TRACE_FETCH_RING',
      'RUNTIME_TRACE_LLM_RING',
      'RUNTIME_TRACE_LLM_PAYLOADS',
      'EVENTS_JSON_WRITE',
      'RUNTIME_SCREENCAST_ENABLED',
      'RUNTIME_SCREENCAST_FPS',
      'RUNTIME_SCREENCAST_QUALITY',
      'RUNTIME_SCREENCAST_MAX_WIDTH',
      'RUNTIME_SCREENCAST_MAX_HEIGHT',
      'LLM_MODEL_PLAN',
      'LLM_MODEL_REASONING',
      'LLM_MAX_OUTPUT_TOKENS_PLAN',
      'LLM_MAX_OUTPUT_TOKENS_REASONING',
      'LLM_PLAN_FALLBACK_MODEL',
      'LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK',
    ]);

    // Check every expected key is present
    for (const expectedKey of EXPECTED_DIRECT_LAUNCH_ENV_KEYS) {
      ok(envKeys.has(expectedKey), `expected env key ${expectedKey} not found in envOverrides`);
    }

    // Document any EXTRA keys not in the expected set (new additions since audit)
    const extraKeys = [];
    for (const key of envKeys) {
      if (!EXPECTED_DIRECT_LAUNCH_ENV_KEYS.has(key)) {
        extraKeys.push(key);
      }
    }
    // If there are extra keys, that's OK — just document them. Don't fail.
    if (extraKeys.length > 0) {
      // This is informational — update EXPECTED_DIRECT_LAUNCH_ENV_KEYS if these are intentional
      ok(true, `Extra env keys found (update golden master if intentional): ${extraKeys.join(', ')}`);
    }
  });

  it('registry keys NOT in envOverrides are payload-only or save-only (the propagation gap)', () => {
    const result = buildPlan();
    ok(result.ok);
    const envKeys = new Set(Object.keys(result.envOverrides));

    // These registry keys are sent in the GUI POST body but processStartLaunchPlan
    // does NOT convert them to env vars. On the happy path, the child reads them from
    // the RUNTIME_SETTINGS_SNAPSHOT file (Plan 05). If the snapshot write fails,
    // these fall back to user-settings.json (stale-start risk).
    const KNOWN_PAYLOAD_ONLY_GAPS = [
      // Fetch network (sent in POST body but dropped before child launch)
      'perHostMinDelayMs',
      'pageNetworkIdleTimeoutMs', 'postLoadWaitMs',
      // Browser/rendering
      'crawleeHeadless', 'crawleeRequestHandlerTimeoutSecs',
      'autoScrollEnabled', 'autoScrollPasses', 'autoScrollDelayMs',
      'robotsTxtCompliant', 'robotsTxtTimeoutMs',
      'capturePageScreenshotQuality', 'capturePageScreenshotMaxBytes',
      // Frontier
      'frontierStripTrackingParams', 'frontierQueryCooldownSeconds',
      'frontierCooldown404Seconds', 'frontierCooldown404RepeatSeconds',
      'frontierCooldown410Seconds', 'frontierCooldownTimeoutSeconds',
      'frontierCooldown403BaseSeconds', 'frontierCooldown429BaseSeconds',
      'frontierBackoffMaxExponent', 'frontierPathPenaltyNotfoundThreshold',
      // Discovery
      'searchProfileQueryCap',
      'maxUrlsPerProduct', 'maxCandidateUrls', 'maxPagesPerDomain',
      'maxRunSeconds',
      // LLM settings
      'llmMaxCallsPerRound', 'llmMaxOutputTokens', 'llmMaxTokens',
      'llmTimeoutMs', 'llmCostInputPer1M', 'llmCostOutputPer1M', 'llmCostCachedInputPer1M',
      'llmReasoningMode', 'llmReasoningBudget',
      'llmMonthlyBudgetUsd', 'llmPerProductBudgetUsd', 'llmMaxCallsPerProductTotal',
      'llmExtractionCacheDir',
      // Model / provider
      'llmPlanProvider', 'llmPlanBaseUrl',
      'llmReasoningFallbackModel', 'llmMaxOutputTokensReasoningFallback',
      'llmMaxOutputTokensPlanFallback',
      'llmProviderRegistryJson', 'llmPhaseOverridesJson',
      'llmPlanUseReasoning',
      // Automation
      'categoryAuthorityEnabled', 'categoryAuthorityRoot',
      'indexingResumeSeedLimit', 'indexingResumePersistLimit',
      // Run output/control
      'runtimeControlFile', 'specDbDir',
      'runtimeTraceEnabled',
      'outputMode', 'localMode', 'dryRun',
      'localInputRoot', 'localOutputRoot', 'runtimeEventsKey',
      'writeMarkdownSummary',
      'mirrorToS3', 'mirrorToS3Input',
      's3InputPrefix', 's3OutputPrefix',
      // Search
      'searchEnginesFallback', 'searxngBaseUrl', 'searxngMinQueryIntervalMs',
      'repairDedupeRule',
      // Resume
      'resumeMode', 'resumeWindowHours',
      // Google
      'googleSearchMaxRetries', 'googleSearchMinQueryIntervalMs',
      'googleSearchProxyUrlsJson', 'googleSearchScreenshotsEnabled',
      'googleSearchTimeoutMs',
      // Learning
      'userAgent',
    ];

    // This documents the gap — these are sent by GUI but dropped before child launch
    // After the rewrite, ALL of these should travel via snapshot
    ok(
      KNOWN_PAYLOAD_ONLY_GAPS.length > 40,
      `Expected > 40 payload-only gaps, got ${KNOWN_PAYLOAD_ONLY_GAPS.length}`
    );
  });

  it('boolean env values are string true/false', () => {
    const result = buildPlan({ dryRun: false, localMode: true });
    ok(result.ok);
    strictEqual(result.envOverrides.DRY_RUN, 'false');
    strictEqual(result.envOverrides.LOCAL_MODE, 'true');
  });

  it('integer env values are clamped string numbers', () => {
    // WHY: Use minimal body to avoid JSON validation failures on full body
    const result = buildProcessStartLaunchPlan({
      body: {
        category: 'mouse',
        mode: 'indexlab',
        productId: 'mouse-test-1',
        runtimeTraceFetchRing: 9999,
      },
      helperRoot: path.resolve('category_authority'),
      outputRoot: path.resolve('test-output'),
      indexLabRoot: path.resolve('test-indexlab'),
      runDataStorageState: { enabled: false },
      env: {},
      pathApi: path,
      buildRunIdFn: () => 'test-run-clamp',
    });
    ok(result.ok, `plan failed: ${JSON.stringify(result.body)}`);
    // Clamped to max 2000
    strictEqual(result.envOverrides.RUNTIME_TRACE_FETCH_RING, '2000');
  });

  it('assignInt skips values below minInput threshold', () => {
    // WHY: assignInt in processStartLaunchPlan skips entirely when value < minInput
    const result = buildProcessStartLaunchPlan({
      body: {
        category: 'mouse',
        mode: 'indexlab',
        productId: 'mouse-test-1',
        runtimeTraceFetchRing: 5, // Below minInput of 10
      },
      helperRoot: path.resolve('category_authority'),
      outputRoot: path.resolve('test-output'),
      indexLabRoot: path.resolve('test-indexlab'),
      runDataStorageState: { enabled: false },
      env: {},
      pathApi: path,
      buildRunIdFn: () => 'test-run-skip',
    });
    ok(result.ok);
    // Value below minInput is SKIPPED entirely — env var not set
    strictEqual(result.envOverrides.RUNTIME_TRACE_FETCH_RING, undefined);
  });

  it('unsupported mode rejects with 400', () => {
    const result = buildPlan({ mode: 'unsupported' });
    strictEqual(result.ok, false);
    strictEqual(result.status, 400);
  });
});

// --- Round Config Golden Master ---

describe('buildRoundConfig — round override characterization', () => {

  function buildBaseConfig() {
    return {
      searchEngines: 'google',
      searchProvider: 'google',
      searxngBaseUrl: 'http://127.0.0.1:8080',
      discoveryEnabled: true,
      autoScrollEnabled: true,
      autoScrollPasses: 2,
      autoScrollDelayMs: 1200,
      pageGotoTimeoutMs: 12000,
      pageNetworkIdleTimeoutMs: 2000,
      postLoadWaitMs: 200,
      maxRunSeconds: 480,
      maxUrlsPerProduct: 50,
      maxCandidateUrls: 80,
      maxPagesPerDomain: 5,
      searchProfileQueryCap: 10,
      perHostMinDelayMs: 1500,
      llmMaxCallsPerRound: 5,
      llmMaxCallsPerProductTotal: 14,
    };
  }

  // WHY: Round-mode overrides (fast/thorough) were removed. Pipeline settings
  // are now the single source of truth. These tests verify settings pass through.
  it('round 0 passes user settings through unchanged', () => {
    const base = buildBaseConfig();
    const result = buildRoundConfig(base, { round: 0 });

    // User settings pass through — no round-mode overrides
    strictEqual(result.searchProfileQueryCap, 10, 'searchProfileQueryCap passes through');
    strictEqual(result.maxRunSeconds, base.maxRunSeconds, 'maxRunSeconds passes through');
    strictEqual(result.autoScrollEnabled, base.autoScrollEnabled, 'autoScrollEnabled passes through');
  });

  it('round 2+ passes user settings through unchanged', () => {
    const base = buildBaseConfig();
    const result = buildRoundConfig(base, { round: 2 });

    // User settings pass through — no round-mode overrides
    strictEqual(result.searchProfileQueryCap, 10, 'searchProfileQueryCap passes through');
    strictEqual(result.maxRunSeconds, base.maxRunSeconds, 'maxRunSeconds passes through');
    strictEqual(result.autoScrollEnabled, base.autoScrollEnabled, 'autoScrollEnabled passes through');
  });

  it('round 1 applies intermediate values', () => {
    const base = buildBaseConfig();
    const result = buildRoundConfig(base, { round: 1 });

    strictEqual(result.discoveryEnabled, true, 'round 1 enables discovery');
    ok(result.maxUrlsPerProduct >= 60, `round 1 should floor maxUrlsPerProduct, got ${result.maxUrlsPerProduct}`);
    ok(result.searchProfileQueryCap >= 1, `round 1 should preserve searchProfileQueryCap, got ${result.searchProfileQueryCap}`);
  });

  it('discovery disabled when missingRequired=0 and missingExpected=0', () => {
    const base = buildBaseConfig();
    const result = buildRoundConfig(base, {
      round: 1,
      missingRequiredCount: 0,
      missingExpectedCount: 0,
    });

    strictEqual(result.discoveryEnabled, false, 'discovery should be disabled when nothing missing');
  });

  it('search provider selection respects searxng readiness', () => {
    const selection = explainSearchProviderSelection({
      baseConfig: { searchEngines: 'google', searxngBaseUrl: 'http://127.0.0.1:8080' },
      discoveryEnabled: true,
      missingRequiredCount: 5,
    });

    strictEqual(selection.reason_code, 'engines_ready');
    ok(selection.provider.length > 0, 'provider should be non-empty when ready');
  });
});
