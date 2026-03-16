import test from 'node:test';
import assert from 'node:assert/strict';

import {
  USER_SETTINGS_FILE as contractUserSettingsFile,
  SETTINGS_DOCUMENT_SCHEMA_VERSION as contractSchemaVersion,
  SETTINGS_SCHEMA_MIGRATION_RULES as contractMigrationRules,
  readUserSettingsDocumentMeta as contractReadMeta,
  migrateUserSettingsDocument as contractMigrateDocument,
} from '../src/features/settings-authority/settingsContract.js';
import {
  USER_SETTINGS_FILE as moduleUserSettingsFile,
  SETTINGS_DOCUMENT_SCHEMA_VERSION as moduleSchemaVersion,
  SETTINGS_SCHEMA_MIGRATION_RULES as moduleMigrationRules,
  readUserSettingsDocumentMeta as moduleReadMeta,
  migrateUserSettingsDocument as moduleMigrateDocument,
} from '../src/features/settings-authority/settingsDocumentMeta.js';

test('settings contract document metadata/migration exports are sourced from settings document meta module', () => {
  assert.equal(contractUserSettingsFile, moduleUserSettingsFile);
  assert.equal(contractSchemaVersion, moduleSchemaVersion);
  assert.equal(contractMigrationRules, moduleMigrationRules);
  assert.equal(contractReadMeta, moduleReadMeta);
  assert.equal(contractMigrateDocument, moduleMigrateDocument);
});
