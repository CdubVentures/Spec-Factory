import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRunDataStorageSettings } from './runDataRelocationService.js';

const USER_SETTINGS_FILE = 'user-settings.json';
const USER_SETTINGS_VERSION = 1;
const UI_SETTINGS_DEFAULTS = Object.freeze({
  studioAutoSaveAllEnabled: false,
  studioAutoSaveEnabled: false,
  studioAutoSaveMapEnabled: true,
  runtimeAutoSaveEnabled: true,
  storageAutoSaveEnabled: false,
  llmSettingsAutoSaveEnabled: true,
});

const RUNTIME_SETTINGS_KEYS_FOR_SNAPSHOT = [
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
];

const RUNTIME_KEYS_TO_PERSIST = new Set(RUNTIME_SETTINGS_KEYS_FOR_SNAPSHOT);

const CONVERGENCE_SETTING_KEYS = [
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
];

const CONVERGENCE_KEYS_TO_PERSIST = new Set(CONVERGENCE_SETTING_KEYS);

function normalizeFilePath(filePath) {
  return path.resolve(String(filePath || '') || path.resolve('helper_files', '_runtime', USER_SETTINGS_FILE));
}

function readJsonFileSync(filePath) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return {};
}

function readJsonFile(filePath) {
  return fs.readFile(filePath, 'utf8')
    .then((raw) => {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    })
    .catch(() => ({}));
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeCategoryToken(value) {
  return String(value || '').trim();
}

function sanitizeRuntimeSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return asRecord(raw);
}

function sanitizeConvergenceSettings(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return asRecord(raw);
}

function sanitizeStudioSettings(raw) {
  const source = asRecord(raw);
  const normalized = {};
  for (const [rawCategory, rawCategoryValue] of Object.entries(source)) {
    const category = normalizeCategoryToken(rawCategory);
    if (!category) continue;

    const entry = asRecord(rawCategoryValue);
    const directMap = (Object.hasOwn(entry, 'map') && typeof entry.map === 'object')
      ? asRecord(entry.map)
      : asRecord(entry);
    if (Object.keys(directMap).length === 0 && Object.hasOwn(entry, 'map')) {
      normalized[category] = {
        map: {},
        file_path: typeof entry.file_path === 'string' ? entry.file_path : '',
      };
      continue;
    }
    if (Object.keys(directMap).length === 0) continue;

    const sanitized = {
      map: directMap,
    };
    if (typeof entry.file_path === 'string') {
      sanitized.file_path = entry.file_path;
    }
    if (entry.version_snapshot != null) {
      sanitized.version_snapshot = entry.version_snapshot;
    }
    if (entry.map_hash != null) {
      sanitized.map_hash = entry.map_hash;
    }
    if (entry.map_path != null) {
      sanitized.map_path = entry.map_path;
    }
    if (entry.updated_at != null) {
      sanitized.updated_at = entry.updated_at;
    }
    normalized[category] = sanitized;
  }
  return normalized;
}

function sanitizeStorageSettings(raw) {
  const normalized = normalizeRunDataStorageSettings(raw, raw);
  return {
    enabled: normalized.enabled,
    destinationType: normalized.destinationType,
    localDirectory: normalized.localDirectory,
    s3Region: normalized.s3Region,
    s3Bucket: normalized.s3Bucket,
    s3Prefix: normalized.s3Prefix,
    s3AccessKeyId: normalized.s3AccessKeyId,
    s3SecretAccessKey: normalized.s3SecretAccessKey,
    s3SessionToken: normalized.s3SessionToken,
    updatedAt: normalized.updatedAt || null,
  };
}

function resolveBooleanSetting(source, key, fallback) {
  if (!source || typeof source !== 'object') return Boolean(fallback);
  if (!Object.hasOwn(source, key)) return Boolean(fallback);
  return Boolean(source[key]);
}

