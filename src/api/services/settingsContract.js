import Ajv2020 from 'ajv/dist/2020.js';
import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../../shared/settingsDefaults.js';

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pickKnownKeys(source, keys) {
  const input = asRecord(source);
  const picked = {};
  for (const key of keys) {
    if (Object.hasOwn(input, key)) {
      picked[key] = input[key];
    }
  }
  return picked;
}

function normalizeSchemaVersion(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const USER_SETTINGS_FILE = 'user-settings.json';
export const SETTINGS_DOCUMENT_SCHEMA_VERSION = 2;

export const SETTINGS_SCHEMA_MIGRATION_RULES = Object.freeze([
  Object.freeze({
    from: 0,
    to: 1,
    description: 'Normalize legacy payloads without sectioned settings envelopes.',
  }),
  Object.freeze({
    from: 1,
    to: 2,
    description: 'Canonicalize section keys and enforce deterministic authority precedence.',
  }),
]);

export const RUNTIME_SETTINGS_KEYS = Object.freeze([
  'runProfile',
  'searchProvider',
  'llmModelPlan',
  'llmModelTriage',
  'llmModelFast',
  'llmModelReasoning',
  'llmModelExtract',
  'llmModelValidate',
  'llmModelWrite',
  'llmPlanFallbackModel',
  'llmExtractFallbackModel',
  'llmValidateFallbackModel',
  'llmWriteFallbackModel',
  'indexingResumeMode',
  'concurrency',
  'perHostMinDelayMs',
  'indexingResumeMaxAgeHours',
  'indexingReextractAfterHours',
  'scannedPdfOcrBackend',
  'scannedPdfOcrMaxPages',
  'scannedPdfOcrMaxPairs',
  'scannedPdfOcrMinCharsPerPage',
  'scannedPdfOcrMinLinesPerPage',
  'scannedPdfOcrMinConfidence',
  'crawleeRequestHandlerTimeoutSecs',
  'dynamicFetchRetryBudget',
  'dynamicFetchRetryBackoffMs',
  'llmMaxOutputTokensPlan',
  'llmMaxOutputTokensTriage',
  'llmMaxOutputTokensFast',
  'llmMaxOutputTokensReasoning',
  'llmMaxOutputTokensExtract',
  'llmMaxOutputTokensValidate',
  'llmMaxOutputTokensWrite',
  'llmMaxOutputTokensPlanFallback',
  'llmMaxOutputTokensExtractFallback',
  'llmMaxOutputTokensValidateFallback',
  'llmMaxOutputTokensWriteFallback',
  'discoveryEnabled',
  'llmPlanDiscoveryQueries',
  'llmSerpRerankEnabled',
  'llmFallbackEnabled',
  'indexingReextractEnabled',
  'scannedPdfOcrEnabled',
  'scannedPdfOcrPromoteCandidates',
  'dynamicFetchPolicyMapJson',
  'dynamicFetchPolicyMap',
  'dynamicCrawleeEnabled',
  'crawleeHeadless',
]);

export const CONVERGENCE_SETTINGS_KEYS = Object.freeze([
  'convergenceMaxRounds',
  'convergenceNoProgressLimit',
  'convergenceMaxLowQualityRounds',
  'convergenceLowQualityConfidence',
  'convergenceMaxDispatchQueries',
  'convergenceMaxTargetFields',
  'needsetEvidenceDecayDays',
  'needsetEvidenceDecayFloor',
  'needsetCapIdentityLocked',
  'needsetCapIdentityProvisional',
  'needsetCapIdentityConflict',
  'needsetCapIdentityUnlocked',
  'consensusLlmWeightTier1',
  'consensusLlmWeightTier2',
  'consensusLlmWeightTier3',
  'consensusLlmWeightTier4',
  'consensusTier1Weight',
  'consensusTier2Weight',
  'consensusTier3Weight',
  'consensusTier4Weight',
  'serpTriageMinScore',
  'serpTriageMaxUrls',
  'serpTriageEnabled',
  'retrievalMaxHitsPerField',
  'retrievalMaxPrimeSources',
  'retrievalIdentityFilterEnabled',
  'laneConcurrencySearch',
  'laneConcurrencyFetch',
  'laneConcurrencyParse',
  'laneConcurrencyLlm',
]);

export const UI_SETTINGS_KEYS = Object.freeze([
  'studioAutoSaveAllEnabled',
  'studioAutoSaveEnabled',
  'studioAutoSaveMapEnabled',
  'runtimeAutoSaveEnabled',
  'storageAutoSaveEnabled',
  'llmSettingsAutoSaveEnabled',
]);

export const UI_SETTINGS_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.ui,
});

