import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const UI_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');
const FIELD_RULES_WORKBENCH = path.resolve('tools/gui-react/src/pages/studio/workbench/FieldRulesWorkbench.tsx');
const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');
const RUNTIME_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/runtimeSettingsAuthority.ts');
const STORAGE_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/storageSettingsAuthority.ts');
const LLM_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');
const CONVERGENCE_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/convergenceSettingsAuthority.ts');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('ui autosave authority exists and owns /ui-settings route usage', () => {
  assert.equal(fs.existsSync(UI_SETTINGS_AUTHORITY), true, 'ui settings authority module should exist');
  const text = readText(UI_SETTINGS_AUTHORITY);
  assert.equal(text.includes('/ui-settings'), true, 'ui settings authority should own ui settings API usage');
});

test('settings bootstrap composes ui settings authority', () => {
  const text = readText(SETTINGS_AUTHORITY);
  assert.equal(text.includes('useUiSettingsAuthority'), true, 'settings bootstrap should compose ui settings authority');
  assert.equal(text.includes('reloadUiSettings()'), true, 'settings bootstrap should reload ui settings at app startup');
});

test('ui store owns global autosave toggles used by studio/runtime/storage surfaces', () => {
  const text = readText(UI_STORE);
  assert.equal(text.includes('autoSaveAllEnabled'), true, 'ui store should expose studio auto-save-all toggle state');
  assert.equal(text.includes('setAutoSaveAllEnabled'), true, 'ui store should expose studio auto-save-all toggle writer');
  assert.equal(text.includes('storageAutoSaveEnabled'), true, 'ui store should expose storage autosave toggle state');
  assert.equal(text.includes('setStorageAutoSaveEnabled'), true, 'ui store should expose storage autosave toggle writer');
  assert.equal(text.includes('runtimeAutoSaveEnabled'), true, 'ui store should keep runtime autosave toggle state');
  assert.equal(text.includes('llmSettingsAutoSaveEnabled'), true, 'ui store should expose llm settings autosave toggle state');
  assert.equal(text.includes('llmSettings:autoSaveEnabled'), true, 'ui store should persist a global llm autosave key');
  assert.equal(text.includes('llmSettings:autoSave:'), false, 'ui store should not use category-scoped llm autosave keys');
});

test('studio page locks workbook + mapping autosave controls when auto-save-all is enabled', () => {
  const text = readText(STUDIO_PAGE);
  assert.equal(text.includes('effectiveAutoSaveEnabled'), true, 'studio page should derive effective workbook autosave');
  assert.equal(text.includes('effectiveAutoSaveMapEnabled'), true, 'studio page should derive effective mapping autosave');
  assert.equal(text.includes('autoSaveAllEnabled'), true, 'studio page should read auto-save-all toggle');
  assert.equal(text.includes('setAutoSaveAllEnabled'), true, 'studio page should write auto-save-all toggle');
  assert.equal(text.includes('Auto-save ALL'), true, 'studio page should render an auto-save-all control');
  assert.equal(text.includes('Locked by Auto-save ALL'), true, 'studio page should indicate lock state on child autosave controls');
});

test('studio page propagates auto-save-all lock to key navigator + field contract tab controls', () => {
  const text = readText(STUDIO_PAGE);
  assert.equal(text.includes('autoSaveMapLocked={autoSaveAllEnabled}'), true, 'mapping tab should receive lock state from auto-save-all');
  assert.equal(text.includes('autoSaveEnabled={effectiveAutoSaveEnabled}'), true, 'key/workbook tabs should receive effective auto-save state');
  assert.equal(text.includes('autoSaveLocked={autoSaveAllEnabled}'), true, 'key/workbook tabs should receive lock state from auto-save-all');
});

test('key navigator change handlers gate save commits behind autosave state', () => {
  const text = readText(STUDIO_PAGE);
  const keyNavigatorStart = text.indexOf('function KeyNavigatorTab');
  const keyNavigatorEnd = text.indexOf('const currentRule = selectedKey ? (editedRules[selectedKey] || null) : null;');
  assert.notEqual(keyNavigatorStart, -1, 'key navigator tab source should exist');
  assert.notEqual(keyNavigatorEnd, -1, 'key navigator tab section marker should exist');
  const keyNavigatorText = text.slice(keyNavigatorStart, keyNavigatorEnd);
  assert.equal(keyNavigatorText.includes('const saveIfAutoSaveEnabled = useCallback(() => {'), true, 'key navigator should define autosave-gated saver for change handlers');
  assert.equal(keyNavigatorText.includes('if (!autoSaveEnabled) return;'), true, 'key navigator autosave-gated saver should no-op when autosave is off');
  assert.equal(keyNavigatorText.includes('reorder(activeItem, overItem);\n    onSave();'), false, 'reorder should not force-save when autosave is off');
});