function sanitizeUiSettings(raw, fallback = UI_SETTINGS_DEFAULTS) {
  const source = asRecord(raw);
  return {
    studioAutoSaveAllEnabled: resolveBooleanSetting(source, 'studioAutoSaveAllEnabled', fallback.studioAutoSaveAllEnabled),
    studioAutoSaveEnabled: resolveBooleanSetting(source, 'studioAutoSaveEnabled', fallback.studioAutoSaveEnabled),
    studioAutoSaveMapEnabled: resolveBooleanSetting(source, 'studioAutoSaveMapEnabled', fallback.studioAutoSaveMapEnabled),
    runtimeAutoSaveEnabled: resolveBooleanSetting(source, 'runtimeAutoSaveEnabled', fallback.runtimeAutoSaveEnabled),
    storageAutoSaveEnabled: resolveBooleanSetting(source, 'storageAutoSaveEnabled', fallback.storageAutoSaveEnabled),
    llmSettingsAutoSaveEnabled: resolveBooleanSetting(source, 'llmSettingsAutoSaveEnabled', fallback.llmSettingsAutoSaveEnabled),
  };
}

function resolveRuntimeRoot(helperFilesRoot = 'helper_files') {
  const helperRoot = path.resolve(String(helperFilesRoot || 'helper_files'));
  return path.join(helperRoot, '_runtime');
}

function readLegacySettingsSync(runtimeRoot) {
  return {
    runtime: readJsonFileSync(path.join(runtimeRoot, 'settings.json')),
    convergence: readJsonFileSync(path.join(runtimeRoot, 'convergence-settings.json')),
    storage: readJsonFileSync(path.join(runtimeRoot, 'storage-settings.json')),
  };
}

function readLegacySettings(runtimeRoot) {
  return Promise.all([
    readJsonFile(path.join(runtimeRoot, 'settings.json')),
    readJsonFile(path.join(runtimeRoot, 'convergence-settings.json')),
    readJsonFile(path.join(runtimeRoot, 'storage-settings.json')),
  ]).then(([runtime, convergence, storage]) => ({ runtime, convergence, storage }));
}

function buildUserSettingsSnapshot(runtime, convergence, storage, studio = {}, ui = UI_SETTINGS_DEFAULTS) {
  return {
    schemaVersion: USER_SETTINGS_VERSION,
    runtime: asRecord(runtime),
    convergence: asRecord(convergence),
    storage: asRecord(storage),
    studio: sanitizeStudioSettings(studio),
    ui: sanitizeUiSettings(ui),
  };
}

function resolvePersistenceSections(payload) {
  const user = asRecord(payload || {});
  return {
    runtime: sanitizeRuntimeSettings(user.runtime),
    convergence: sanitizeConvergenceSettings(user.convergence),
    storage: sanitizeStorageSettings(user.storage),
    studio: sanitizeStudioSettings(user.studio),
    ui: sanitizeUiSettings(user.ui),
  };
}

export function readStudioMapFromUserSettings(payload, category = '') {
  const section = sanitizeStudioSettings(asRecord(payload).studio);
  const key = normalizeCategoryToken(category);
  if (!key) return null;
  if (!Object.prototype.hasOwnProperty.call(section, key)) return null;
  const entry = asRecord(section[key]);
  const map = asRecord(entry.map);
  if (Object.keys(map).length === 0) return null;
  return {
    file_path: typeof entry.file_path === 'string' ? entry.file_path : '',
    map,
  };
}

export function loadUserSettingsSync({ helperFilesRoot = 'helper_files' } = {}) {
  const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
  const legacy = readLegacySettingsSync(runtimeRoot);
  const userSettingsRaw = readJsonFileSync(path.join(runtimeRoot, USER_SETTINGS_FILE));

  return buildUserSettingsSnapshot(
    {
      ...sanitizeRuntimeSettings(legacy.runtime),
      ...sanitizeRuntimeSettings(userSettingsRaw.runtime),
    },
    {
      ...sanitizeConvergenceSettings(legacy.convergence),
      ...sanitizeConvergenceSettings(userSettingsRaw.convergence),
    },
    {
      ...sanitizeStorageSettings(legacy.storage),
      ...sanitizeStorageSettings(userSettingsRaw.storage),
    },
    sanitizeStudioSettings(userSettingsRaw.studio),
    sanitizeUiSettings(userSettingsRaw.ui),
  );
}