export const CONVERGENCE_SETTINGS_ROUTE_PUT = Object.freeze({
  intKeys: Object.freeze([
    'convergenceMaxRounds',
    'convergenceNoProgressLimit',
    'convergenceMaxLowQualityRounds',
    'convergenceMaxDispatchQueries',
    'convergenceMaxTargetFields',
    'needsetEvidenceDecayDays',
    'serpTriageMinScore',
    'serpTriageMaxUrls',
    'retrievalMaxHitsPerField',
    'retrievalMaxPrimeSources',
    'laneConcurrencySearch',
    'laneConcurrencyFetch',
    'laneConcurrencyParse',
    'laneConcurrencyLlm',
  ]),
  floatKeys: Object.freeze([
    'convergenceLowQualityConfidence',
    'needsetEvidenceDecayFloor',
    'needsetCapIdentityLocked',
    'needsetCapIdentityProvisional',
    'needsetCapIdentityConflict',
    'needsetCapIdentityUnlocked',
    'consensusLlmWeightTier1',
    'consensusLlmWeightTier2',
    'consensusLlmWeightTier3',
    'consensusLlmWeightTier4',
    'consensusTier1Weight',
    'consensusTier2Weight',
    'consensusTier3Weight',
    'consensusTier4Weight',
  ]),
  boolKeys: Object.freeze([
    'serpTriageEnabled',
    'retrievalIdentityFilterEnabled',
  ]),
});

export const RUNTIME_SETTINGS_ROUTE_GET = Object.freeze({
  dynamicFetchPolicyMapJsonKey: 'dynamicFetchPolicyMapJson',
  stringMap: Object.freeze({
    profile: 'runProfile',
    searchProvider: 'searchProvider',
    phase2LlmModel: 'llmModelPlan',
    phase3LlmModel: 'llmModelTriage',
    llmModelFast: 'llmModelFast',
    llmModelReasoning: 'llmModelReasoning',
    llmModelExtract: 'llmModelExtract',
    llmModelValidate: 'llmModelValidate',
    llmModelWrite: 'llmModelWrite',
    llmFallbackPlanModel: 'llmPlanFallbackModel',
    llmFallbackExtractModel: 'llmExtractFallbackModel',
    llmFallbackValidateModel: 'llmValidateFallbackModel',
    llmFallbackWriteModel: 'llmWriteFallbackModel',
    resumeMode: 'indexingResumeMode',
    scannedPdfOcrBackend: 'scannedPdfOcrBackend',
    dynamicFetchPolicyMapJson: 'dynamicFetchPolicyMapJson',
  }),
  intMap: Object.freeze({
    fetchConcurrency: 'concurrency',
    perHostMinDelayMs: 'perHostMinDelayMs',
    maxPagesPerDomain: 'maxPagesPerDomain',
    uberMaxUrlsPerDomain: 'uberMaxUrlsPerDomain',
    discoveryResultsPerQuery: 'discoveryResultsPerQuery',
    discoveryMaxDiscovered: 'discoveryMaxDiscovered',
    serpTriageMaxUrls: 'serpTriageMaxUrls',
    llmTokensPlan: 'llmMaxOutputTokensPlan',
    llmTokensTriage: 'llmMaxOutputTokensTriage',
    llmTokensFast: 'llmMaxOutputTokensFast',
    llmTokensReasoning: 'llmMaxOutputTokensReasoning',
    llmTokensExtract: 'llmMaxOutputTokensExtract',
    llmTokensValidate: 'llmMaxOutputTokensValidate',
    llmTokensWrite: 'llmMaxOutputTokensWrite',
    llmTokensPlanFallback: 'llmMaxOutputTokensPlanFallback',
    llmTokensExtractFallback: 'llmMaxOutputTokensExtractFallback',
    llmTokensValidateFallback: 'llmMaxOutputTokensValidateFallback',
    llmTokensWriteFallback: 'llmMaxOutputTokensWriteFallback',
    resumeWindowHours: 'indexingResumeMaxAgeHours',
    reextractAfterHours: 'indexingReextractAfterHours',
    scannedPdfOcrMaxPages: 'scannedPdfOcrMaxPages',
    scannedPdfOcrMaxPairs: 'scannedPdfOcrMaxPairs',
    scannedPdfOcrMinCharsPerPage: 'scannedPdfOcrMinCharsPerPage',
    scannedPdfOcrMinLinesPerPage: 'scannedPdfOcrMinLinesPerPage',
    crawleeRequestHandlerTimeoutSecs: 'crawleeRequestHandlerTimeoutSecs',
    dynamicFetchRetryBudget: 'dynamicFetchRetryBudget',
    dynamicFetchRetryBackoffMs: 'dynamicFetchRetryBackoffMs',
  }),
  floatMap: Object.freeze({
    scannedPdfOcrMinConfidence: 'scannedPdfOcrMinConfidence',
  }),
  boolMap: Object.freeze({
    discoveryEnabled: 'discoveryEnabled',
    phase2LlmEnabled: 'llmPlanDiscoveryQueries',
    phase3LlmTriageEnabled: 'llmSerpRerankEnabled',
    llmFallbackEnabled: 'llmFallbackEnabled',
    reextractIndexed: 'indexingReextractEnabled',
    scannedPdfOcrEnabled: 'scannedPdfOcrEnabled',
    scannedPdfOcrPromoteCandidates: 'scannedPdfOcrPromoteCandidates',
    dynamicCrawleeEnabled: 'dynamicCrawleeEnabled',
    crawleeHeadless: 'crawleeHeadless',
  }),
});

