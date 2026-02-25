import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeRunDataStorageSettings } from './runDataRelocationService.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  CONVERGENCE_SETTINGS_VALUE_TYPES,
  migrateUserSettingsDocument,
  readUserSettingsDocumentMeta,
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_VALUE_TYPES,
  SETTINGS_DOCUMENT_SCHEMA_VERSION,
  UI_SETTINGS_DEFAULTS,
  USER_SETTINGS_FILE,
  validateUserSettingsSnapshot,
} from './settingsContract.js';
import {
  recordSettingsMigration,
  recordSettingsStaleRead,
  recordSettingsWriteAttempt,
  recordSettingsWriteOutcome,
} from '../../observability/settingsPersistenceCounters.js';
const RUNTIME_KEYS_TO_PERSIST = new Set(RUNTIME_SETTINGS_KEYS);
const CONVERGENCE_KEYS_TO_PERSIST = new Set(CONVERGENCE_SETTINGS_KEYS);
let userSettingsPersistQueue = Promise.resolve();

function isMissingFileError(error) {
  const code = String(error?.code || '').trim().toUpperCase();
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function buildInvalidUserSettingsError(filePath, reason = 'invalid_json') {
  const error = new Error('user_settings_invalid_json');
  error.code = 'user_settings_invalid_json';
  error.reason = reason;
  error.filePath = filePath;
  return error;
}

function parseJsonObject(raw, filePath, { strict = false } = {}) {
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (!strict) return {};
    throw buildInvalidUserSettingsError(filePath, 'parse_failed');
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }
  if (!strict) return {};
  throw buildInvalidUserSettingsError(filePath, 'object_required');
}

function readJsonFileSync(filePath, { strict = false } = {}) {
  try {
    const raw = fsSync.readFileSync(filePath, 'utf8');
    return parseJsonObject(raw, filePath, { strict });
  } catch (error) {
    if (!strict || isMissingFileError(error)) {
      return {};
    }
    throw error;
  }
}

async function readJsonFile(filePath, { strict = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseJsonObject(raw, filePath, { strict });
  } catch (error) {
    if (!strict || isMissingFileError(error)) {
      return {};
    }
    throw error;
  }
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeCategoryToken(value) {
  return String(value || '').trim();
}

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  const token = String(value ?? '').trim().toLowerCase();
  if (!token) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(token)) return true;
  if (['0', 'false', 'no', 'off'].includes(token)) return false;
  return undefined;
}

function coerceInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const token = String(value ?? '').trim();
  if (!token) return undefined;
  const parsed = Number.parseInt(token, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coerceNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const token = String(value ?? '').trim();
  if (!token) return undefined;
  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function sanitizeTypedSettingValue(value, typeToken) {
  if (typeToken === 'boolean') return coerceBoolean(value);
  if (typeToken === 'integer') return coerceInteger(value);
  if (typeToken === 'number') return coerceNumber(value);
  if (typeToken === 'string') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  }
  if (typeToken === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? asRecord(value) : undefined;
  if (typeToken === 'string_or_null') {
    if (value === null) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  }
  return undefined;
}

function sanitizeSectionByTypeMap(raw, typeMap) {
  const source = asRecord(raw);
  const normalized = {};
  for (const [key, typeToken] of Object.entries(typeMap || {})) {
    if (!Object.hasOwn(source, key)) continue;
    const sanitized = sanitizeTypedSettingValue(source[key], typeToken);
    if (sanitized === undefined) continue;
    normalized[key] = sanitized;
  }
  return normalized;
}

function sanitizeRuntimeSettings(raw) {
  return sanitizeSectionByTypeMap(raw, RUNTIME_SETTINGS_VALUE_TYPES);
}

function sanitizeConvergenceSettings(raw) {
  return sanitizeSectionByTypeMap(raw, CONVERGENCE_SETTINGS_VALUE_TYPES);
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
  const normalized = coerceBoolean(source[key]);
  return normalized === undefined ? Boolean(fallback) : normalized;
}

function sanitizeUiSettings(raw, fallback = UI_SETTINGS_DEFAULTS) {
  const source = asRecord(raw);
  const studioAutoSaveAllEnabled = resolveBooleanSetting(source, 'studioAutoSaveAllEnabled', fallback.studioAutoSaveAllEnabled);
  const studioAutoSaveMapEnabled = studioAutoSaveAllEnabled
    ? true
    : resolveBooleanSetting(source, 'studioAutoSaveMapEnabled', fallback.studioAutoSaveMapEnabled);
  const studioAutoSaveEnabled = studioAutoSaveAllEnabled || studioAutoSaveMapEnabled
    ? true
    : resolveBooleanSetting(source, 'studioAutoSaveEnabled', fallback.studioAutoSaveEnabled);
  return {
    studioAutoSaveAllEnabled,
    studioAutoSaveEnabled,
    studioAutoSaveMapEnabled,
    runtimeAutoSaveEnabled: resolveBooleanSetting(source, 'runtimeAutoSaveEnabled', fallback.runtimeAutoSaveEnabled),
    storageAutoSaveEnabled: resolveBooleanSetting(source, 'storageAutoSaveEnabled', fallback.storageAutoSaveEnabled),
    llmSettingsAutoSaveEnabled: resolveBooleanSetting(source, 'llmSettingsAutoSaveEnabled', fallback.llmSettingsAutoSaveEnabled),
  };
}

function resolveRuntimeRoot(helperFilesRoot = 'helper_files') {
  const helperRoot = path.resolve(String(helperFilesRoot || 'helper_files'));
  return path.join(helperRoot, '_runtime');
}

function buildUserSettingsSnapshot(runtime, convergence, storage, studio = {}, ui = UI_SETTINGS_DEFAULTS) {
  return {
    schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
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

function recordUserSettingsMigrationTelemetry(rawPayload) {
  const meta = readUserSettingsDocumentMeta(rawPayload);
  if (!meta.stale) return;
  recordSettingsStaleRead({
    section: 'user-settings',
    reason: 'schema_version_outdated',
    fromVersion: meta.schemaVersion,
    toVersion: meta.targetSchemaVersion,
  });
  recordSettingsMigration({
    fromVersion: meta.schemaVersion,
    toVersion: meta.targetSchemaVersion,
  });
}

function recordSnapshotValidationTelemetry(snapshot, reasonPrefix = 'snapshot_validation_failed') {
  const validation = validateUserSettingsSnapshot(snapshot);
  if (validation.valid) return;
  const keywordToken = String(validation.errors?.[0]?.keyword || 'unknown').trim().toLowerCase();
  recordSettingsStaleRead({
    section: 'user-settings',
    reason: `${reasonPrefix}_${keywordToken}`,
    fromVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    toVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
  });
}

function assertValidSnapshot(snapshot) {
  const validation = validateUserSettingsSnapshot(snapshot);
  if (validation.valid) return;
  const error = new Error('user_settings_snapshot_validation_failed');
  error.code = 'user_settings_snapshot_validation_failed';
  error.validationErrors = validation.errors;
  throw error;
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

export function loadUserSettingsSync({ helperFilesRoot = 'helper_files', strictRead = false } = {}) {
  const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
  const userPayload = readJsonFileSync(path.join(runtimeRoot, USER_SETTINGS_FILE), { strict: strictRead });
  recordUserSettingsMigrationTelemetry(userPayload);
  const userSettingsRaw = migrateUserSettingsDocument(userPayload);

  const snapshot = buildUserSettingsSnapshot(
    sanitizeRuntimeSettings(userSettingsRaw.runtime),
    sanitizeConvergenceSettings(userSettingsRaw.convergence),
    sanitizeStorageSettings(userSettingsRaw.storage),
    sanitizeStudioSettings(userSettingsRaw.studio),
    sanitizeUiSettings(userSettingsRaw.ui),
  );
  recordSnapshotValidationTelemetry(snapshot);
  return snapshot;
}

export async function loadUserSettings({ helperFilesRoot = 'helper_files', strictRead = false } = {}) {
  const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
  const userRaw = await readJsonFile(path.join(runtimeRoot, USER_SETTINGS_FILE), { strict: strictRead });
  recordUserSettingsMigrationTelemetry(userRaw);
  const userSettingsRaw = migrateUserSettingsDocument(userRaw);
  const snapshot = buildUserSettingsSnapshot(
    sanitizeRuntimeSettings(userSettingsRaw.runtime),
    sanitizeConvergenceSettings(userSettingsRaw.convergence),
    sanitizeStorageSettings(userSettingsRaw.storage),
    sanitizeStudioSettings(userSettingsRaw.studio),
    sanitizeUiSettings(userSettingsRaw.ui),
  );
  recordSnapshotValidationTelemetry(snapshot);
  return snapshot;
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
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `${USER_SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    await fs.writeFile(tempPath, body, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

function enqueueUserSettingsPersist(task) {
  const nextTask = userSettingsPersistQueue.then(task, task);
  userSettingsPersistQueue = nextTask.catch(() => {});
  return nextTask;
}

function resolveRequestedSections({
  runtime = null,
  convergence = null,
  storage = null,
  studio = null,
  ui = null,
} = {}) {
  const sections = [];
  if (runtime !== null) sections.push('runtime');
  if (convergence !== null) sections.push('convergence');
  if (storage !== null) sections.push('storage');
  if (studio !== null) sections.push('studio');
  if (ui !== null) sections.push('ui');
  return sections.length > 0 ? sections : ['runtime', 'convergence', 'storage', 'studio', 'ui'];
}

export async function persistUserSettingsSections({
  helperFilesRoot = 'helper_files',
  runtime = null,
  convergence = null,
  storage = null,
  studio = null,
  ui = null,
} = {}) {
  const requestedSections = resolveRequestedSections({
    runtime,
    convergence,
    storage,
    studio,
    ui,
  });
  recordSettingsWriteAttempt({
    sections: requestedSections,
    target: USER_SETTINGS_FILE,
  });

  return enqueueUserSettingsPersist(async () => {
    const runtimeRoot = resolveRuntimeRoot(helperFilesRoot);
    try {
      const existing = await loadUserSettings({ helperFilesRoot, strictRead: true });
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
      assertValidSnapshot(payload);
      const filePath = path.join(runtimeRoot, USER_SETTINGS_FILE);
      await writeUserSettingsFile(filePath, payload);
      recordSettingsWriteOutcome({
        sections: requestedSections,
        target: USER_SETTINGS_FILE,
        success: true,
      });
      return payload;
    } catch (error) {
      recordSettingsWriteOutcome({
        sections: requestedSections,
        target: USER_SETTINGS_FILE,
        success: false,
        reason: error?.code || error?.message || 'user_settings_persist_failed',
      });
      throw error;
    }
  });
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
