import path from 'node:path';

import { defaultLocalOutputRoot } from '../../../../core/config/runtimeArtifactRoots.js';
import { buildRunId } from '../../../../utils/common.js';

function buildError(status, body) {
  return { ok: false, status, body };
}

function resolveStorageBackedRunRoots({
  runDataStorageState,
  outputRoot,
  pathApi,
  defaultLocalOutputRootFn,
}) {
  const state = runDataStorageState && typeof runDataStorageState === 'object'
    ? runDataStorageState
    : {};
  if (state.enabled !== true) return null;

  const destinationType = String(state.destinationType || '').trim().toLowerCase();
  if (destinationType === 's3') {
    const stagingRoot = pathApi.dirname(pathApi.resolve(String(outputRoot || defaultLocalOutputRootFn())));
    const workspaceRoot = pathApi.join(stagingRoot, '.specfactory_tmp');
    return {
      specDbDir: workspaceRoot,
      llmExtractionCacheDir: pathApi.join(workspaceRoot, 'llm_cache'),
    };
  }

  if (destinationType !== 'local') return null;
  const localDirectory = String(state.localDirectory || '').trim();
  if (!localDirectory) return null;

  const root = pathApi.resolve(localDirectory);
  const workspaceRoot = pathApi.join(root, '.specfactory_tmp');
  return {
    outputRoot: pathApi.join(root, 'output'),
    indexLabRoot: pathApi.join(root, 'indexlab'),
    specDbDir: workspaceRoot,
    llmExtractionCacheDir: pathApi.join(workspaceRoot, 'llm_cache'),
  };
}

function assignBoolean(envOverrides, envKey, value) {
  if (typeof value !== 'boolean') return;
  envOverrides[envKey] = value ? 'true' : 'false';
}

function assignString(envOverrides, envKey, value) {
  if (value === undefined || value === null) return;
  const normalized = String(value || '').trim();
  if (!normalized) return;
  envOverrides[envKey] = normalized;
}

function assignInt(envOverrides, envKey, value, { minInput = Number.NEGATIVE_INFINITY, minClamp = minInput, maxClamp = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < minInput) return;
  envOverrides[envKey] = String(Math.max(minClamp, Math.min(maxClamp, parsed)));
}

function normalizeJoinedList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join(',');
  }
  return String(value || '').trim();
}

function assignJsonObject(envOverrides, envKey, value, errorCode, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      return buildError(400, {
        error: errorCode,
        message: `${fieldName} must be a JSON object.`,
      });
    }
    envOverrides[envKey] = JSON.stringify(parsed);
    return null;
  } catch {
    return buildError(400, {
      error: errorCode,
      message: `${fieldName} must be valid JSON.`,
    });
  }
}