export const RUNTIME_SETTINGS_ROUTE_PUT = Object.freeze({
  dynamicFetchPolicyMapJsonKey: 'dynamicFetchPolicyMapJson',
  stringEnumMap: Object.freeze({
    profile: Object.freeze({ cfgKey: 'runProfile', allowed: SETTINGS_OPTION_VALUES.runtime.profile }),
    resumeMode: Object.freeze({ cfgKey: 'indexingResumeMode', allowed: SETTINGS_OPTION_VALUES.runtime.resumeMode }),
    scannedPdfOcrBackend: Object.freeze({ cfgKey: 'scannedPdfOcrBackend', allowed: SETTINGS_OPTION_VALUES.runtime.scannedPdfOcrBackend }),
    searchProvider: Object.freeze({ cfgKey: 'searchProvider', allowed: SETTINGS_OPTION_VALUES.runtime.searchProvider }),
  }),
  stringFreeMap: Object.freeze({
    phase2LlmModel: 'llmModelPlan',
    phase3LlmModel: 'llmModelTriage',
    llmModelFast: 'llmModelFast',
    llmModelReasoning: 'llmModelReasoning',
    llmModelExtract: 'llmModelExtract',
    llmModelValidate: 'llmModelValidate',
    llmModelWrite: 'llmModelWrite',
    llmFallbackPlanModel: 'llmPlanFallbackModel',
    llmFallbackExtractModel: 'llmExtractFallbackModel',
    llmFallbackValidateModel: 'llmValidateFallbackModel',
    llmFallbackWriteModel: 'llmWriteFallbackModel',
  }),
  intRangeMap: Object.freeze({
    fetchConcurrency: Object.freeze({ cfgKey: 'concurrency', min: 1, max: 64 }),
    perHostMinDelayMs: Object.freeze({ cfgKey: 'perHostMinDelayMs', min: 0, max: 120000 }),
    llmTokensPlan: Object.freeze({ cfgKey: 'llmMaxOutputTokensPlan', min: 128, max: 262144 }),
    llmTokensTriage: Object.freeze({ cfgKey: 'llmMaxOutputTokensTriage', min: 128, max: 262144 }),
    llmTokensFast: Object.freeze({ cfgKey: 'llmMaxOutputTokensFast', min: 128, max: 262144 }),
    llmTokensReasoning: Object.freeze({ cfgKey: 'llmMaxOutputTokensReasoning', min: 128, max: 262144 }),
    llmTokensExtract: Object.freeze({ cfgKey: 'llmMaxOutputTokensExtract', min: 128, max: 262144 }),
    llmTokensValidate: Object.freeze({ cfgKey: 'llmMaxOutputTokensValidate', min: 128, max: 262144 }),
    llmTokensWrite: Object.freeze({ cfgKey: 'llmMaxOutputTokensWrite', min: 128, max: 262144 }),
    llmTokensPlanFallback: Object.freeze({ cfgKey: 'llmMaxOutputTokensPlanFallback', min: 128, max: 262144 }),
    llmTokensExtractFallback: Object.freeze({ cfgKey: 'llmMaxOutputTokensExtractFallback', min: 128, max: 262144 }),
    llmTokensValidateFallback: Object.freeze({ cfgKey: 'llmMaxOutputTokensValidateFallback', min: 128, max: 262144 }),
    llmTokensWriteFallback: Object.freeze({ cfgKey: 'llmMaxOutputTokensWriteFallback', min: 128, max: 262144 }),
    resumeWindowHours: Object.freeze({ cfgKey: 'indexingResumeMaxAgeHours', min: 1, max: 8760 }),
    reextractAfterHours: Object.freeze({ cfgKey: 'indexingReextractAfterHours', min: 1, max: 8760 }),
    scannedPdfOcrMaxPages: Object.freeze({ cfgKey: 'scannedPdfOcrMaxPages', min: 1, max: 100 }),
    scannedPdfOcrMaxPairs: Object.freeze({ cfgKey: 'scannedPdfOcrMaxPairs', min: 50, max: 20000 }),
    scannedPdfOcrMinCharsPerPage: Object.freeze({ cfgKey: 'scannedPdfOcrMinCharsPerPage', min: 1, max: 500 }),
    scannedPdfOcrMinLinesPerPage: Object.freeze({ cfgKey: 'scannedPdfOcrMinLinesPerPage', min: 1, max: 100 }),
    crawleeRequestHandlerTimeoutSecs: Object.freeze({ cfgKey: 'crawleeRequestHandlerTimeoutSecs', min: 0, max: 300 }),
    dynamicFetchRetryBudget: Object.freeze({ cfgKey: 'dynamicFetchRetryBudget', min: 0, max: 5 }),
    dynamicFetchRetryBackoffMs: Object.freeze({ cfgKey: 'dynamicFetchRetryBackoffMs', min: 0, max: 30000 }),
  }),
  floatRangeMap: Object.freeze({
    scannedPdfOcrMinConfidence: Object.freeze({ cfgKey: 'scannedPdfOcrMinConfidence', min: 0, max: 1 }),
  }),
  boolMap: Object.freeze({
    discoveryEnabled: 'discoveryEnabled',
    phase2LlmEnabled: 'llmPlanDiscoveryQueries',
    phase3LlmTriageEnabled: 'llmSerpRerankEnabled',
    llmFallbackEnabled: 'llmFallbackEnabled',
    reextractIndexed: 'indexingReextractEnabled',
    scannedPdfOcrEnabled: 'scannedPdfOcrEnabled',
    scannedPdfOcrPromoteCandidates: 'scannedPdfOcrPromoteCandidates',
    dynamicCrawleeEnabled: 'dynamicCrawleeEnabled',
    crawleeHeadless: 'crawleeHeadless',
  }),
});

