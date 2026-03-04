import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

const SETTINGS_DEFAULTS_PATH = path.resolve('src/shared/settingsDefaults.js');
const SETTINGS_CONTRACT_PATH = path.resolve('src/api/services/settingsContract.js');
const RUNTIME_FLOW_PATH = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
const INDEXING_PAGE_PATH = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_DOMAIN_PATH = path.resolve('tools/gui-react/src/stores/runtimeSettingsDomain.ts');
const INFRA_ROUTES_PATH = path.resolve('src/api/routes/infraRoutes.js');

test('advanced parsing/cache/provider knobs are fully wired through defaults, contract, UI, payload, and env bridge', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredStringKeys = [
    'specDbDir',
    'llmPlanApiKey',
    'googleCseKey',
    'bingSearchKey',
    'articleExtractorDomainPolicyMapJson',
    'structuredMetadataExtructUrl',
    'llmExtractionCacheDir',
  ];
  const requiredBoolKeys = [
    'htmlTableExtractorV2',
    'structuredMetadataExtructEnabled',
    'structuredMetadataExtructCacheEnabled',
    'llmExtractionCacheEnabled',
  ];
  const requiredIntKeys = [
    'staticDomMaxEvidenceSnippets',
    'structuredMetadataExtructTimeoutMs',
    'structuredMetadataExtructMaxItemsPerSurface',
    'structuredMetadataExtructCacheLimit',
    'domSnippetMaxChars',
    'llmExtractionCacheTtlMs',
    'llmMaxCallsPerProductTotal',
    'llmMaxCallsPerProductFast',
  ];
  const requiredFloatKeys = [
    'staticDomTargetMatchThreshold',
  ];

  for (const key of requiredStringKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key), true, `runtime PUT string map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`), true, `runtime payload serializer should include normalized string for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredBoolKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key), true, `runtime GET bool map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key), true, `runtime PUT bool map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: input.${key}`), true, `runtime payload serializer should include ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredIntKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), true, `runtime GET int map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), true, `runtime PUT int map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'LLM Plan API Key',
    'Bing Search Key',
    'Google CSE Key',
    'LLM Extraction Cache Enabled',
    'LLM Extraction Cache Dir',
    'LLM Extraction Cache TTL (ms)',
    'LLM Max Calls / Product Total',
    'LLM Max Calls / Product Fast',
    'Article Extractor Domain Policy Map (JSON)',
    'HTML Table Extractor V2',
    'Static DOM Target Match Threshold',
    'Static DOM Max Evidence Snippets',
    'Structured Metadata Extruct Enabled',
    'Structured Metadata Extruct URL',
    'Structured Metadata Extruct Timeout (ms)',
    'Structured Metadata Extruct Max Items / Surface',
    'Structured Metadata Extruct Cache Enabled',
    'Structured Metadata Extruct Cache Limit',
    'DOM Snippet Max Chars',
    'Spec DB Dir',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label=\"${label}\"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'SPEC_DB_DIR',
    'LLM_PLAN_API_KEY',
    'GOOGLE_CSE_KEY',
    'BING_SEARCH_KEY',
    'ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON',
    'HTML_TABLE_EXTRACTOR_V2',
    'STATIC_DOM_TARGET_MATCH_THRESHOLD',
    'STATIC_DOM_MAX_EVIDENCE_SNIPPETS',
    'STRUCTURED_METADATA_EXTRUCT_ENABLED',
    'STRUCTURED_METADATA_EXTRUCT_URL',
    'STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS',
    'STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE',
    'STRUCTURED_METADATA_EXTRUCT_CACHE_ENABLED',
    'STRUCTURED_METADATA_EXTRUCT_CACHE_LIMIT',
    'DOM_SNIPPET_MAX_CHARS',
    'LLM_EXTRACTION_CACHE_ENABLED',
    'LLM_EXTRACTION_CACHE_DIR',
    'LLM_EXTRACTION_CACHE_TTL_MS',
    'LLM_MAX_CALLS_PER_PRODUCT_TOTAL',
    'LLM_MAX_CALLS_PER_PRODUCT_FAST',
  ];
  for (const envKey of requiredEnvKeys) {
    assert.equal(
      infraRoutesText.includes(envKey),
      true,
      `process env override bridge should include ${envKey}`,
    );
  }
});

test('aggressive/cortex backend knobs are fully wired through defaults, contract, UI, payload, and env bridge', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const requiredBoolKeys = [
    'aggressiveModeEnabled',
    'aggressiveEvidenceAuditEnabled',
    'uberAggressiveEnabled',
    'cortexEnabled',
    'cortexAsyncEnabled',
    'cortexAutoStart',
    'cortexAutoRestartOnAuth',
    'cortexEscalateIfConflict',
    'cortexEscalateCriticalOnly',
  ];
  const requiredIntKeys = [
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
    'cortexMaxDeepFieldsPerProduct',
  ];
  const requiredFloatKeys = [
    'aggressiveConfidenceThreshold',
    'cortexEscalateConfidenceLt',
  ];
  const requiredStringKeys = [
    'cortexBaseUrl',
    'cortexApiKey',
    'cortexAsyncBaseUrl',
    'cortexAsyncSubmitPath',
    'cortexAsyncStatusPath',
    'cortexModelFast',
    'cortexModelAudit',
    'cortexModelDom',
    'cortexModelReasoningDeep',
    'cortexModelVision',
    'cortexModelSearchFast',
    'cortexModelRerankFast',
    'cortexModelSearchDeep',
  ];

  for (const key of requiredBoolKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.boolMap || {}, key), true, `runtime GET bool map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.boolMap || {}, key), true, `runtime PUT bool map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: input.${key}`), true, `runtime payload serializer should include ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredIntKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), true, `runtime GET int map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), true, `runtime PUT int map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), true, `runtime payload serializer should include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredStringKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.stringMap || {}, key), true, `runtime GET string map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.stringFreeMap || {}, key), true, `runtime PUT string map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: String(input.${key} || '').trim()`), true, `runtime payload serializer should include normalized string for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  for (const key of requiredFloatKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), true, `runtime defaults should include ${key}`);
    assert.equal(runtimeKeys.has(key), true, `runtime key registry should include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.floatMap || {}, key), true, `runtime GET float map should expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.floatRangeMap || {}, key), true, `runtime PUT float map should expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeFloat(`), true, `runtime payload serializer should include float parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), true, `indexing payload builder should include ${key}`);
  }

  const requiredRuntimeFlowLabels = [
    'Aggressive Mode Enabled',
    'Aggressive Confidence Threshold',
    'Aggressive Max Search Queries',
    'Aggressive Evidence Audit Enabled',
    'Aggressive Evidence Audit Batch Size',
    'Aggressive Max Time / Product (ms)',
    'Aggressive Thorough From Round',
    'Aggressive Round 1 Max URLs',
    'Aggressive Round 1 Max Candidate URLs',
    'Aggressive LLM Max Calls / Round',
    'Aggressive LLM Max Calls / Product',
    'Aggressive LLM Target Max Fields',
    'Aggressive LLM Discovery Passes',
    'Aggressive LLM Discovery Query Cap',
    'Uber Aggressive Enabled',
    'Uber Max Rounds',
    'CORTEX Enabled',
    'CORTEX Async Enabled',
    'CORTEX Base URL',
    'CORTEX API Key',
    'CORTEX Async Base URL',
    'CORTEX Async Submit Path',
    'CORTEX Async Status Path',
    'CORTEX Sync Timeout (ms)',
    'CORTEX Async Poll Interval (ms)',
    'CORTEX Async Max Wait (ms)',
    'CORTEX Ensure Ready Timeout (ms)',
    'CORTEX Start Ready Timeout (ms)',
    'CORTEX Failure Threshold',
    'CORTEX Circuit Open (ms)',
    'CORTEX Model Fast',
    'CORTEX Model Audit',
    'CORTEX Model DOM',
    'CORTEX Model Reasoning Deep',
    'CORTEX Model Vision',
    'CORTEX Model Search Fast',
    'CORTEX Model Rerank Fast',
    'CORTEX Model Search Deep',
    'CORTEX Auto Start',
    'CORTEX Auto Restart On Auth',
    'CORTEX Escalate Confidence <',
    'CORTEX Escalate If Conflict',
    'CORTEX Escalate Critical Only',
    'CORTEX Max Deep Fields / Product',
  ];

  for (const label of requiredRuntimeFlowLabels) {
    assert.equal(
      runtimeFlowText.includes(`label=\"${label}\"`),
      true,
      `runtime flow should expose ${label}`,
    );
  }

  const requiredEnvKeys = [
    'AGGRESSIVE_MODE_ENABLED',
    'AGGRESSIVE_CONFIDENCE_THRESHOLD',
    'AGGRESSIVE_MAX_SEARCH_QUERIES',
    'AGGRESSIVE_EVIDENCE_AUDIT_ENABLED',
    'AGGRESSIVE_EVIDENCE_AUDIT_BATCH_SIZE',
    'AGGRESSIVE_MAX_TIME_PER_PRODUCT_MS',
    'AGGRESSIVE_THOROUGH_FROM_ROUND',
    'AGGRESSIVE_ROUND1_MAX_URLS',
    'AGGRESSIVE_ROUND1_MAX_CANDIDATE_URLS',
    'AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND',
    'AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL',
    'AGGRESSIVE_LLM_TARGET_MAX_FIELDS',
    'AGGRESSIVE_LLM_DISCOVERY_PASSES',
    'AGGRESSIVE_LLM_DISCOVERY_QUERY_CAP',
    'UBER_AGGRESSIVE_ENABLED',
    'UBER_MAX_ROUNDS',
    'CORTEX_ENABLED',
    'CORTEX_ASYNC_ENABLED',
    'CORTEX_BASE_URL',
    'CORTEX_API_KEY',
    'CORTEX_ASYNC_BASE_URL',
    'CORTEX_ASYNC_SUBMIT_PATH',
    'CORTEX_ASYNC_STATUS_PATH',
    'CORTEX_SYNC_TIMEOUT_MS',
    'CORTEX_ASYNC_POLL_INTERVAL_MS',
    'CORTEX_ASYNC_MAX_WAIT_MS',
    'CORTEX_ENSURE_READY_TIMEOUT_MS',
    'CORTEX_START_READY_TIMEOUT_MS',
    'CORTEX_FAILURE_THRESHOLD',
    'CORTEX_CIRCUIT_OPEN_MS',
    'CORTEX_MODEL_FAST',
    'CORTEX_MODEL_AUDIT',
    'CORTEX_MODEL_DOM',
    'CORTEX_MODEL_REASONING_DEEP',
    'CORTEX_MODEL_VISION',
    'CORTEX_MODEL_SEARCH_FAST',
    'CORTEX_MODEL_RERANK_FAST',
    'CORTEX_MODEL_SEARCH_DEEP',
    'CORTEX_AUTO_START',
    'CORTEX_AUTO_RESTART_ON_AUTH',
    'CORTEX_ESCALATE_CONFIDENCE_LT',
    'CORTEX_ESCALATE_IF_CONFLICT',
    'CORTEX_ESCALATE_CRITICAL_ONLY',
    'CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT',
  ];

  for (const envKey of requiredEnvKeys) {
    assert.equal(
      infraRoutesText.includes(envKey),
      true,
      `process env override bridge should include ${envKey}`,
    );
  }
});

