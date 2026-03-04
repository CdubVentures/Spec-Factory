import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const UI_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
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
  assert.equal(text.includes('runSettingsStartupHydrationPipeline'), true, 'settings bootstrap should use shared startup hydration pipeline');
  assert.equal(text.includes('uiReload: uiReloadRef.current'), true, 'settings bootstrap pipeline should include ui-settings reload');
  assert.equal(text.includes('uiSettingsPersistState'), true, 'settings bootstrap snapshot should include ui settings persistence status');
  assert.equal(text.includes('uiSettingsPersistMessage'), true, 'settings bootstrap snapshot should include ui settings persistence error details');
  assert.equal(text.includes('onError: (error) => {'), true, 'settings bootstrap should consume ui settings persistence errors');
  assert.equal(text.includes("setUiSettingsPersistState('saving')"), true, 'settings bootstrap should mark ui settings saves as in-flight');
  assert.equal(text.includes("setUiSettingsPersistState('error')"), true, 'settings bootstrap should mark ui settings save failures');
});

test('app shell surfaces ui settings persistence status for autosave toggles', () => {
  const text = readText(APP_SHELL);
  assert.equal(text.includes('useSettingsAuthorityStore'), true, 'App shell should read settings snapshot from shared authority store');
  assert.equal(text.includes('settingsSnapshot.uiSettingsPersistState === \'saving\''), true, 'App shell should render ui settings saving status');
  assert.equal(text.includes('Saving autosave preference changes...'), true, 'App shell should show ui settings save-in-progress text');
  assert.equal(text.includes('settingsSnapshot.uiSettingsPersistState === \'error\''), true, 'App shell should render ui settings save failure status');
  assert.equal(text.includes('Failed to persist autosave preference changes. UI reverted to last persisted values.'), true, 'App shell should show ui settings save failure text');
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
  assert.equal(text.includes('normalizeStudioAutoSaveState'), true, 'ui store should normalize studio autosave relationships');
  assert.equal(text.includes('const autoSaveEnabled = autoSaveAllEnabled'), true, 'ui store should force key/workbench autosave only when auto-save-all is enabled');
  assert.equal(text.includes('autoSaveAllEnabled || autoSaveMapEnabled'), false, 'ui store should not force key/workbench autosave from mapping autosave');
});

test('studio page locks key-navigator + mapping autosave controls when auto-save-all is enabled', () => {
  const text = readText(STUDIO_PAGE);
  assert.equal(text.includes('effectiveAutoSaveEnabled'), true, 'studio page should derive effective key-navigator autosave');
  assert.equal(text.includes('effectiveAutoSaveMapEnabled'), true, 'studio page should derive effective mapping autosave');
  assert.equal(text.includes('autoSaveAllEnabled'), true, 'studio page should read auto-save-all toggle');
  assert.equal(text.includes('setAutoSaveAllEnabled'), true, 'studio page should write auto-save-all toggle');
  assert.equal(text.includes('Auto-Save All'), true, 'studio page should render an auto-save-all control');
  assert.equal(text.includes('Auto-Save On (Locked)'), true, 'studio page should indicate concise lock state on child autosave controls');
});

test('studio page propagates shared autosave lock to key navigator + field contract tab controls', () => {
  const text = readText(STUDIO_PAGE);
  assert.equal(text.includes('autoSaveMapLocked={autoSaveAllEnabled}'), true, 'mapping tab should receive lock state from auto-save-all');
  assert.equal(text.includes('autoSaveEnabled={effectiveAutoSaveEnabled}'), true, 'key/studio tabs should receive effective auto-save state');
  assert.equal(text.includes('autoSaveLocked={autoSaveAllEnabled}'), true, 'key/studio tabs should receive lock state from auto-save-all only');
  assert.match(
    text,
    /autoSaveLockReason=\{autoSaveAllEnabled\s*\?\s*["']Auto-Save All["']\s*:\s*["']["']\}/,
    'key/studio tabs should receive lock reason from auto-save-all ownership',
  );
});

test('ui settings authority keeps mapping and key/workbench autosave independent when auto-save-all is off', () => {
  const text = readText(UI_SETTINGS_AUTHORITY);
  assert.equal(text.includes('const studioAutoSaveAllEnabled'), true, 'ui settings authority should normalize studio auto-save-all state');
  assert.equal(text.includes('const studioAutoSaveMapEnabled = studioAutoSaveAllEnabled'), true, 'ui settings authority should lock map autosave on when auto-save-all is enabled');
  assert.equal(text.includes('const studioAutoSaveEnabled = studioAutoSaveAllEnabled'), true, 'ui settings authority should only force key/workbench autosave when auto-save-all is enabled');
  assert.equal(text.includes('studioAutoSaveAllEnabled || studioAutoSaveMapEnabled'), false, 'ui settings authority should not force key/workbench autosave from mapping autosave');
});

test('settings authority preserves local key/workbench autosave-off against legacy coupled server snapshots', () => {
  const text = readText(SETTINGS_AUTHORITY);
  assert.equal(
    text.includes('const shouldPreserveLocalStudioAutoSaveEnabled = ('),
    true,
    'settings authority should compute a guard for legacy-coupled ui server snapshots',
  );
  assert.equal(
    text.includes('const nextStudioAutoSaveEnabled = shouldPreserveLocalStudioAutoSaveEnabled'),
    true,
    'settings authority should preserve local autosave-off when server snapshot is legacy-coupled',
  );
});

test('key navigator change handlers gate save commits behind autosave state', () => {
  const text = readText(STUDIO_PAGE);
  const keyNavigatorStart = text.indexOf('function KeyNavigatorTab');
  const keyNavigatorEnd = text.indexOf('const B = useCallback(');
  assert.notEqual(keyNavigatorStart, -1, 'key navigator tab source should exist');
  assert.notEqual(keyNavigatorEnd, -1, 'key navigator tab end marker should exist');
  const keyNavigatorText = text.slice(keyNavigatorStart, keyNavigatorEnd);
  assert.match(
    keyNavigatorText,
    /const saveIfAutoSaveEnabled\s*=\s*useCallback\(\(\)\s*=>\s*\{/,
    'key navigator should define autosave-gated saver for change handlers',
  );
  assert.match(
    keyNavigatorText,
    /if\s*\(!autoSaveEnabled\)\s*return;?/,
    'key navigator autosave-gated saver should no-op when autosave is off',
  );
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
  assert.equal(studioText.includes('lastStudioAutoSaveAttemptFingerprintRef'), true, 'studio autosave should track last attempted docs fingerprint');
  assert.equal(studioText.includes('nextFingerprint === lastStudioAutoSaveAttemptFingerprintRef.current'), true, 'studio autosave should suppress unchanged retries');
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
