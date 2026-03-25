import {
  RUNTIME_SETTINGS_KEYS,
  UI_SETTINGS_KEYS,
} from './settingsKeySets.js';

export function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function pickKnownKeys(source, keys) {
  const input = asRecord(source);
  const picked = {};
  for (const key of keys) {
    if (Object.hasOwn(input, key)) {
      picked[key] = input[key];
    }
  }
  return picked;
}

export function normalizeSchemaVersion(value) {
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
  const ui = {
    ...pickKnownKeys(source.ui, UI_SETTINGS_KEYS),
    ...pickKnownKeys(source, UI_SETTINGS_KEYS),
  };
  return {
    schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    migratedFrom,
    runtime,
    convergence: {},
    storage: asRecord(source.storage),
    studio: asRecord(source.studio),
    ui,
  };
}
