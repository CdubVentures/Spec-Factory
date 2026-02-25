import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_MANIFEST = path.resolve('tools/gui-react/src/stores/settingsManifest.ts');
const SHARED_DEFAULTS = path.resolve('src/shared/settingsDefaults.js');
const RUNTIME_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');
const STORAGE_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');
const LLM_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings manifest defines canonical autosave debounce and status timings', () => {
  const text = readText(SETTINGS_MANIFEST);
  const sharedDefaultsText = readText(SHARED_DEFAULTS);
  assert.equal(text.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS'), true, 'settings manifest should define autosave debounce contract');
  assert.equal(text.includes("import { SETTINGS_DEFAULTS } from '../../../../src/shared/settingsDefaults.js';"), true, 'settings manifest should import shared defaults');
  assert.equal(text.includes('...SETTINGS_DEFAULTS.autosave.debounceMs'), true, 'settings manifest debounce should flow from shared defaults');
  assert.equal(text.includes('SETTINGS_AUTOSAVE_STATUS_MS'), true, 'settings manifest should define autosave status timing contract');
  assert.equal(text.includes('...SETTINGS_DEFAULTS.autosave.statusMs'), true, 'settings manifest status timing should flow from shared defaults');

  assert.equal(sharedDefaultsText.includes('runtime: 1500'), true, 'runtime autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('storage: 700'), true, 'storage autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('llmRoutes: 700'), true, 'llm routes autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('uiSettings: 250'), true, 'ui autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('studioDocs: 1500'), true, 'studio docs autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('studioMap: 1500'), true, 'studio map autosave debounce should be shared-manifest-owned');
  assert.equal(sharedDefaultsText.includes('studioSavedIndicatorReset: 2000'), true, 'studio autosave saved-indicator timeout should be shared-manifest-owned');
});

test('settings autosave authorities consume debounce contract constants', () => {
  const runtimeText = readText(RUNTIME_SETTINGS_AUTHORITY);
  const storageText = readText(STORAGE_SETTINGS_AUTHORITY);
  const llmText = readText(LLM_SETTINGS_AUTHORITY);
  const settingsAuthorityText = readText(SETTINGS_AUTHORITY);

  assert.equal(runtimeText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime'), true, 'runtime settings authority should use runtime debounce contract');
  assert.equal(storageText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.storage'), true, 'storage settings authority should use storage debounce contract');
  assert.equal(llmText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.llmRoutes'), true, 'llm settings authority should use llm debounce contract');
  assert.equal(settingsAuthorityText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.uiSettings'), true, 'settings bootstrap should use ui debounce contract');

  assert.equal(runtimeText.includes('}, 1500);'), false, 'runtime settings authority should not own hardcoded debounce literals');
  assert.equal(storageText.includes('}, 700);'), false, 'storage settings authority should not own hardcoded debounce literals');
  assert.equal(llmText.includes('}, 700);'), false, 'llm settings authority should not own hardcoded debounce literals');
  assert.equal(settingsAuthorityText.includes('}, 250);'), false, 'settings bootstrap should not own hardcoded debounce literals');
});

test('studio autosave paths consume shared debounce and status timing contract', () => {
  const studioText = readText(STUDIO_PAGE);

  assert.equal(studioText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioDocs'), true, 'studio docs autosave should use contract debounce');
  assert.equal(studioText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.studioMap'), true, 'studio map autosave should use contract debounce');
  assert.equal(studioText.includes('SETTINGS_AUTOSAVE_STATUS_MS.studioSavedIndicatorReset'), true, 'studio saved status timeout should use contract timing');
  assert.equal(studioText.includes("setTimeout(() => setAutoSaveStatus('idle'), 2000);"), false, 'studio should not own hardcoded autosave status timeout literals');
  assert.equal(studioText.includes('setTimeout(saveFromStore, 1500);'), false, 'studio should not own hardcoded docs autosave debounce literals');
  assert.equal(studioText.includes('}, 1500);'), false, 'studio map autosave should not own hardcoded debounce literals');
});

test('runtime and studio autosave timing text is sourced from debounce contract', () => {
  const runtimePanelText = readText(RUNTIME_PANEL);
  const studioText = readText(STUDIO_PAGE);

  assert.equal(runtimePanelText.includes('runtimeAutoSaveDelaySeconds'), true, 'runtime panel should derive autosave timing copy from runtime debounce contract');
  assert.equal(runtimePanelText.includes('SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime'), true, 'runtime panel should use runtime debounce contract for timing copy');
  assert.equal(runtimePanelText.includes('${runtimeAutoSaveDelaySeconds} seconds after any change.'), true, 'runtime autosave title should interpolate contract-owned delay');
  assert.equal(runtimePanelText.includes('1.5 seconds after any change.'), false, 'runtime panel should not hardcode autosave timing copy');

  assert.equal(studioText.includes('studioDocsAutoSaveDelaySeconds'), true, 'studio field-studio docs autosave copy should derive from studio docs debounce contract');
  assert.equal(studioText.includes('studioMapAutoSaveDelaySeconds'), true, 'studio mapping autosave copy should derive from studio map debounce contract');
  assert.equal(studioText.includes('${studioDocsAutoSaveDelaySeconds}s of inactivity.'), true, 'studio field-studio docs autosave tooltip should interpolate contract-owned delay');
  assert.equal(studioText.includes('${studioMapAutoSaveDelaySeconds}s of inactivity.'), true, 'studio mapping autosave tooltip should interpolate contract-owned delay');
  assert.equal(studioText.includes('after 1.5s of inactivity.'), false, 'studio autosave tooltip copy should not hardcode debounce timing');
});
