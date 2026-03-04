import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_PAGE_PATH = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readStoragePage() {
  return fs.readFileSync(STORAGE_PAGE_PATH, 'utf8');
}

test('storage save and autosave controls follow shared save-button and explicit on/off rules', () => {
  const text = readStoragePage();
  const saveIndex = text.indexOf('onClick={() => saveStorageSettings()}');
  const autoSaveIndex = text.indexOf('onClick={() => setStorageAutoSaveEnabled(!autoSaveEnabled)}');
  const reloadIndex = text.indexOf('onClick={() => reloadStorageSettings()}');

  assert.equal(
    text.includes("autoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'"),
    true,
    'storage autosave control should show explicit On/Off label',
  );
  assert.equal(
    text.includes("autoSaveEnabled\n                  ? 'sf-primary-button'\n                  : 'sf-action-button'"),
    true,
    'storage autosave control should map ON => primary and OFF => action style',
  );
  assert.equal(
    text.includes("autoSaveEnabled\n                  ? 'sf-icon-button'\n                  : 'sf-primary-button'"),
    true,
    'storage save button should map autosave ON => neutral and autosave OFF => primary',
  );
  assert.equal(
    text.includes('disabled={!storageSettingsReady || isStorageSaving || autoSaveEnabled}'),
    true,
    'storage save button should disable only for readiness/saving/autosave-on states',
  );
  assert.equal(
    text.includes('Save Storage Settings'),
    false,
    'storage save button should use concise Save label',
  );
  assert.equal(
    /['"]Auto-Save['"]/.test(text),
    false,
    'storage should not render a bare Auto-Save label without explicit On/Off state',
  );
  assert.equal(
    saveIndex > -1 && autoSaveIndex > -1 && reloadIndex > -1 && saveIndex < autoSaveIndex && autoSaveIndex < reloadIndex,
    true,
    'storage controls should keep Save, then Auto-Save toggle, then Reload ordering',
  );
});