export function buildProcessStartLaunchPlan(options = {}) {
  const {
    body = {},
    helperRoot = '',
    outputRoot = '',
    indexLabRoot = '',
    runDataStorageState = {},
    env = process.env,
    pathApi = path,
    buildRunIdFn = buildRunId,
    defaultLocalOutputRootFn = defaultLocalOutputRoot,
  } = options;

  const {
    category,
    productId,
    brand,
    model: modelName,
    variant,
    sku,
    seedUrls,
    mode = 'indexlab',
    profile,
    dryRun,
    fetchPerHostConcurrencyCap,
    fetchSchedulerEnabled,
    preferHttpFetcher,
    pageGotoTimeoutMs,
    frontierDbPath,
    frontierEnableSqlite,
    frontierRepairSearchEnabled,
    frontierBlockedDomainThreshold,
    dynamicFetchPolicyMapJson,
    runtimeTraceFetchRing,
    runtimeTraceLlmRing,
    runtimeTraceLlmPayloads,
    eventsJsonWrite,
    queueJsonWrite,
    daemonConcurrency,
    daemonGracefulShutdownTimeoutMs,
    importsRoot,
    importsPollSeconds,
    runtimeScreencastEnabled,
    runtimeScreencastFps,
    runtimeScreencastQuality,
    runtimeScreencastMaxWidth,
    runtimeScreencastMaxHeight,
    discoveryEnabled,
    fetchCandidateSources,
    maxPdfBytes,
    pdfPreferredBackend,
    capturePageScreenshotEnabled,
    capturePageScreenshotFormat,
    capturePageScreenshotSelectors,
    articleExtractorV2Enabled,
    staticDomExtractorEnabled,
    staticDomMode,
    specDbDir,
    ['helper' + 'FilesRoot']: legacyHelperFilesRoot,
    outputMode,
    localMode,
    mirrorToS3,
    mirrorToS3Input,
    localInputRoot,
    localOutputRoot,
    runtimeEventsKey,
    writeMarkdownSummary,
    awsRegion,
    s3Bucket,
    s3InputPrefix,
    s3OutputPrefix,
    eloSupabaseAnonKey,
    eloSupabaseEndpoint,
    llmWriteSummary,
    llmProvider,
    llmBaseUrl,
    openaiApiKey,
    anthropicApiKey,
    searchProvider,
    llmModelPlan,
    llmModelFast,
    llmModelTriage,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
    llmMaxOutputTokensPlan,
    llmMaxOutputTokensFast,
    llmMaxOutputTokensTriage,
    llmMaxOutputTokensReasoning,
    llmMaxOutputTokensExtract,
    llmMaxOutputTokensValidate,
    llmMaxOutputTokensWrite,
    llmFallbackEnabled,
    llmPlanFallbackModel,
    llmExtractFallbackModel,
    llmValidateFallbackModel,
    llmWriteFallbackModel,
    llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensExtractFallback,
    llmMaxOutputTokensValidateFallback,
    llmMaxOutputTokensWriteFallback,
    llmExtractionCacheDir,
    seed,
    fields,
    providers,
    indexlabOut,
    replaceRunning = true,
  } = body;

  const cat = category || 'mouse';
  const categoryAuthorityEnabled = (
    typeof body?.categoryAuthorityEnabled === 'boolean'
      ? body.categoryAuthorityEnabled
      : true
  );
  const categoryAuthorityRoot = String(
    body?.categoryAuthorityRoot
    || legacyHelperFilesRoot
    || '',
  ).trim();

  if (String(mode || 'indexlab').trim() !== 'indexlab') {
    return buildError(400, {
      error: 'unsupported_process_mode',
      message: 'Only indexlab mode is supported in GUI process/start.',
    });
  }

  const effectiveHelperRoot = categoryAuthorityRoot
    ? pathApi.resolve(categoryAuthorityRoot)
    : pathApi.resolve(String(env.CATEGORY_AUTHORITY_ROOT || env.HELPER_FILES_ROOT || helperRoot || 'category_authority'));
  const generatedRulesCandidates = [
    pathApi.join(effectiveHelperRoot, cat, '_generated', 'field_rules.json'),
    pathApi.join(effectiveHelperRoot, cat, '_generated', 'field_rules.runtime.json'),
  ];

  const rawRequestedRunId = String(body?.requestedRunId || body?.runId || '').trim();
  const requestedRunId = /^[A-Za-z0-9._-]{8,96}$/.test(rawRequestedRunId)
    ? rawRequestedRunId
    : buildRunIdFn();

  const storageBackedRunRoots = resolveStorageBackedRunRoots({
    runDataStorageState,
    outputRoot,
    pathApi,
    defaultLocalOutputRootFn,
  });
  const effectiveIndexLabOut = storageBackedRunRoots?.indexLabRoot || indexlabOut || indexLabRoot || '';
  const effectiveLocalOutputRoot = storageBackedRunRoots?.outputRoot || localOutputRoot || outputRoot || '';
  const effectiveSpecDbDir = storageBackedRunRoots?.specDbDir || specDbDir || '';
  const effectiveLlmExtractionCacheDir = storageBackedRunRoots?.llmExtractionCacheDir || llmExtractionCacheDir || '';

  const cliArgs = ['indexlab', '--local', '--run-id', requestedRunId, '--category', cat];
  if (productId) {
    cliArgs.push('--product-id', String(productId).trim());
  } else if (seed) {
    cliArgs.push('--seed', String(seed).trim());
  }
  if (brand) cliArgs.push('--brand', String(brand).trim());
  if (modelName) cliArgs.push('--model', String(modelName).trim());
  if (variant) cliArgs.push('--variant', String(variant).trim());
  if (sku) cliArgs.push('--sku', String(sku).trim());

  const normalizedSeedUrls = normalizeJoinedList(seedUrls);
  if (normalizedSeedUrls) cliArgs.push('--seed-urls', normalizedSeedUrls);
  const normalizedFields = normalizeJoinedList(fields);
  if (normalizedFields) cliArgs.push('--fields', normalizedFields);
  const normalizedProviders = normalizeJoinedList(providers);
  if (normalizedProviders) cliArgs.push('--providers', normalizedProviders);

  const normalizedSearchProvider = String(searchProvider || '').trim().toLowerCase();
  if (normalizedSearchProvider) {
    const allowedSearchProviders = new Set(['none', 'google', 'bing', 'searxng', 'dual']);
    if (!allowedSearchProviders.has(normalizedSearchProvider)) {
      return buildError(400, {
        error: 'invalid_search_provider',
        message: `Unsupported searchProvider '${normalizedSearchProvider}'.`,
      });
    }
    cliArgs.push('--search-provider', normalizedSearchProvider);
  }

  if (effectiveIndexLabOut) {
    cliArgs.push('--out', String(effectiveIndexLabOut).trim());
  }
  if (profile && ['fast', 'standard', 'thorough'].includes(profile)) {
    cliArgs.push('--profile', profile);
  }
  if (dryRun) {
    cliArgs.push('--dry-run');
  }

  const envOverrides = {
    FETCH_SCHEDULER_ENABLED: 'true',
    PREFER_HTTP_FETCHER: 'false',
    DYNAMIC_CRAWLEE_ENABLED: 'false',
  };

  assignBoolean(envOverrides, 'FETCH_CANDIDATE_SOURCES', fetchCandidateSources);
  assignInt(envOverrides, 'MAX_PDF_BYTES', maxPdfBytes, { minInput: 1024, minClamp: 1024, maxClamp: 100_000_000 });
  assignString(envOverrides, 'SPEC_DB_DIR', effectiveSpecDbDir);
  assignString(envOverrides, 'LLM_EXTRACTION_CACHE_DIR', effectiveLlmExtractionCacheDir);
  assignBoolean(envOverrides, 'HELPER_FILES_ENABLED', categoryAuthorityEnabled);
  if (categoryAuthorityRoot) {
    envOverrides.HELPER_FILES_ROOT = categoryAuthorityRoot;
    envOverrides.CATEGORY_AUTHORITY_ROOT = categoryAuthorityRoot;
  }

  const jsonResult = assignJsonObject(
    envOverrides,
    'DYNAMIC_FETCH_POLICY_MAP_JSON',
    dynamicFetchPolicyMapJson,
    'invalid_dynamic_fetch_policy_json',
    'dynamicFetchPolicyMapJson',
  );
  if (jsonResult) return jsonResult;

  const normalizedOutputMode = String(outputMode || '').trim().toLowerCase();
  if (['local', 'dual', 's3'].includes(normalizedOutputMode)) {
    envOverrides.OUTPUT_MODE = normalizedOutputMode;
  }
  assignBoolean(envOverrides, 'LOCAL_MODE', localMode);
  assignBoolean(envOverrides, 'DRY_RUN', dryRun);
  assignBoolean(envOverrides, 'MIRROR_TO_S3', mirrorToS3);
  assignBoolean(envOverrides, 'MIRROR_TO_S3_INPUT', mirrorToS3Input);
  assignString(envOverrides, 'LOCAL_INPUT_ROOT', localInputRoot);
  assignString(envOverrides, 'LOCAL_OUTPUT_ROOT', effectiveLocalOutputRoot);
  assignString(envOverrides, 'RUNTIME_EVENTS_KEY', runtimeEventsKey);
  assignBoolean(envOverrides, 'WRITE_MARKDOWN_SUMMARY', writeMarkdownSummary);
  assignBoolean(envOverrides, 'LLM_WRITE_SUMMARY', llmWriteSummary);
  assignString(envOverrides, 'AWS_REGION', awsRegion);
  assignString(envOverrides, 'S3_BUCKET', s3Bucket);
  assignString(envOverrides, 'S3_INPUT_PREFIX', s3InputPrefix);
  assignString(envOverrides, 'S3_OUTPUT_PREFIX', s3OutputPrefix);
  assignString(envOverrides, 'ELO_SUPABASE_ANON_KEY', eloSupabaseAnonKey);
  assignString(envOverrides, 'ELO_SUPABASE_ENDPOINT', eloSupabaseEndpoint);
  assignString(envOverrides, 'LLM_PROVIDER', llmProvider);
  assignString(envOverrides, 'LLM_BASE_URL', llmBaseUrl);
  assignString(envOverrides, 'OPENAI_API_KEY', openaiApiKey);
  assignString(envOverrides, 'ANTHROPIC_API_KEY', anthropicApiKey);

  assignBoolean(envOverrides, 'FETCH_SCHEDULER_ENABLED', fetchSchedulerEnabled);
  assignBoolean(envOverrides, 'PREFER_HTTP_FETCHER', preferHttpFetcher);
  assignString(envOverrides, 'FRONTIER_DB_PATH', frontierDbPath);
  assignBoolean(envOverrides, 'FRONTIER_ENABLE_SQLITE', frontierEnableSqlite);
  assignBoolean(envOverrides, 'FRONTIER_REPAIR_SEARCH_ENABLED', frontierRepairSearchEnabled);
  assignInt(envOverrides, 'FRONTIER_BLOCKED_DOMAIN_THRESHOLD', frontierBlockedDomainThreshold, { minInput: 1, minClamp: 1, maxClamp: 50 });
  assignInt(envOverrides, 'FETCH_PER_HOST_CONCURRENCY_CAP', fetchPerHostConcurrencyCap, { minInput: 1, minClamp: 1, maxClamp: 64 });
  assignInt(envOverrides, 'PAGE_GOTO_TIMEOUT_MS', pageGotoTimeoutMs, { minInput: 0, minClamp: 0, maxClamp: 120_000 });

  assignString(envOverrides, 'PDF_PREFERRED_BACKEND', pdfPreferredBackend);
  assignBoolean(envOverrides, 'CAPTURE_PAGE_SCREENSHOT_ENABLED', capturePageScreenshotEnabled);
  assignString(envOverrides, 'CAPTURE_PAGE_SCREENSHOT_FORMAT', capturePageScreenshotFormat);
  assignString(envOverrides, 'CAPTURE_PAGE_SCREENSHOT_SELECTORS', capturePageScreenshotSelectors);
  assignBoolean(envOverrides, 'ARTICLE_EXTRACTOR_V2', articleExtractorV2Enabled);
  assignBoolean(envOverrides, 'STATIC_DOM_EXTRACTOR_ENABLED', staticDomExtractorEnabled);
  assignString(envOverrides, 'STATIC_DOM_MODE', staticDomMode);

  assignInt(envOverrides, 'RUNTIME_TRACE_FETCH_RING', runtimeTraceFetchRing, { minInput: 10, minClamp: 10, maxClamp: 2000 });
  assignInt(envOverrides, 'RUNTIME_TRACE_LLM_RING', runtimeTraceLlmRing, { minInput: 10, minClamp: 10, maxClamp: 2000 });
  assignBoolean(envOverrides, 'RUNTIME_TRACE_LLM_PAYLOADS', runtimeTraceLlmPayloads);
  assignBoolean(envOverrides, 'EVENTS_JSON_WRITE', eventsJsonWrite);
  assignBoolean(envOverrides, 'QUEUE_JSON_WRITE', queueJsonWrite);
  assignInt(envOverrides, 'DAEMON_CONCURRENCY', daemonConcurrency, { minInput: 1, minClamp: 1, maxClamp: 128 });
  assignInt(envOverrides, 'DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS', daemonGracefulShutdownTimeoutMs, { minInput: 1000, minClamp: 1000, maxClamp: 600_000 });
  assignString(envOverrides, 'IMPORTS_ROOT', importsRoot);
  assignInt(envOverrides, 'IMPORTS_POLL_SECONDS', importsPollSeconds, { minInput: 1, minClamp: 1, maxClamp: 3600 });
  assignBoolean(envOverrides, 'RUNTIME_SCREENCAST_ENABLED', runtimeScreencastEnabled);
  assignInt(envOverrides, 'RUNTIME_SCREENCAST_FPS', runtimeScreencastFps, { minInput: 1, minClamp: 1, maxClamp: 60 });
  assignInt(envOverrides, 'RUNTIME_SCREENCAST_QUALITY', runtimeScreencastQuality, { minInput: 10, minClamp: 10, maxClamp: 100 });
  assignInt(envOverrides, 'RUNTIME_SCREENCAST_MAX_WIDTH', runtimeScreencastMaxWidth, { minInput: 320, minClamp: 320, maxClamp: 3840 });
  assignInt(envOverrides, 'RUNTIME_SCREENCAST_MAX_HEIGHT', runtimeScreencastMaxHeight, { minInput: 240, minClamp: 240, maxClamp: 2160 });

  const applyModelOverride = (envKey, value, { allowEmpty = false } = {}) => {
    if (value === undefined || value === null) return false;
    const token = String(value || '').trim();
    if (!token && !allowEmpty) return false;
    envOverrides[envKey] = token;
    return Boolean(token);
  };
  const applyTokenOverride = (envKey, value) => {
    if (value === undefined || value === null || value === '') return false;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return false;
    envOverrides[envKey] = String(parsed);
    return true;
  };

  const hasRoleModelOverride = [
    applyModelOverride('LLM_MODEL_PLAN', llmModelPlan),
    applyModelOverride('LLM_MODEL_FAST', llmModelFast),
    applyModelOverride('LLM_MODEL_TRIAGE', llmModelTriage),
    applyModelOverride('LLM_MODEL_REASONING', llmModelReasoning),
    applyModelOverride('LLM_MODEL_EXTRACT', llmModelExtract),
    applyModelOverride('LLM_MODEL_VALIDATE', llmModelValidate),
    applyModelOverride('LLM_MODEL_WRITE', llmModelWrite),
  ].some(Boolean);

  const normalizedTriageForCortex = String(llmModelTriage || '').trim();
  if (normalizedTriageForCortex) {
    if (!envOverrides.CORTEX_MODEL_RERANK_FAST) {
      envOverrides.CORTEX_MODEL_RERANK_FAST = normalizedTriageForCortex;
    }
    if (!envOverrides.CORTEX_MODEL_SEARCH_FAST) {
      envOverrides.CORTEX_MODEL_SEARCH_FAST = normalizedTriageForCortex;
    }
  }

  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_PLAN', llmMaxOutputTokensPlan);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_FAST', llmMaxOutputTokensFast);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_TRIAGE', llmMaxOutputTokensTriage);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_REASONING', llmMaxOutputTokensReasoning);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_EXTRACT', llmMaxOutputTokensExtract);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_VALIDATE', llmMaxOutputTokensValidate);
  applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_WRITE', llmMaxOutputTokensWrite);

  if (typeof llmFallbackEnabled === 'boolean' && !llmFallbackEnabled) {
    envOverrides.LLM_PLAN_FALLBACK_MODEL = '';
    envOverrides.LLM_EXTRACT_FALLBACK_MODEL = '';
    envOverrides.LLM_VALIDATE_FALLBACK_MODEL = '';
    envOverrides.LLM_WRITE_FALLBACK_MODEL = '';
    envOverrides.LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK = '';
    envOverrides.LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK = '';
    envOverrides.LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK = '';
    envOverrides.LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK = '';
  } else {
    applyModelOverride('LLM_PLAN_FALLBACK_MODEL', llmPlanFallbackModel, { allowEmpty: true });
    applyModelOverride('LLM_EXTRACT_FALLBACK_MODEL', llmExtractFallbackModel, { allowEmpty: true });
    applyModelOverride('LLM_VALIDATE_FALLBACK_MODEL', llmValidateFallbackModel, { allowEmpty: true });
    applyModelOverride('LLM_WRITE_FALLBACK_MODEL', llmWriteFallbackModel, { allowEmpty: true });
    applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK', llmMaxOutputTokensPlanFallback);
    applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK', llmMaxOutputTokensExtractFallback);
    applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK', llmMaxOutputTokensValidateFallback);
    applyTokenOverride('LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK', llmMaxOutputTokensWriteFallback);
  }


  return {
    ok: true,
    requestedRunId,
    cliArgs,
    envOverrides,
    replaceRunning,
    effectiveHelperRoot,
    generatedRulesCandidates,
  };
}
