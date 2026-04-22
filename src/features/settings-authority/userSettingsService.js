import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultUserSettingsRoot } from '../../core/config/runtimeArtifactRoots.js';
import {
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
} from '../../core/events/settingsPersistenceCounters.js';
import { resolvePhaseOverrides } from '../../core/config/configPostMerge.js';
import { buildRegistryLookup } from '../../core/llm/routeResolver.js';

const RUNTIME_KEYS_TO_PERSIST = new Set(RUNTIME_SETTINGS_KEYS);

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
  const studioAutoSaveEnabled = studioAutoSaveAllEnabled
    ? true
    : resolveBooleanSetting(source, 'studioAutoSaveEnabled', fallback.studioAutoSaveEnabled);
  return {
    studioAutoSaveAllEnabled,
    studioAutoSaveEnabled,
    studioAutoSaveMapEnabled,
    runtimeAutoSaveEnabled: resolveBooleanSetting(source, 'runtimeAutoSaveEnabled', fallback.runtimeAutoSaveEnabled),
  };
}

// Callers may pass an explicit settingsRoot for tests; production uses default.
function resolveSettingsRoot(options = {}) {
  const source = asRecord(options);
  const explicit = source.settingsRoot ?? source.categoryAuthorityRoot;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return path.resolve(explicit.trim());
  }
  return defaultUserSettingsRoot();
}

