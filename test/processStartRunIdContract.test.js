import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

import { registerInfraRoutes } from '../src/app/api/routes/infraRoutes.js';

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    listDirs: async () => [],
    canonicalSlugify: (value) => String(value || '').trim().toLowerCase(),
    HELPER_ROOT: path.resolve('category_authority'),
    DIST_ROOT: path.resolve('gui-dist'),
    OUTPUT_ROOT: path.resolve('out'),
    INDEXLAB_ROOT: path.resolve('indexlab'),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    path,
    getSearxngStatus: async () => ({ ok: true }),
    startSearxngStack: async () => ({ ok: true }),
    startProcess: () => ({ running: true }),
    stopProcess: async () => ({ running: false }),
    processStatus: () => ({ running: false }),
    isProcessRunning: () => false,
    waitForProcessExit: async () => true,
    broadcastWs: () => {},
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    ...overrides,
  };
}

test('process/start returns deterministic run_id and forwards --run-id to CLI spawn args', async () => {
  let capturedArgs = null;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
    }),
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(typeof result.body?.run_id, 'string');
  assert.equal(result.body.run_id.length > 0, true);
  assert.equal(result.body.runId, result.body.run_id);

  assert.ok(Array.isArray(capturedArgs), 'startProcess should receive CLI args');
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(runIdIndex >= 0, true, 'CLI args should include --run-id');
  assert.equal(capturedArgs[runIdIndex + 1], result.body.run_id, 'CLI --run-id should match response run_id');
});

test('process/start honors valid requestedRunId input', async () => {
  let capturedArgs = null;
  const requestedRunId = '20260225-abc123';
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
      requestedRunId,
    }),
    startProcess: (_cmd, cliArgs) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      return { running: true, run_id: requestedRunId, runId: requestedRunId };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, requestedRunId);
  assert.equal(result.body?.runId, requestedRunId);
  const runIdIndex = capturedArgs.indexOf('--run-id');
  assert.equal(capturedArgs[runIdIndex + 1], requestedRunId);
});

