import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONVERGENCE_SETTINGS_ROUTE_PUT,
  CONVERGENCE_SETTINGS_KEYS,
  CONVERGENCE_SETTINGS_VALUE_TYPES,
  migrateUserSettingsDocument,
  readUserSettingsDocumentMeta,
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_VALUE_TYPES,
  SETTINGS_AUTHORITY_PRECEDENCE,
  SETTINGS_DOCUMENT_SCHEMA_VERSION,
  SETTINGS_SCHEMA_MIGRATION_RULES,
  UI_SETTINGS_KEYS,
  UI_SETTINGS_VALUE_TYPES,
  validateUserSettingsSnapshot,
} from '../src/api/services/settingsContract.js';

test('settings contract exposes version, precedence, and migration metadata', () => {
  assert.equal(Number.isInteger(SETTINGS_DOCUMENT_SCHEMA_VERSION), true);
  assert.equal(SETTINGS_DOCUMENT_SCHEMA_VERSION >= 1, true);
  assert.deepEqual(SETTINGS_AUTHORITY_PRECEDENCE.runtime, ['user']);
  assert.deepEqual(SETTINGS_AUTHORITY_PRECEDENCE.convergence, ['user']);
  assert.deepEqual(SETTINGS_AUTHORITY_PRECEDENCE.storage, ['user']);
  assert.deepEqual(SETTINGS_AUTHORITY_PRECEDENCE.ui, ['user']);
  assert.equal(Array.isArray(SETTINGS_SCHEMA_MIGRATION_RULES), true);
  assert.equal(SETTINGS_SCHEMA_MIGRATION_RULES.length > 0, true);
});

test('migration normalizes legacy top-level runtime/convergence/ui keys into section envelopes', () => {
  const migrated = migrateUserSettingsDocument({
    schemaVersion: 1,
    runProfile: 'thorough',
    convergenceMaxRounds: 11,
    runtimeAutoSaveEnabled: false,
    unknownRootValue: 'ignored',
  });
  assert.equal(migrated.schemaVersion, SETTINGS_DOCUMENT_SCHEMA_VERSION);
  assert.equal(migrated.migratedFrom, 1);
  assert.equal(migrated.runtime.runProfile, 'thorough');
  assert.equal(migrated.convergence.convergenceMaxRounds, 11);
  assert.equal(migrated.ui.runtimeAutoSaveEnabled, false);
  assert.equal(Object.hasOwn(migrated, 'unknownRootValue'), false);
});

test('migration keeps only canonical runtime/convergence/ui keys', () => {
  const migrated = migrateUserSettingsDocument({
    runtime: {
      runProfile: 'fast',
      unknownRuntimeKey: 'drop-me',
    },
    convergence: {
      convergenceMaxRounds: 4,
      unknownConvergenceKey: true,
    },
    ui: {
      studioAutoSaveEnabled: true,
      unknownUiKey: false,
    },
  });
  assert.equal(Object.hasOwn(migrated.runtime, 'runProfile'), true);
  assert.equal(Object.hasOwn(migrated.runtime, 'unknownRuntimeKey'), false);
  assert.equal(Object.hasOwn(migrated.convergence, 'convergenceMaxRounds'), true);
  assert.equal(Object.hasOwn(migrated.convergence, 'unknownConvergenceKey'), false);
  assert.equal(Object.hasOwn(migrated.ui, 'studioAutoSaveEnabled'), true);
  assert.equal(Object.hasOwn(migrated.ui, 'unknownUiKey'), false);
  assert.equal(RUNTIME_SETTINGS_KEYS.length > 0, true);
  assert.equal(CONVERGENCE_SETTINGS_KEYS.length > 0, true);
  assert.equal(UI_SETTINGS_KEYS.length > 0, true);
});