export async function loadUserSettings({ helperFilesRoot = 'helper_files' } = {}) {
  const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
  const [legacy, userRaw] = await Promise.all([
    readLegacySettings(runtimeRoot),
    readJsonFile(path.join(runtimeRoot, USER_SETTINGS_FILE)),
  ]);
  return buildUserSettingsSnapshot(
    {
      ...sanitizeRuntimeSettings(legacy.runtime),
      ...sanitizeRuntimeSettings(userRaw.runtime),
    },
    {
      ...sanitizeConvergenceSettings(legacy.convergence),
      ...sanitizeConvergenceSettings(userRaw.convergence),
    },
    {
      ...sanitizeStorageSettings(legacy.storage),
      ...sanitizeStorageSettings(userRaw.storage),
    },
    sanitizeStudioSettings(userRaw.studio),
    sanitizeUiSettings(userRaw.ui),
  );
}

function pickRuntimeSnapshotFromConfig(config = {}) {
  const runtime = {};
  for (const key of RUNTIME_KEYS_TO_PERSIST) {
    if (Object.hasOwn(config, key)) {
      runtime[key] = config[key];
    }
  }
  return runtime;
}

function pickConvergenceSnapshotFromConfig(config = {}) {
  const convergence = {};
  for (const key of CONVERGENCE_KEYS_TO_PERSIST) {
    if (Object.hasOwn(config, key)) {
      convergence[key] = config[key];
    }
  }
  return convergence;
}

async function writeUserSettingsFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function persistUserSettingsSections({
  helperFilesRoot = 'helper_files',
  runtime = null,
  convergence = null,
  storage = null,
  studio = null,
  ui = null,
} = {}) {
  const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
  const existing = await loadUserSettings({ helperFilesRoot });
  const sections = {
    runtime: runtime === null ? existing.runtime : sanitizeRuntimeSettings(runtime),
    convergence: convergence === null ? existing.convergence : sanitizeConvergenceSettings(convergence),
    storage: storage === null ? existing.storage : sanitizeStorageSettings(storage),
    studio: studio === null ? existing.studio : sanitizeStudioSettings(studio),
    ui: ui === null ? existing.ui : sanitizeUiSettings(ui),
  };
  const payload = buildUserSettingsSnapshot(
    sections.runtime,
    sections.convergence,
    sections.storage,
    sections.studio,
    sections.ui,
  );
  const filePath = path.join(runtimeRoot, USER_SETTINGS_FILE);
  await writeUserSettingsFile(filePath, payload);
  return payload;
}

export function snapshotRuntimeSettings(config = {}) {
  return pickRuntimeSnapshotFromConfig(config);
}

export function snapshotConvergenceSettings(config = {}) {
  return pickConvergenceSnapshotFromConfig(config);
}

export function snapshotStorageSettings(state = {}) {
  return sanitizeStorageSettings(state);
}

export function snapshotUiSettings(state = {}) {
  return sanitizeUiSettings(state);
}

export function applyRuntimeSettingsToConfig(config, runtimeSettings = {}) {
  if (!config || typeof config !== 'object') return;
  const source = sanitizeRuntimeSettings(runtimeSettings);
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(config, key)) {
      config[key] = value;
    }
  }
}

export function applyConvergenceSettingsToConfig(config, convergenceSettings = {}) {
  if (!config || typeof config !== 'object') return;
  const source = sanitizeConvergenceSettings(convergenceSettings);
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(config, key)) {
      config[key] = value;
    }
  }
}

export function sanitizeUserSettingsSettings(payload) {
  const normalized = resolvePersistenceSections(payload || {});
  return buildUserSettingsSnapshot(
    normalized.runtime,
    normalized.convergence,
    normalized.storage,
    normalized.studio,
    normalized.ui,
  );
}