test('field contract drawer commits are autosave-gated instead of unconditional', () => {
  const text = readText(FIELD_RULES_WORKBENCH);
  assert.equal(text.includes('const saveIfAutoSaveEnabled = useCallback(() => {'), true, 'workbench should define autosave-gated saver for immediate drawer commits');
  assert.equal(text.includes('onCommitImmediate={saveIfAutoSaveEnabled}'), true, 'workbench drawer commits should use autosave-gated saver');
  assert.equal(text.includes('onCommitImmediate={onSave}'), false, 'workbench drawer should not bypass autosave mode with unconditional save');
});

test('storage autosave mode is owned by ui store settings (not tab-store session key)', () => {
  const text = readText(STORAGE_PAGE);
  assert.equal(text.includes('storageAutoSaveEnabled'), true, 'storage page should read storage autosave from ui store');
  assert.equal(text.includes('setStorageAutoSaveEnabled'), true, 'storage page should write storage autosave through ui store');
  assert.equal(text.includes('storage:autoSave:main'), false, 'storage page should not own autosave mode session key');
});

test('autosave authorities avoid retry polling by tracking last attempted fingerprint', () => {
  const runtimeText = readText(RUNTIME_SETTINGS_AUTHORITY);
  const storageText = readText(STORAGE_SETTINGS_AUTHORITY);
  const llmText = readText(LLM_SETTINGS_AUTHORITY);
  const studioText = readText(STUDIO_PAGE);

  assert.equal(runtimeText.includes('lastAutoSaveAttemptFingerprintRef'), true, 'runtime autosave should track last attempted fingerprint');
  assert.equal(runtimeText.includes('payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current'), true, 'runtime autosave should suppress unchanged retries');
  assert.equal(storageText.includes('lastAutoSaveAttemptFingerprintRef'), true, 'storage autosave should track last attempted fingerprint');
  assert.equal(storageText.includes('payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current'), true, 'storage autosave should suppress unchanged retries');
  assert.equal(llmText.includes('lastAutoSaveAttemptFingerprintRef'), true, 'llm autosave should track last attempted fingerprint');
  assert.equal(llmText.includes('rowsFingerprint === lastAutoSaveAttemptFingerprintRef.current'), true, 'llm autosave should suppress unchanged retries');
  assert.equal(studioText.includes('lastDraftAutoSaveAttemptFingerprintRef'), true, 'studio autosave should track last attempted draft fingerprint');
  assert.equal(studioText.includes('nextFingerprint === lastDraftAutoSaveAttemptFingerprintRef.current'), true, 'studio autosave should suppress unchanged retries');
});

test('manual studio save can force retry after a failed autosave attempt', () => {
  const studioText = readText(STUDIO_PAGE);
  assert.equal(studioText.includes('saveFromStore({ force: true })'), true, 'manual studio save actions should bypass autosave dedupe when user explicitly clicks save');
});

test('settings authorities rely on invalidation/reload instead of fixed query polling', () => {
  const runtimeText = readText(RUNTIME_SETTINGS_AUTHORITY);
  const storageText = readText(STORAGE_SETTINGS_AUTHORITY);
  const uiSettingsText = readText(UI_SETTINGS_AUTHORITY);
  const convergenceText = readText(CONVERGENCE_SETTINGS_AUTHORITY);

  assert.equal(runtimeText.includes('refetchInterval'), false, 'runtime settings authority should not fixed-poll queries');
  assert.equal(storageText.includes('refetchInterval'), false, 'storage settings authority should not fixed-poll queries');
  assert.equal(uiSettingsText.includes('refetchInterval'), false, 'ui settings authority should not fixed-poll queries');
  assert.equal(convergenceText.includes('refetchInterval'), false, 'convergence settings authority should not fixed-poll queries');
});
