import Ajv2020 from 'ajv/dist/2020.js';
import { SETTINGS_DEFAULTS } from '../../shared/settingsDefaults.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
  RUNTIME_SETTINGS_VALUE_TYPES,
} from './runtimeSettingsRouteContract.js';
import {
  RUNTIME_SETTINGS_KEYS,
  UI_SETTINGS_KEYS,
} from './settingsKeySets.js';
import {
  UI_SETTINGS_VALUE_TYPES,
} from './settingsValueTypes.js';
import { buildUserSettingsSnapshotSchema } from './settingsSchemaBuilders.js';
import {
  USER_SETTINGS_FILE,
  SETTINGS_DOCUMENT_SCHEMA_VERSION,
  SETTINGS_SCHEMA_MIGRATION_RULES,
  readUserSettingsDocumentMeta,
  migrateUserSettingsDocument,
} from './settingsDocumentMeta.js';

export const UI_SETTINGS_DEFAULTS = Object.freeze({
  ...SETTINGS_DEFAULTS.ui,
});

export {
  USER_SETTINGS_FILE,
  SETTINGS_DOCUMENT_SCHEMA_VERSION,
  SETTINGS_SCHEMA_MIGRATION_RULES,
  readUserSettingsDocumentMeta,
  migrateUserSettingsDocument,
  RUNTIME_SETTINGS_KEYS,
  UI_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
  RUNTIME_SETTINGS_VALUE_TYPES,
  UI_SETTINGS_VALUE_TYPES,
};

export const SETTINGS_AUTHORITY_PRECEDENCE = Object.freeze({
  runtime: Object.freeze(['user']),
  studio: Object.freeze(['user']),
  ui: Object.freeze(['user']),
});

const USER_SETTINGS_SNAPSHOT_SCHEMA = buildUserSettingsSnapshotSchema({
  settingsDocumentSchemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
  runtimeSettingsValueTypes: RUNTIME_SETTINGS_VALUE_TYPES,
  uiSettingsValueTypes: UI_SETTINGS_VALUE_TYPES,
});

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