function buildUserSettingsSnapshot(runtime, studio = {}, ui = UI_SETTINGS_DEFAULTS) {
  return {
    schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    runtime: sanitizeRuntimeSettings(runtime),
    convergence: {},
    storage: {},
    studio: sanitizeStudioSettings(studio),
    ui: sanitizeUiSettings(ui),
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

// ── SQL read/write helpers ──

function deserializeSettingValue(value, type) {
  if (value === null || value === undefined) return null;
  if (type === 'bool') return value === 'true';
  if (type === 'number') return Number.parseFloat(value);
  if (type === 'json') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function detectSettingType(value) {
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return 'number';
  if (value !== null && typeof value === 'object') return 'json';
  return 'string';
}

function serializeSettingValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function readSettingsFromAppDb(appDb) {
  const result = { schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION };
  for (const section of ['runtime', 'convergence', 'storage', 'ui']) {
    const rows = appDb.getSection(section);
    const obj = {};
    for (const row of rows) {
      obj[row.key] = deserializeSettingValue(row.value, row.type);
    }
    result[section] = obj;
  }
  const studioRows = appDb.listStudioMaps();
  const studio = {};
  for (const row of studioRows) {
    try { studio[row.category] = JSON.parse(row.map_json); } catch { /* skip */ }
    if (studio[row.category]) studio[row.category].file_path = row.file_path;
  }
  result.studio = studio;
  return result;
}

function writeSettingsToAppDb(appDb, snapshot) {
  const tx = appDb.db.transaction(() => {
    for (const section of ['runtime', 'convergence', 'storage', 'ui']) {
      appDb.deleteSection(section);
      const data = snapshot[section] || {};
      for (const [key, value] of Object.entries(data)) {
        appDb.upsertSetting({
          section,
          key,
          value: serializeSettingValue(value),
          type: detectSettingType(value),
        });
      }
    }
    if (snapshot.studio && typeof snapshot.studio === 'object') {
      for (const [category, entry] of Object.entries(snapshot.studio)) {
        if (!entry || typeof entry !== 'object') continue;
        appDb.upsertStudioMap({
          category,
          map_json: JSON.stringify(entry),
          file_path: entry.file_path || '',
        });
      }
    }
  });
  tx();
}

function assertValidSnapshot(snapshot) {
  const validation = validateUserSettingsSnapshot(snapshot);
  if (validation.valid) return;
  const error = new Error('user_settings_snapshot_validation_failed');
  error.code = 'user_settings_snapshot_validation_failed';
  error.validationErrors = validation.errors;
  throw error;
}

export function loadUserSettingsSync(options = {}) {
  const { settingsRoot = null, categoryAuthorityRoot = null, strictRead = false, appDb = null } = options;
  if (appDb) {
    const raw = readSettingsFromAppDb(appDb);
    const snapshot = deriveSettingsArtifactsFromUserSettings(raw).snapshot;
    recordSnapshotValidationTelemetry(snapshot);
    return snapshot;
  }
  // WHY: JSON fallback for boot path — config.js + createBootstrapEnvironment.js
  // run before appDb is created. This path is used only during initial startup.
  const resolvedRoot = resolveSettingsRoot({ settingsRoot, categoryAuthorityRoot });
  const userPayload = readJsonFileSync(path.join(resolvedRoot, USER_SETTINGS_FILE), { strict: strictRead });
  recordUserSettingsMigrationTelemetry(userPayload);
  const userSettingsRaw = migrateUserSettingsDocument(userPayload);

  const snapshot = deriveSettingsArtifactsFromUserSettings(userSettingsRaw).snapshot;
  recordSnapshotValidationTelemetry(snapshot);
  return snapshot;
}

export async function loadUserSettings(options = {}) {
  const { settingsRoot = null, categoryAuthorityRoot = null, strictRead = false, appDb = null } = options;
  if (appDb) return loadUserSettingsSync({ appDb });
  const resolvedRoot = resolveSettingsRoot({ settingsRoot, categoryAuthorityRoot });
  const userRaw = await readJsonFile(path.join(resolvedRoot, USER_SETTINGS_FILE), { strict: strictRead });
  recordUserSettingsMigrationTelemetry(userRaw);
  const userSettingsRaw = migrateUserSettingsDocument(userRaw);
  const snapshot = deriveSettingsArtifactsFromUserSettings(userSettingsRaw).snapshot;
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

async function writeUserSettingsFile(filePath, payload) {
  const tempPath = path.join(
    path.dirname(filePath),
    `${USER_SETTINGS_FILE}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  try {
    await fs.writeFile(tempPath, body, 'utf8');
    // WHY: Windows EPERM on rename when file watchers/antivirus briefly lock the target
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await fs.rename(tempPath, filePath);
        return;
      } catch (err) {
        lastErr = err;
        if (err?.code !== 'EPERM' && err?.code !== 'EACCES') throw err;
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
    }
    throw lastErr;
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

// WHY: user-settings.json is a durable seed cache for DB rebuild, not an independent
// source of truth. seedAppDb reads it when app.sqlite is recreated from scratch.
// Without this mirror, any settings persisted only to SQL are lost on rebuild.
// Manual edits to user-settings.json are picked up on next DB rebuild but
// overwritten on the next SQL persist.
function shouldMirrorJsonFallback({ appDb, settingsRoot, categoryAuthorityRoot }) {
  if (!appDb) return false;
  if (settingsRoot !== null || categoryAuthorityRoot !== null) return true;
  return String(appDb?.dbPath || '').trim() !== ':memory:';
}

function resolveRequestedSections({
  runtime = null,
  studio = null,
  studioPatch = null,
  ui = null,
} = {}) {
  const sections = [];
  if (runtime !== null) sections.push('runtime');
  if (studio !== null || studioPatch !== null) sections.push('studio');
  if (ui !== null) sections.push('ui');
  return sections.length > 0 ? sections : ['runtime', 'studio', 'ui'];
}

export async function persistUserSettingsSections(options = {}) {
  const {
    settingsRoot = null,
    categoryAuthorityRoot = null,
    appDb = null,
    runtime = null,
    studio = null,
    studioPatch = null,
    ui = null,
  } = options;
  if (studio !== null && studioPatch !== null) {
    const error = new Error('persist_user_settings_studio_conflict');
    error.code = 'persist_user_settings_studio_conflict';
    throw error;
  }
  const requestedSections = resolveRequestedSections({
    runtime,
    studio,
    studioPatch,
    ui,
  });
  recordSettingsWriteAttempt({
    sections: requestedSections,
    target: appDb ? 'app.sqlite' : USER_SETTINGS_FILE,
  });

  // WHY: SQL is primary when appDb is available. JSON fallback for tests and early boot.
  if (appDb) {
    try {
      const existing = readSettingsFromAppDb(appDb);
      const existingStudio = sanitizeStudioSettings(existing.studio);
      let nextStudio = existingStudio;
      if (studio !== null) {
        nextStudio = sanitizeStudioSettings(studio);
      } else if (studioPatch !== null) {
        nextStudio = sanitizeStudioSettings({
          ...existingStudio,
          ...sanitizeStudioSettings(studioPatch),
        });
      }
      const merged = {
        runtime: runtime === null ? existing.runtime : sanitizeRuntimeSettings(runtime),
        studio: nextStudio,
        ui: ui === null ? existing.ui : sanitizeUiSettings(ui),
      };
      const payload = deriveSettingsArtifactsFromUserSettings(merged).snapshot;
      assertValidSnapshot(payload);
      writeSettingsToAppDb(appDb, payload);
      recordSettingsWriteOutcome({
        sections: requestedSections,
        target: 'app.sqlite',
        success: true,
      });
      // WHY: Mirror SQL writes to user-settings.json so seedAppDb has current data
      // on DB rebuild. Best-effort — SQL already committed, mirror failure must not
      // propagate to the caller or mask the successful SQL write.
      if (shouldMirrorJsonFallback({ appDb, settingsRoot, categoryAuthorityRoot })) {
        try {
          const resolvedRoot = resolveSettingsRoot({ settingsRoot, categoryAuthorityRoot });
          const filePath = path.join(resolvedRoot, USER_SETTINGS_FILE);
          await writeUserSettingsFile(filePath, payload);
        } catch (mirrorErr) {
          recordSettingsWriteOutcome({
            sections: requestedSections,
            target: USER_SETTINGS_FILE,
            success: false,
            reason: mirrorErr?.code || mirrorErr?.message || 'json_mirror_write_failed',
          });
        }
      }
      return payload;
    } catch (error) {
      recordSettingsWriteOutcome({
        sections: requestedSections,
        target: 'app.sqlite',
        success: false,
        reason: error?.code || error?.message || 'user_settings_persist_failed',
      });
      throw error;
    }
  }

  // JSON fallback (no appDb — test-only path; production callers always pass appDb)
  const prev = userSettingsPersistQueue;
  const next = (async () => {
    await prev.catch(() => {});
    const resolvedRoot = resolveSettingsRoot({ settingsRoot, categoryAuthorityRoot });
    try {
      const existing = await loadUserSettings({ settingsRoot: resolvedRoot, strictRead: true });
      const existingStudio = sanitizeStudioSettings(existing.studio);
      let nextStudio = existingStudio;
      if (studio !== null) {
        nextStudio = sanitizeStudioSettings(studio);
      } else if (studioPatch !== null) {
        nextStudio = sanitizeStudioSettings({
          ...existingStudio,
          ...sanitizeStudioSettings(studioPatch),
        });
      }
      const sections = {
        runtime: runtime === null ? existing.runtime : sanitizeRuntimeSettings(runtime),
        studio: nextStudio,
        ui: ui === null ? existing.ui : sanitizeUiSettings(ui),
      };
      const payload = deriveSettingsArtifactsFromUserSettings(sections).snapshot;
      assertValidSnapshot(payload);
      const filePath = path.join(resolvedRoot, USER_SETTINGS_FILE);
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
  })();
  userSettingsPersistQueue = next;
  return next;
}

// WHY: The persist queue serializes concurrent JSON fallback writes.
// SQL writes are synchronous (better-sqlite3), but JSON fallback path
// still uses the queue. This export makes it observable for flush.
export function drainPersistQueue() {
  return userSettingsPersistQueue;
}

// WHY: Patch-based alternative to persistUserSettingsSections for the runtime
// section. Only UPSERTs the changed keys (no DELETE-all + INSERT-all). Validates
// the MERGED snapshot before any SQL write to prevent invalid state from reaching
// the database. Used by mergeRuntimePatch in configPersistenceContext to serialize
// concurrent writes from /runtime-settings and /llm-policy handlers.
export async function mergeAndPersistRuntimePatch({
  appDb,
  patch,
  settingsRoot = null,
  categoryAuthorityRoot = null,
  config = null,
}) {
  // 1. Read current full state from SQL
  const existing = readSettingsFromAppDb(appDb);

  // 2. Merge patch in memory (sanitize patch first)
  const sanitizedIncomingPatch = sanitizeRuntimeSettings(patch);
  const sanitizedPatch = { ...sanitizedIncomingPatch };

  // WHY: Preserve the default provider registry when SQL still contains a
  // stale empty-array bootstrap row and the incoming patch does not touch it.
  // Secret keys are no longer healed here — SQL is sole authority for secrets.
  if (config && typeof config === 'object') {
    const effectiveRuntime = snapshotRuntimeSettings(config);
    const repairKeys = new Set(['llmProviderRegistryJson']);

    for (const key of repairKeys) {
      if (Object.hasOwn(sanitizedIncomingPatch, key)) continue;

      const persistedValue = existing.runtime?.[key];
      if (!shouldSkipBootstrapRuntimeOverride(key, persistedValue)) continue;

      const effectiveValue = effectiveRuntime[key];
      if (shouldSkipBootstrapRuntimeOverride(key, effectiveValue)) continue;

      sanitizedPatch[key] = effectiveValue;
    }
  }

  const mergedRuntime = { ...existing.runtime, ...sanitizedPatch };

  // 3. Build full snapshot and VALIDATE BEFORE any SQL write
  const merged = {
    runtime: mergedRuntime,
    studio: existing.studio,
    ui: existing.ui,
  };
  const payload = deriveSettingsArtifactsFromUserSettings(merged).snapshot;
  assertValidSnapshot(payload);

  // 4. Only now commit: UPSERT only the patch keys (no DELETE-all)
  const tx = appDb.db.transaction(() => {
    for (const [key, value] of Object.entries(sanitizedPatch)) {
      appDb.upsertSetting({
        section: 'runtime',
        key,
        value: serializeSettingValue(value),
        type: detectSettingType(value),
      });
    }
  });
  tx();

  // 5. Best-effort JSON mirror (full snapshot for rebuild seeding)
  if (shouldMirrorJsonFallback({ appDb, settingsRoot, categoryAuthorityRoot })) {
    try {
      const resolvedRoot = resolveSettingsRoot({ settingsRoot, categoryAuthorityRoot });
      await writeUserSettingsFile(path.join(resolvedRoot, USER_SETTINGS_FILE), payload);
    } catch (mirrorErr) {
      recordSettingsWriteOutcome({
        sections: ['runtime'],
        target: USER_SETTINGS_FILE,
        success: false,
        reason: mirrorErr?.code || mirrorErr?.message || 'json_mirror_write_failed',
      });
    }
  }

  return { sanitizedPatch, payload };
}

export function snapshotRuntimeSettings(config = {}) {
  return pickRuntimeSnapshotFromConfig(config);
}

export function snapshotUiSettings(state = {}) {
  return sanitizeUiSettings(state);
}

// WHY: Derived config fields (_registryLookup, _resolved* phase fields) are
// computed during configPostMerge but user settings are applied AFTER that.
// This function re-derives them whenever their inputs change so config stays
// consistent. Extracted to make the implicit side effects of apply explicit.
const PHASE_RESOLUTION_INPUTS = [
  'llmPhaseOverridesJson', 'llmModelPlan', 'llmModelReasoning',
  'llmPlanUseReasoning', 'llmMaxOutputTokensPlan', 'llmMaxOutputTokensTriage',
  'llmPlanFallbackModel', 'llmReasoningFallbackModel',
  // WHY: keyFinderTierSettingsJson feeds config._llmPolicy.keyFinderTiers.
  // Without it here, a GUI tier edit lands in the flat config but _llmPolicy
  // stays stale, so runKeyFinder sees empty tier bundles and falls back to
  // llmModelPlan (gemini-2.5-flash). Must live here, not as an ad-hoc branch.
  'keyFinderTierSettingsJson',
];

function rebuildDerivedConfigState(config, appliedKeys) {
  if (Object.hasOwn(appliedKeys, 'llmProviderRegistryJson')) {
    config._registryLookup = buildRegistryLookup(config.llmProviderRegistryJson);
  }
  if (PHASE_RESOLUTION_INPUTS.some((key) => Object.hasOwn(appliedKeys, key))) {
    resolvePhaseOverrides(config);
  }
}

// WHY: SQL is sole authority for secrets. Empty-string secrets are intentional
// (user hasn't set a key yet). Only skip the llmProviderRegistryJson
// empty-array edge case to preserve registry defaults during bootstrap.
function shouldSkipBootstrapRuntimeOverride(key, value) {
  if (key !== 'llmProviderRegistryJson') {
    return false;
  }
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

export function applyRuntimeSettingsToConfig(config, runtimeSettings = {}, options = {}) {
  const mode = String(options.mode || 'live').trim().toLowerCase();
  if (!config || typeof config !== 'object') return;
  const source = sanitizeRuntimeSettings(runtimeSettings);
  const applied = {};
  for (const [key, value] of Object.entries(source)) {
    if (mode === 'bootstrap' && shouldSkipBootstrapRuntimeOverride(key, value)) {
      continue;
    }
    config[key] = value;
    applied[key] = value;
  }
  rebuildDerivedConfigState(config, applied);
}

export function deriveSettingsArtifactsFromUserSettings(payload = {}) {
  const user = asRecord(payload || {});
  const snapshot = buildUserSettingsSnapshot(
    user.runtime,
    user.studio,
    user.ui,
  );
  return {
    snapshot,
    sections: {
      runtime: snapshot.runtime,
      convergence: snapshot.convergence,
      storage: snapshot.storage,
      studio: snapshot.studio,
      ui: snapshot.ui,
    },
    legacy: {
      runtime: snapshot.runtime,
      storage: {},
    },
  };
}
