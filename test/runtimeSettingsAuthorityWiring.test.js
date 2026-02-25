import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PICKER_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/PickerPanel.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const RUNTIME_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('runtime settings are owned by a shared authority module', () => {
  assert.equal(fs.existsSync(RUNTIME_AUTHORITY), true, 'runtime settings authority module should exist');

  const authorityText = readText(RUNTIME_AUTHORITY);
  const indexingPageText = readText(INDEXING_PAGE);
  const pickerPanelText = readText(PICKER_PANEL);
  const runtimePanelText = readText(RUNTIME_PANEL);

  assert.equal(authorityText.includes('/runtime-settings'), true, 'runtime settings authority should own runtime settings API route usage');
  assert.equal(indexingPageText.includes('useRuntimeSettingsAuthority'), true, 'Indexing page should use runtime settings authority');
  assert.equal(indexingPageText.includes('useSettingsAuthorityStore'), true, 'Indexing page should read runtime readiness from shared settings authority snapshot');
  assert.equal(indexingPageText.includes('/runtime-settings'), false, 'Indexing page should not directly read/write runtime settings endpoint');
  assert.equal(indexingPageText.includes('/api/v1/runtime-settings'), false, 'Indexing page should not directly call runtime settings API URL');
  assert.equal(indexingPageText.includes('const runtimeSettingsReady = runtimeSettingsAuthorityReady && !runtimeSettingsLoading;'), true, 'Indexing page should lock run start until runtime settings hydrate through shared authority readiness');
  assert.equal(indexingPageText.includes('const canRunSingle = !isAll && !!singleProductId && runtimeSettingsReady;'), true, 'Run readiness should include runtime settings hydration');
  assert.match(
    indexingPageText,
    /<RuntimePanel[\s\S]*runtimeSettingsReady=\{runtimeSettingsReady\}[\s\S]*runtimeSettingsDirty=\{runtimeSettingsDirty\}/,
    'Runtime panel should receive runtime settings readiness',
  );
  assert.equal(pickerPanelText.includes('runtimeSettingsReady: boolean;'), true, 'Picker panel should receive runtime settings readiness');
  assert.equal(pickerPanelText.includes('!runtimeSettingsReady'), true, 'Picker run action should be disabled until runtime settings are ready');
  assert.equal(runtimePanelText.includes('const runtimeSettingsLocked = !runtimeSettingsReady;'), true, 'Runtime panel should derive a lock from hydration readiness');
  assert.match(
    runtimePanelText,
    /<fieldset[\s\S]*disabled=\{runtimeSettingsLocked\}/,
    'Runtime settings controls should be disabled before hydration completes',
  );
});