const runtimeValueTypeMap = {};
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap)) {
  runtimeValueTypeMap[value] = 'string';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'integer';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap)) {
  runtimeValueTypeMap[value.cfgKey] = 'number';
}
for (const value of Object.values(RUNTIME_SETTINGS_ROUTE_PUT.boolMap)) {
  runtimeValueTypeMap[value] = 'boolean';
}
runtimeValueTypeMap.dynamicFetchPolicyMapJson = 'string';
runtimeValueTypeMap.dynamicFetchPolicyMap = 'object';

export const RUNTIME_SETTINGS_VALUE_TYPES = Object.freeze(runtimeValueTypeMap);

const convergenceValueTypeMap = {};
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys) {
  convergenceValueTypeMap[key] = 'integer';
}
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys) {
  convergenceValueTypeMap[key] = 'number';
}
for (const key of CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys) {
  convergenceValueTypeMap[key] = 'boolean';
}

export const CONVERGENCE_SETTINGS_VALUE_TYPES = Object.freeze(convergenceValueTypeMap);

export const UI_SETTINGS_VALUE_TYPES = Object.freeze({
  studioAutoSaveAllEnabled: 'boolean',
  studioAutoSaveEnabled: 'boolean',
  studioAutoSaveMapEnabled: 'boolean',
  runtimeAutoSaveEnabled: 'boolean',
  storageAutoSaveEnabled: 'boolean',
  llmSettingsAutoSaveEnabled: 'boolean',
});

