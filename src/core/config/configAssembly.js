// WHY: O(1) Feature Scaling — generic config assembly from registry SSOT.
// For SIMPLE settings, this loop replaces 140+ manual parseXxxEnv() lines.
// CUSTOM settings (computed, json-normalize, multi-env, hardcoded) are excluded
// and handled as explicit overlays in configBuilder.js.

import {
  parseIntEnv,
  parseFloatEnv,
  parseBoolEnv,
} from './envParsers.js';

// WHY: These registry keys require custom assembly logic in configBuilder.
// They cannot be handled by a simple parseXxxEnv(envKey, default) pattern.
// Grouped by reason — see configBuilder.js for the actual logic.
export const CUSTOM_KEYS = Object.freeze(new Set([
  // Post-processed strings (.replace, .trim, .toLowerCase)
  's3InputPrefix', 's3OutputPrefix',
  'indexingResumeMode',
  'capturePageScreenshotFormat', 'capturePageScreenshotSelectors',
  'repairDedupeRule',

  // Computed from multi-env chains or earlier variables
  'userAgent', 'outputMode',
  'localInputRoot', 'localOutputRoot',
  'mirrorToS3',
  'searchEngines', 'searchEnginesFallback',
  'searxngBaseUrl', 'searxngDefaultBaseUrl',

  // LLM model/provider resolution chain
  'llmProvider', 'llmApiKey', 'llmBaseUrl',
  'llmModelExtract', 'llmModelPlan', 'llmModelReasoning',
  'llmPlanProvider', 'llmPlanBaseUrl', 'llmPlanApiKey',
  'llmPlanFallbackModel', 'llmModelCatalog',
  'llmTimeoutMs', 'llmForceRoleModelProvider',
  'llmModelPricingMap', 'llmPricingAsOf', 'llmPricingSources',
  'llmOutputTokenPresets', 'llmModelOutputTokenMap',
  'llmPhaseOverridesJson', 'llmProviderRegistryJson',

  // OpenAI aliases (computed from LLM chain)
  'openaiApiKey', 'openaiBaseUrl',
  'openaiModelExtract', 'openaiModelPlan', 'openaiModelWrite',
  'openaiMaxInputChars', 'openaiTimeoutMs',

  // API keys (read from env directly, not via registry default)
  'anthropicApiKey', 'geminiApiKey', 'deepseekApiKey',
  'serperApiKey',

  // JSON map normalization + sub-fields
  'retrievalInternalsMap',
  'retrievalEvidenceTierWeightMultiplier', 'retrievalEvidenceDocWeightMultiplier',
  'retrievalEvidenceMethodWeightMultiplier', 'retrievalEvidencePoolMaxRows',
  'retrievalSnippetsPerSourceCap', 'retrievalMaxHitsCap',
  'retrievalEvidenceRefsLimit', 'retrievalReasonBadgesLimit',
  'retrievalAnchorsLimit', 'retrievalPrimeSourcesMaxCap',
  'retrievalFallbackEvidenceMaxRows', 'retrievalProvenanceOnlyMinRows',
  'searchProfileCapMap', 'searchProfileCapMapJson',

  // Hardcoded constants (not in registry or always fixed)
  'runProfile',
  'searchGlobalRps', 'searchGlobalBurst', 'searchPerHostRps', 'searchPerHostBurst',
  'consensusLlmWeightTier1', 'consensusLlmWeightTier2',
  'consensusLlmWeightTier3', 'consensusLlmWeightTier4',
  'consensusTier1Weight', 'consensusTier2Weight',
  'consensusTier3Weight', 'consensusTier4Weight',
  'retrievalMaxHitsPerField', 'retrievalMaxPrimeSources', 'retrievalIdentityFilterEnabled',
  'automationQueueStorageEngine', 'runtimeScreenshotMode', 'accuracyMode',
  'chartExtractionEnabled',
  'fieldRulesEngineEnforceEvidence', 'runtimeOpsWorkbenchEnabled',
  'indexingHelperFilesEnabled', 'helperFilesEnabled',
  'helperSupportiveEnabled', 'helperSupportiveMaxSources',
  'helperAutoSeedTargets', 'helperActiveSyncLimit',

  // Category authority (computed resolution chain)
  'categoryAuthorityEnabled', 'categoryAuthorityRoot',

  // Chatmock (path.join computation)
  'chatmockDir', 'chatmockComposeFile',

  // Resume persist limits (hardcoded, no runtimeSettingDefault)
  'indexingResumeRetryPersistLimit', 'indexingResumeSuccessPersistLimit',
  'indexingReextractSeedLimit',
  'indexingSchemaPacketsSchemaRoot',

  // Runtime events key (uses simple pattern but grouped here for safety)
  'runtimeEventsKey',

]));

const PARSE_BY_TYPE = {
  int:      (envKey, def) => parseIntEnv(envKey, def),
  float:    (envKey, def) => parseFloatEnv(envKey, def),
  bool:     (envKey, def) => parseBoolEnv(envKey, def),
  string:   (envKey, def) => process.env[envKey] || def,
  enum:     (envKey, def) => process.env[envKey] || def,
  csv_enum: (envKey, def) => process.env[envKey] || def,
};

/**
 * Assemble the SIMPLE portion of config from registry SSOT.
 * For each registry entry NOT in CUSTOM_KEYS:
 *   cfg[configKey] = parseByType(envKey, registryDefault)
 *
 * No fallback parameter. Registry default is the only default.
 */
export function assembleConfigFromRegistry(registry) {
  const cfg = {};
  for (const entry of registry) {
    if (CUSTOM_KEYS.has(entry.key)) continue;
    if (CUSTOM_KEYS.has(entry.configKey)) continue;
    if (entry.routeOnly || entry.defaultsOnly) continue;
    if (!entry.envKey) continue;

    const cfgKey = entry.configKey || entry.key;
    const parse = PARSE_BY_TYPE[entry.type] || PARSE_BY_TYPE.string;
    cfg[cfgKey] = parse(entry.envKey, entry.default);
  }
  return cfg;
}