test('runtime PUT route contract keys resolve to canonical runtime settings keys', () => {
  const runtimeSet = new Set(RUNTIME_SETTINGS_KEYS);
  const cfgKeys = new Set([
    ...Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap).map((entry) => entry.cfgKey),
    ...Object.values(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
    ...Object.values(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap).map((entry) => entry.cfgKey),
    ...Object.values(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap).map((entry) => entry.cfgKey),
    ...Object.values(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
    'dynamicFetchPolicyMapJson',
  ]);
  const unknown = Array.from(cfgKeys).filter((key) => !runtimeSet.has(key));
  assert.deepEqual(unknown, []);
});

test('runtime GET route maps include all runtime PUT frontend keys', () => {
  const getKeys = new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
    String(RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey),
  ]);
  const putKeys = new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
    String(RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey),
  ]);
  const missing = Array.from(putKeys).filter((key) => !getKeys.has(key));
  assert.deepEqual(missing, []);
});

test('convergence route contract keys resolve to canonical convergence settings keys', () => {
  const convergenceSet = new Set(CONVERGENCE_SETTINGS_KEYS);
  const routeKeys = new Set([
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.intKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.floatKeys,
    ...CONVERGENCE_SETTINGS_ROUTE_PUT.boolKeys,
  ]);
  const unknown = Array.from(routeKeys).filter((key) => !convergenceSet.has(key));
  assert.deepEqual(unknown, []);
});

test('settings value type maps cover canonical key sets', () => {
  const runtimeMissing = RUNTIME_SETTINGS_KEYS.filter((key) => !Object.hasOwn(RUNTIME_SETTINGS_VALUE_TYPES, key));
  const convergenceMissing = CONVERGENCE_SETTINGS_KEYS.filter((key) => !Object.hasOwn(CONVERGENCE_SETTINGS_VALUE_TYPES, key));
  const uiMissing = UI_SETTINGS_KEYS.filter((key) => !Object.hasOwn(UI_SETTINGS_VALUE_TYPES, key));
  assert.deepEqual(runtimeMissing, []);
  assert.deepEqual(convergenceMissing, []);
  assert.deepEqual(uiMissing, []);
});

test('readUserSettingsDocumentMeta flags stale payload versions only when payload exists', () => {
  const missing = readUserSettingsDocumentMeta({});
  assert.equal(missing.hasPayload, false);
  assert.equal(missing.stale, false);

  const stale = readUserSettingsDocumentMeta({ schemaVersion: 1, runtime: { runProfile: 'fast' } });
  assert.equal(stale.hasPayload, true);
  assert.equal(stale.stale, true);
  assert.equal(stale.schemaVersion, 1);
  assert.equal(stale.targetSchemaVersion, SETTINGS_DOCUMENT_SCHEMA_VERSION);
});

test('validateUserSettingsSnapshot enforces canonical envelope and rejects unknown keys', () => {
  const validPayload = {
    schemaVersion: SETTINGS_DOCUMENT_SCHEMA_VERSION,
    runtime: { runProfile: 'fast' },
    convergence: { convergenceMaxRounds: 3 },
    storage: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
      s3Region: 'us-east-2',
      s3Bucket: '',
      s3Prefix: 'spec-factory-runs',
      s3AccessKeyId: '',
      s3SecretAccessKey: '',
      s3SessionToken: '',
      updatedAt: null,
    },
    studio: {},
    ui: {
      studioAutoSaveAllEnabled: false,
      studioAutoSaveEnabled: true,
      studioAutoSaveMapEnabled: true,
      runtimeAutoSaveEnabled: true,
      storageAutoSaveEnabled: false,
      llmSettingsAutoSaveEnabled: true,
    },
  };
  const valid = validateUserSettingsSnapshot(validPayload);
  assert.equal(valid.valid, true);

  const invalid = validateUserSettingsSnapshot({
    ...validPayload,
    runtime: {
      ...validPayload.runtime,
      unknownRuntimeKey: true,
    },
  });
  assert.equal(invalid.valid, false);
  assert.equal(Array.isArray(invalid.errors), true);
  assert.equal(invalid.errors.length > 0, true);
});