test('batch safety and max-parallel worker knobs remain non-surfaced planned items', async () => {
  const settingsDefaultsModule = await import(pathToFileURL(SETTINGS_DEFAULTS_PATH).href);
  const settingsContractModule = await import(pathToFileURL(SETTINGS_CONTRACT_PATH).href);
  const runtimeFlowText = readText(RUNTIME_FLOW_PATH);
  const indexingText = readText(INDEXING_PAGE_PATH);
  const runtimeDomainText = readText(RUNTIME_DOMAIN_PATH);
  const infraRoutesText = readText(INFRA_ROUTES_PATH);
  const configText = readText(path.resolve('src/config.js'));

  const runtimeDefaults = settingsDefaultsModule.SETTINGS_DEFAULTS?.runtime || {};
  const routeGet = settingsContractModule.RUNTIME_SETTINGS_ROUTE_GET || {};
  const routePut = settingsContractModule.RUNTIME_SETTINGS_ROUTE_PUT || {};
  const runtimeKeys = new Set(settingsContractModule.RUNTIME_SETTINGS_KEYS || []);

  const blockedKeys = [
    'maxBatchSizeConfirmation',
    'maxParallelProductWorkers',
  ];
  for (const key of blockedKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(runtimeDefaults, key), false, `runtime defaults should not include ${key}`);
    assert.equal(runtimeKeys.has(key), false, `runtime key registry should not include ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routeGet.intMap || {}, key), false, `runtime GET int map should not expose ${key}`);
    assert.equal(Object.prototype.hasOwnProperty.call(routePut.intRangeMap || {}, key), false, `runtime PUT int map should not expose ${key}`);
    assert.equal(runtimeDomainText.includes(`${key}: parseRuntimeInt(`), false, `runtime payload serializer should not include integer parser for ${key}`);
    assert.equal(indexingText.includes(`${key},`), false, `indexing payload builder should not include ${key}`);
  }
  assert.equal(runtimeFlowText.includes('label="Max Batch Size Confirmation"'), false, 'runtime flow should not expose max batch size confirmation control');
  assert.equal(runtimeFlowText.includes('label="Max Parallel Product Workers"'), false, 'runtime flow should not expose max parallel product workers control');
  assert.equal(infraRoutesText.includes('MAX_BATCH_SIZE_CONFIRMATION'), false, 'process env override bridge should not include MAX_BATCH_SIZE_CONFIRMATION');
  assert.equal(infraRoutesText.includes('MAX_PARALLEL_PRODUCT_WORKERS'), false, 'process env override bridge should not include MAX_PARALLEL_PRODUCT_WORKERS');
  assert.equal(configText.includes("parseIntEnv('MAX_BATCH_SIZE_CONFIRMATION'"), false, 'config should not parse MAX_BATCH_SIZE_CONFIRMATION');
  assert.equal(configText.includes("parseIntEnv('MAX_PARALLEL_PRODUCT_WORKERS'"), false, 'config should not parse MAX_PARALLEL_PRODUCT_WORKERS');
});