export const STORAGE_SETTINGS_VALUE_TYPES = Object.freeze({
  enabled: 'boolean',
  destinationType: 'string',
  localDirectory: 'string',
  s3Region: 'string',
  s3Bucket: 'string',
  s3Prefix: 'string',
  s3AccessKeyId: 'string',
  s3SecretAccessKey: 'string',
  s3SessionToken: 'string',
  updatedAt: 'string_or_null',
});

export const SETTINGS_AUTHORITY_PRECEDENCE = Object.freeze({
  runtime: Object.freeze(['user']),
  convergence: Object.freeze(['user']),
  storage: Object.freeze(['user']),
  studio: Object.freeze(['user']),
  ui: Object.freeze(['user']),
});

export function readUserSettingsDocumentMeta(rawPayload) {
  const source = asRecord(rawPayload);
  const hasPayload = Object.keys(source).length > 0;
  const schemaVersion = normalizeSchemaVersion(source.schemaVersion);
  return {
    hasPayload,
    schemaVersion,
    targetSchemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    stale: hasPayload && schemaVersion < SETTINGS_DOCUMENT_SCHEMA_VERSION,
  };
}

export function migrateUserSettingsDocument(rawPayload) {
  const source = asRecord(rawPayload);
  const currentVersion = normalizeSchemaVersion(source.schemaVersion);
  const migratedFrom = currentVersion;
  const runtime = {
    ...pickKnownKeys(source.runtime, RUNTIME_SETTINGS_KEYS),
    ...pickKnownKeys(source, RUNTIME_SETTINGS_KEYS),
  };
  const convergence = {
    ...pickKnownKeys(source.convergence, CONVERGENCE_SETTINGS_KEYS),
    ...pickKnownKeys(source, CONVERGENCE_SETTINGS_KEYS),
  };
  const ui = {
    ...pickKnownKeys(source.ui, UI_SETTINGS_KEYS),
    ...pickKnownKeys(source, UI_SETTINGS_KEYS),
  };
  return {
    schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    migratedFrom,
    runtime,
    convergence,
    storage: asRecord(source.storage),
    studio: asRecord(source.studio),
    ui,
  };
}

function schemaForSettingType(typeToken) {
  if (typeToken === 'integer') return { type: 'integer' };
  if (typeToken === 'number') return { type: 'number' };
  if (typeToken === 'boolean') return { type: 'boolean' };
  if (typeToken === 'string') return { type: 'string' };
  if (typeToken === 'string_or_null') return { anyOf: [{ type: 'string' }, { type: 'null' }] };
  if (typeToken === 'object') return { type: 'object', additionalProperties: true };
  return {};
}

function sectionSchemaFromTypeMap(typeMap) {
  const properties = {};
  for (const [key, typeToken] of Object.entries(typeMap || {})) {
    properties[key] = schemaForSettingType(typeToken);
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

const USER_SETTINGS_SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'integer', const: SETTINGS_DOCUMENT_SCHEMA_VERSION },
    runtime: sectionSchemaFromTypeMap(RUNTIME_SETTINGS_VALUE_TYPES),
    convergence: sectionSchemaFromTypeMap(CONVERGENCE_SETTINGS_VALUE_TYPES),
    storage: sectionSchemaFromTypeMap(STORAGE_SETTINGS_VALUE_TYPES),
    studio: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          map: {
            type: 'object',
            additionalProperties: true,
          },
          file_path: { type: 'string' },
          version_snapshot: {},
          map_hash: {},
          map_path: {},
          updated_at: {},
        },
        required: ['map'],
        additionalProperties: false,
      },
    },
    ui: sectionSchemaFromTypeMap(UI_SETTINGS_VALUE_TYPES),
  },
  required: ['schemaVersion', 'runtime', 'convergence', 'storage', 'studio', 'ui'],
  additionalProperties: false,
};

const settingsSchemaAjv = new Ajv2020({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});

const validateUserSettingsSnapshotSchema = settingsSchemaAjv.compile(USER_SETTINGS_SNAPSHOT_SCHEMA);

function normalizeSchemaErrors(errors) {
  if (!Array.isArray(errors)) return [];
  return errors.map((entry) => ({
    instancePath: String(entry.instancePath || ''),
    keyword: String(entry.keyword || ''),
    message: String(entry.message || 'validation_error'),
  }));
}

export function validateUserSettingsSnapshot(payload) {
  const valid = Boolean(validateUserSettingsSnapshotSchema(payload));
  return {
    valid,
    errors: valid ? [] : normalizeSchemaErrors(validateUserSettingsSnapshotSchema.errors),
  };
}