test('process/status returns run_id passthrough from processStatus payload', async () => {
  const handler = registerInfraRoutes(makeCtx({
    processStatus: () => ({
      running: true,
      run_id: '20260225-feedaa',
      runId: '20260225-feedaa',
    }),
  }));

  const result = await handler(['process', 'status'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body?.run_id, '20260225-feedaa');
  assert.equal(result.body?.runId, '20260225-feedaa');
});

test('process/start fails fast when generated field rules are missing for category', async () => {
  let started = false;
  const helperRoot = path.resolve('category_authority');
  const expectedMissingPaths = new Set([
    path.resolve(path.join(helperRoot, 'mouse', '_generated', 'field_rules.json')),
    path.resolve(path.join(helperRoot, 'mouse', '_generated', 'field_rules.runtime.json')),
  ]);
  const handler = registerInfraRoutes(makeCtx({
    HELPER_ROOT: helperRoot,
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
    }),
    fs: {
      access: async (targetPath) => {
        if (expectedMissingPaths.has(path.resolve(String(targetPath || '')))) {
          const error = new Error('missing');
          error.code = 'ENOENT';
          throw error;
        }
      },
      mkdir: async () => {},
    },
    startProcess: () => {
      started = true;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 409);
  assert.equal(result.body?.error, 'missing_generated_field_rules');
  assert.match(String(result.body?.message || ''), /field_rules\.json/i);
  assert.equal(started, false, 'process should not start without generated field rules');
});

test('process/start validates generated field rules against effective helper root override', async () => {
  let started = false;
  const helperRoot = path.resolve('category_authority');
  const overrideRoot = path.resolve('category_authority');
  const missingForOverride = new Set([
    path.resolve(path.join(overrideRoot, 'mouse', '_generated', 'field_rules.json')),
    path.resolve(path.join(overrideRoot, 'mouse', '_generated', 'field_rules.runtime.json')),
  ]);
  const handler = registerInfraRoutes(makeCtx({
    HELPER_ROOT: helperRoot,
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro-black',
      categoryAuthorityRoot: overrideRoot,
    }),
    fs: {
      access: async (targetPath) => {
        const resolved = path.resolve(String(targetPath || ''));
        if (missingForOverride.has(resolved)) {
          const error = new Error('missing');
          error.code = 'ENOENT';
          throw error;
        }
      },
      mkdir: async () => {},
    },
    startProcess: () => {
      started = true;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 409);
  assert.equal(result.body?.error, 'missing_generated_field_rules');
  assert.equal(started, false, 'process should fail before spawn when helper root override lacks generated field rules');
});

test('process/start forwards helper root override to category-authority env aliases', async () => {
  let capturedEnv = null;
  const helperRoot = path.resolve('category_authority');
  const overrideRoot = path.resolve('category_authority');
  const handler = registerInfraRoutes(makeCtx({
    HELPER_ROOT: helperRoot,
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro-black',
      categoryAuthorityRoot: overrideRoot,
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, _cliArgs, envOverrides) => {
      capturedEnv = envOverrides;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(capturedEnv?.HELPER_FILES_ROOT, overrideRoot);
  assert.equal(capturedEnv?.CATEGORY_AUTHORITY_ROOT, overrideRoot);
});

test('process/start uses enabled local storage root as canonical run-data destination', async () => {
  let capturedArgs = null;
  let capturedEnv = null;
  const storageRoot = path.resolve('C:/SpecFactoryRuns');
  const expectedOutputRoot = path.join(storageRoot, 'output');
  const expectedIndexLabRoot = path.join(storageRoot, 'indexlab');
  const expectedSpecDbDir = path.join(storageRoot, '.specfactory_tmp');
  const expectedLlmCacheDir = path.join(expectedSpecDbDir, 'llm_cache');
  const handler = registerInfraRoutes(makeCtx({
    runDataStorageState: {
      enabled: true,
      destinationType: 'local',
      localDirectory: storageRoot,
    },
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
      localOutputRoot: path.resolve('ignored-local-output-root'),
      indexlabOut: path.resolve('ignored-indexlab-root'),
      specDbDir: path.resolve('ignored-spec-db-root'),
      llmExtractionCacheDir: path.resolve('ignored-llm-cache-root'),
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, cliArgs, envOverrides) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(capturedEnv?.LOCAL_OUTPUT_ROOT, expectedOutputRoot);
  assert.equal(capturedEnv?.SPEC_DB_DIR, expectedSpecDbDir);
  assert.equal(capturedEnv?.LLM_EXTRACTION_CACHE_DIR, expectedLlmCacheDir);
  assert.ok(Array.isArray(capturedArgs), 'startProcess should receive CLI args');
  const outIndex = capturedArgs.indexOf('--out');
  assert.equal(outIndex >= 0, true, 'CLI args should include --out when local storage is enabled');
  assert.equal(capturedArgs[outIndex + 1], expectedIndexLabRoot);
});

test('process/start uses temp staging db and cache roots when enabled s3 storage is active', async () => {
  let capturedEnv = null;
  const expectedSpecDbDir = path.join(os.tmpdir(), 'spec-factory', '.specfactory_tmp');
  const expectedLlmCacheDir = path.join(expectedSpecDbDir, 'llm_cache');
  const handler = registerInfraRoutes(makeCtx({
    OUTPUT_ROOT: path.join(os.tmpdir(), 'spec-factory', 'output'),
    runDataStorageState: {
      enabled: true,
      destinationType: 's3',
      localDirectory: '',
      awsRegion: 'us-east-2',
      s3Bucket: 'my-spec-harvester-data',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: 'test-access-key',
      s3SecretAccessKey: 'test-secret-key',
      s3SessionToken: '',
    },
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-razer-viper-v3-pro',
      specDbDir: path.resolve('ignored-spec-db-root'),
      llmExtractionCacheDir: path.resolve('ignored-llm-cache-root'),
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, _cliArgs, envOverrides) => {
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(capturedEnv?.SPEC_DB_DIR, expectedSpecDbDir);
  assert.equal(capturedEnv?.LLM_EXTRACTION_CACHE_DIR, expectedLlmCacheDir);
});

test('process/start defaults child run roots to GUI runtime roots when request omits overrides', async () => {
  let capturedArgs = null;
  let capturedEnv = null;
  const expectedOutputRoot = path.resolve('gui-output-root');
  const expectedIndexLabRoot = path.resolve('gui-indexlab-root');
  const handler = registerInfraRoutes(makeCtx({
    OUTPUT_ROOT: expectedOutputRoot,
    INDEXLAB_ROOT: expectedIndexLabRoot,
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      seed: 'Razer Viper V3 Pro',
      brand: 'Razer',
      model: 'Viper V3 Pro',
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, cliArgs, envOverrides) => {
      capturedArgs = Array.isArray(cliArgs) ? [...cliArgs] : [];
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(capturedEnv?.LOCAL_OUTPUT_ROOT, expectedOutputRoot);
  assert.ok(Array.isArray(capturedArgs), 'startProcess should receive CLI args');
  const outIndex = capturedArgs.indexOf('--out');
  assert.equal(outIndex >= 0, true, 'CLI args should include --out when GUI runtime roots are available');
  assert.equal(capturedArgs[outIndex + 1], expectedIndexLabRoot);
});

test('process/start forwards representative runtime override families into child env', async () => {
  let capturedEnv = null;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      localMode: true,
      dryRun: true,
      mirrorToS3: false,
      mirrorToS3Input: true,
      localInputRoot: path.resolve('fixtures', 'input'),
      localOutputRoot: path.resolve('fixtures', 'output'),
      runtimeEventsKey: '_runtime/custom-events.jsonl',
      writeMarkdownSummary: false,
      llmWriteSummary: true,
      awsRegion: 'us-west-2',
      s3Bucket: 'spec-bucket',
      s3InputPrefix: 'specs/input',
      s3OutputPrefix: 'specs/output',
      eloSupabaseAnonKey: 'anon-key',
      eloSupabaseEndpoint: 'https://elo.test/rest/v1',
      llmProvider: 'openai',
      llmBaseUrl: 'http://llm.test',
      openaiApiKey: 'sk-openai',
      anthropicApiKey: 'sk-anthropic',
      fetchSchedulerEnabled: false,
      preferHttpFetcher: true,
      frontierDbPath: 'runtime/frontier.json',
      frontierEnableSqlite: true,
      frontierRepairSearchEnabled: true,
      pdfPreferredBackend: 'camelot',
      capturePageScreenshotEnabled: true,
      capturePageScreenshotFormat: 'png',
      capturePageScreenshotSelectors: 'main,.spec-sheet',
      runtimeCaptureScreenshots: true,
      articleExtractorV2Enabled: true,
      staticDomExtractorEnabled: true,
      staticDomMode: 'cheerio',
      runtimeTraceFetchRing: 55,
      runtimeTraceLlmRing: 77,
      runtimeTraceLlmPayloads: true,
      eventsJsonWrite: true,
      queueJsonWrite: true,
      daemonConcurrency: 3,
      daemonGracefulShutdownTimeoutMs: 2500,
      importsRoot: './imports',
      importsPollSeconds: 12,
      runtimeScreencastEnabled: true,
      runtimeScreencastFps: 15,
      runtimeScreencastQuality: 80,
      runtimeScreencastMaxWidth: 1920,
      runtimeScreencastMaxHeight: 1080,
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, _cliArgs, envOverrides) => {
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);

  assert.equal(capturedEnv?.LOCAL_MODE, 'true');
  assert.equal(capturedEnv?.DRY_RUN, 'true');
  assert.equal(capturedEnv?.MIRROR_TO_S3, 'false');
  assert.equal(capturedEnv?.MIRROR_TO_S3_INPUT, 'true');
  assert.equal(capturedEnv?.LOCAL_INPUT_ROOT, path.resolve('fixtures', 'input'));
  assert.equal(capturedEnv?.LOCAL_OUTPUT_ROOT, path.resolve('fixtures', 'output'));
  assert.equal(capturedEnv?.RUNTIME_EVENTS_KEY, '_runtime/custom-events.jsonl');
  assert.equal(capturedEnv?.WRITE_MARKDOWN_SUMMARY, 'false');
  assert.equal(capturedEnv?.LLM_WRITE_SUMMARY, 'true');
  assert.equal(capturedEnv?.AWS_REGION, 'us-west-2');
  assert.equal(capturedEnv?.S3_BUCKET, 'spec-bucket');
  assert.equal(capturedEnv?.S3_INPUT_PREFIX, 'specs/input');
  assert.equal(capturedEnv?.S3_OUTPUT_PREFIX, 'specs/output');
  assert.equal(capturedEnv?.ELO_SUPABASE_ANON_KEY, 'anon-key');
  assert.equal(capturedEnv?.ELO_SUPABASE_ENDPOINT, 'https://elo.test/rest/v1');
  assert.equal(capturedEnv?.LLM_PROVIDER, 'openai');
  assert.equal(capturedEnv?.LLM_BASE_URL, 'http://llm.test');
  assert.equal(capturedEnv?.OPENAI_API_KEY, 'sk-openai');
  assert.equal(capturedEnv?.ANTHROPIC_API_KEY, 'sk-anthropic');

  assert.equal(capturedEnv?.FETCH_SCHEDULER_ENABLED, 'false');
  assert.equal(capturedEnv?.PREFER_HTTP_FETCHER, 'true');
  assert.equal(capturedEnv?.FRONTIER_DB_PATH, 'runtime/frontier.json');
  assert.equal(capturedEnv?.FRONTIER_ENABLE_SQLITE, 'true');
  assert.equal(capturedEnv?.FRONTIER_REPAIR_SEARCH_ENABLED, 'true');
  assert.equal(capturedEnv?.PDF_PREFERRED_BACKEND, 'camelot');
  assert.equal(capturedEnv?.CAPTURE_PAGE_SCREENSHOT_ENABLED, 'true');
  assert.equal(capturedEnv?.CAPTURE_PAGE_SCREENSHOT_FORMAT, 'png');
  assert.equal(capturedEnv?.CAPTURE_PAGE_SCREENSHOT_SELECTORS, 'main,.spec-sheet');
  assert.equal(capturedEnv?.RUNTIME_CAPTURE_SCREENSHOTS, 'true');
  assert.equal(capturedEnv?.ARTICLE_EXTRACTOR_V2, 'true');
  assert.equal(capturedEnv?.STATIC_DOM_EXTRACTOR_ENABLED, 'true');
  assert.equal(capturedEnv?.STATIC_DOM_MODE, 'cheerio');

  assert.equal(capturedEnv?.RUNTIME_TRACE_FETCH_RING, '55');
  assert.equal(capturedEnv?.RUNTIME_TRACE_LLM_RING, '77');
  assert.equal(capturedEnv?.RUNTIME_TRACE_LLM_PAYLOADS, 'true');
  assert.equal(capturedEnv?.EVENTS_JSON_WRITE, 'true');
  assert.equal(capturedEnv?.QUEUE_JSON_WRITE, 'true');
  assert.equal(capturedEnv?.DAEMON_CONCURRENCY, '3');
  assert.equal(capturedEnv?.DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS, '2500');
  assert.equal(capturedEnv?.IMPORTS_ROOT, './imports');
  assert.equal(capturedEnv?.IMPORTS_POLL_SECONDS, '12');

  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_ENABLED, 'true');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_FPS, '15');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_QUALITY, '80');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_MAX_WIDTH, '1920');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_MAX_HEIGHT, '1080');
});

test('process/start clamps representative runtime numeric env overrides before spawn', async () => {
  let capturedEnv = null;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      fetchPerHostConcurrencyCap: 999,
      pageGotoTimeoutMs: 999999,
      frontierBlockedDomainThreshold: 999,
      maxPdfBytes: 999999999,
      runtimeTraceFetchRing: 999999,
      runtimeTraceLlmRing: 999999,
      daemonConcurrency: 999,
      daemonGracefulShutdownTimeoutMs: 999999999,
      importsPollSeconds: 999999,
      runtimeScreencastFps: 999,
      runtimeScreencastQuality: 999,
      runtimeScreencastMaxWidth: 999999,
      runtimeScreencastMaxHeight: 999999,
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, _cliArgs, envOverrides) => {
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);

  assert.equal(capturedEnv?.FETCH_PER_HOST_CONCURRENCY_CAP, '64');
  assert.equal(capturedEnv?.PAGE_GOTO_TIMEOUT_MS, '120000');
  assert.equal(capturedEnv?.FRONTIER_BLOCKED_DOMAIN_THRESHOLD, '50');
  assert.equal(capturedEnv?.MAX_PDF_BYTES, '100000000');
  assert.equal(capturedEnv?.RUNTIME_TRACE_FETCH_RING, '2000');
  assert.equal(capturedEnv?.RUNTIME_TRACE_LLM_RING, '2000');
  assert.equal(capturedEnv?.DAEMON_CONCURRENCY, '128');
  assert.equal(capturedEnv?.DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS, '600000');
  assert.equal(capturedEnv?.IMPORTS_POLL_SECONDS, '3600');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_FPS, '60');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_QUALITY, '100');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_MAX_WIDTH, '3840');
  assert.equal(capturedEnv?.RUNTIME_SCREENCAST_MAX_HEIGHT, '2160');
});

test('process/start ignores retired and not-implemented runtime env knobs', async () => {
  let capturedEnv = null;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      localMode: true,
      discoveryResultsPerQuery: 99,
      discoveryQueryConcurrency: 16,
      phase3LlmTriageEnabled: true,
      llmSerpRerankEnabled: true,
      serpTriageEnabled: true,
      workersSearch: 8,
      workersFetch: 6,
      workersParse: 4,
      workersLlm: 2,
      workerHealthCheckIntervalMs: 1_000,
      workerRestartBackoffMs: 2_000,
      blockRate429Threshold: 0.6,
      maxBatchSizeConfirmation: 20,
      maxParallelProductWorkers: 12,
      chartVisionFallbackEnabled: true,
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: (_cmd, _cliArgs, envOverrides) => {
      capturedEnv = { ...(envOverrides || {}) };
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(capturedEnv?.LOCAL_MODE, 'true');

  for (const forbiddenEnvKey of [
    'DISCOVERY_RESULTS_PER_QUERY',
    'DISCOVERY_QUERY_CONCURRENCY',
    'LLM_SERP_RERANK_ENABLED',
    'SERP_TRIAGE_ENABLED',
    'PHASE3_LLM_TRIAGE_ENABLED',
    'WORKERS_SEARCH',
    'WORKERS_FETCH',
    'WORKERS_PARSE',
    'WORKERS_LLM',
    'WORKER_HEALTH_CHECK_INTERVAL_MS',
    'WORKER_RESTART_BACKOFF_MS',
    '429_BLOCK_RATE_THRESHOLD',
    'MAX_BATCH_SIZE_CONFIRMATION',
    'MAX_PARALLEL_PRODUCT_WORKERS',
    'CHART_VISION_FALLBACK_ENABLED',
  ]) {
    assert.equal(
      Object.hasOwn(capturedEnv, forbiddenEnvKey),
      false,
      `process/start should not forward retired or not-implemented env ${forbiddenEnvKey}`,
    );
  }
});

test('process/start rejects unsupported search providers before spawn', async () => {
  let started = false;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      searchProvider: 'duckduckgo',
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: () => {
      started = true;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 400);
  assert.equal(result.body?.error, 'invalid_search_provider');
  assert.equal(started, false, 'process should not start when search provider is invalid');
});

test('process/start rejects invalid dynamic fetch policy JSON before spawn', async () => {
  let started = false;
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({
      category: 'mouse',
      mode: 'indexlab',
      productId: 'mouse-acme-orbit-x1',
      dynamicFetchPolicyMapJson: '{bad json',
    }),
    fs: {
      access: async () => {},
      mkdir: async () => {},
    },
    startProcess: () => {
      started = true;
      return { running: true };
    },
  }));

  const result = await handler(['process', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 400);
  assert.equal(result.body?.error, 'invalid_dynamic_fetch_policy_json');
  assert.equal(started, false, 'process should not start when dynamic fetch policy JSON is invalid');
});
