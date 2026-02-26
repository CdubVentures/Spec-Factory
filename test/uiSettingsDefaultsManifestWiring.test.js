import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_MANIFEST = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');
const SHARED_DEFAULTS = path.resolve('src/shared/settingsDefaults.js');
const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const UI_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('ui autosave defaults are centralized in settings manifest and consumed by ui store/authority', () => {
  const settingsManifestText = readText(SETTINGS_MANIFEST);
  const sharedDefaultsText = readText(SHARED_DEFAULTS);
  const uiStoreText = readText(UI_STORE);
  const uiSettingsAuthorityText = readText(UI_SETTINGS_AUTHORITY);
  const manifestImportsSharedDefaults =
    settingsManifestText.includes("from '../../../../src/shared/settingsDefaults.js';") &&
    settingsManifestText.includes('SETTINGS_DEFAULTS');

  assert.equal(
    settingsManifestText.includes('export const UI_SETTING_DEFAULTS'),
    true,
    'settings manifest should expose canonical ui autosave defaults',
  );
  assert.equal(
    manifestImportsSharedDefaults,
    true,
    'settings manifest should import shared defaults',
  );
  assert.equal(
    settingsManifestText.includes('SETTINGS_DEFAULTS.ui as UiSettingDefaults'),
    true,
    'settings manifest should define ui autosave defaults from shared defaults',
  );

  assert.equal(
    sharedDefaultsText.includes('studioAutoSaveAllEnabled: false'),
    true,
    'shared defaults should define studio auto-save-all default',
  );
  assert.equal(
    sharedDefaultsText.includes('runtimeAutoSaveEnabled: true'),
    true,
    'shared defaults should define runtime autosave default',
  );
  assert.equal(
    sharedDefaultsText.includes('storageAutoSaveEnabled: false'),
    true,
    'shared defaults should define storage autosave default',
  );
  assert.equal(
    sharedDefaultsText.includes('llmSettingsAutoSaveEnabled: true'),
    true,
    'shared defaults should define llm autosave default',
  );

  assert.equal(
    uiStoreText.includes("import { UI_SETTING_DEFAULTS } from './settingsManifest';"),
    true,
    'uiStore should import canonical ui autosave defaults from settings manifest',
  );
  assert.equal(
    uiStoreText.includes('UI_SETTING_DEFAULTS.studioAutoSaveAllEnabled'),
    true,
    'uiStore studio auto-save-all fallback should use settings manifest defaults',
  );
  assert.equal(
    uiStoreText.includes('UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled'),
    true,
    'uiStore runtime autosave fallback should use settings manifest defaults',
  );
  assert.equal(
    uiStoreText.includes('UI_SETTING_DEFAULTS.storageAutoSaveEnabled'),
    true,
    'uiStore storage autosave fallback should use settings manifest defaults',
  );
  assert.equal(
    uiStoreText.includes('UI_SETTING_DEFAULTS.llmSettingsAutoSaveEnabled'),
    true,
    'uiStore llm autosave fallback should use settings manifest defaults',
  );

  assert.equal(
    uiSettingsAuthorityText.includes("import { UI_SETTING_DEFAULTS } from './settingsManifest';"),
    true,
    'ui settings authority should import canonical ui autosave defaults from settings manifest',
  );
  assert.equal(
    uiSettingsAuthorityText.includes('readUiBool(source, \'studioAutoSaveMapEnabled\', UI_SETTING_DEFAULTS.studioAutoSaveMapEnabled)'),
    true,
    'ui settings authority should resolve studio map autosave fallback from settings manifest defaults',
  );
  assert.equal(
    uiSettingsAuthorityText.includes('readUiBool(source, \'runtimeAutoSaveEnabled\', UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled)'),
    true,
    'ui settings authority should resolve runtime autosave fallback from settings manifest defaults',
  );
  assert.equal(
    uiSettingsAuthorityText.includes('readUiBool(source, \'storageAutoSaveEnabled\', UI_SETTING_DEFAULTS.storageAutoSaveEnabled)'),
    true,
    'ui settings authority should resolve storage autosave fallback from settings manifest defaults',
  );
  assert.equal(
    uiSettingsAuthorityText.includes('readUiBool(source, \'llmSettingsAutoSaveEnabled\', UI_SETTING_DEFAULTS.llmSettingsAutoSaveEnabled)'),
    true,
    'ui settings authority should resolve llm autosave fallback from settings manifest defaults',
  );
});
