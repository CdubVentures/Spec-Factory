import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const GUI_PERSISTENCE_DOC = path.resolve('implementation/gui-persistence/03-UI-STATE-STORES.md');
const COLLAPSE_STORE = path.resolve('tools/gui-react/src/stores/collapseStore.ts');
const TAB_STORE = path.resolve('tools/gui-react/src/stores/tabStore.ts');
const TEST_MODE_PAGE = path.resolve('tools/gui-react/src/pages/test-mode/TestModePage.tsx');
const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');
const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');
const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const UI_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/uiSettingsAuthority.ts');
const INDEXLAB_STORE = path.resolve('tools/gui-react/src/stores/indexlabStore.ts');
const FIELD_RULES_WORKBENCH = path.resolve('tools/gui-react/src/pages/studio/workbench/FieldRulesWorkbench.tsx');
const REVIEW_PAGE = path.resolve('tools/gui-react/src/pages/review/ReviewPage.tsx');
const COMPONENT_SUBTAB = path.resolve('tools/gui-react/src/pages/component-review/ComponentSubTab.tsx');
const ENUM_SUBTAB = path.resolve('tools/gui-react/src/pages/component-review/EnumSubTab.tsx');
const DATA_TABLE = path.resolve('tools/gui-react/src/components/common/DataTable.tsx');
const SETTINGS_PROPAGATION_CONTRACT = path.resolve('tools/gui-react/src/stores/settingsPropagationContract.ts');
const GUI_SRC_ROOT = path.resolve('tools/gui-react/src');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function extractSection(markdown, startHeading, endHeading) {
  const start = markdown.indexOf(startHeading);
  if (start === -1) return '';
  const fromStart = markdown.slice(start + startHeading.length);
  const endIndex = fromStart.indexOf(endHeading);
  return endIndex === -1 ? fromStart : fromStart.slice(0, endIndex);
}

function extractBacktickKeys(markdownSection) {
  return [...markdownSection.matchAll(/- `([^`]+)`/g)].map((match) => match[1]);
}

function walkGuiSource(dirPath, files = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkGuiSource(fullPath, files);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keyInSource(sourceText, key) {
  if (!key.includes('{')) {
    if (sourceText.includes(key)) {
      return true;
    }
    const segments = key.split(':');
    if (segments.length >= 3) {
      const prefix = `${segments.slice(0, -1).join(':')}:`;
      const suffix = segments.at(-1);
      const suffixPattern = new RegExp(`['"\`]${escapeRegExp(String(suffix))}['"\`]`);
      return sourceText.includes(prefix) && suffixPattern.test(sourceText);
    }
    return false;
  }
  const parts = key
    .split(/\{[^}]+\}/g)
    .map((part) => escapeRegExp(part))
    .filter(Boolean);
  if (parts.length === 0) return true;
  const pattern = parts.join('[\\s\\S]*?');
  return new RegExp(pattern, 'm').test(sourceText);
}

test('GUI persistence stores use session storage only', () => {
  const collapseStoreText = readText(COLLAPSE_STORE);
  const tabStoreText = readText(TAB_STORE);

  assert.equal(collapseStoreText.includes('sessionStorage'), true, 'collapseStore must read/write sessionStorage');
  assert.equal(collapseStoreText.includes('localStorage'), false, 'collapseStore must not read/write localStorage');

  assert.equal(tabStoreText.includes('sessionStorage'), true, 'tabStore must read/write sessionStorage');
  assert.equal(tabStoreText.includes('localStorage'), false, 'tabStore must not read/write localStorage');
});

test('GUI persistence contract documents session storage with local autosave exceptions', () => {
  const docText = readText(GUI_PERSISTENCE_DOC);
  assert.equal(docText.includes('sessionStorage'), true, 'contract doc must describe sessionStorage');
  assert.equal(docText.includes('localStorage'), true, 'contract doc must describe localStorage usage for global autosave preferences');
});

test('test mode stats persistence is session-scoped', () => {
  const pageText = readText(TEST_MODE_PAGE);
  assert.equal(pageText.includes('sessionStorage.getItem(LS_KEY)'), true, 'test mode should load state from sessionStorage');
  assert.equal(pageText.includes('sessionStorage.setItem(LS_KEY'), true, 'test mode should persist state to sessionStorage');
  assert.equal(pageText.includes('sessionStorage.removeItem(LS_KEY)'), true, 'test mode should clear state from sessionStorage');
  assert.equal(pageText.includes('localStorage'), false, 'test mode should not use localStorage for session state');
});

test('autosave toggles are settings-backed with local persistence and legacy session migration', () => {
  const uiStoreText = readText(UI_STORE);
  const indexingPageText = readText(INDEXING_PAGE);
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);
  const storagePageText = readText(STORAGE_PAGE);
  const settingsAuthorityText = readText(SETTINGS_AUTHORITY);
  const uiSettingsAuthorityText = readText(UI_SETTINGS_AUTHORITY);
  assert.equal(uiStoreText.includes('localStorage.getItem('), true, 'uiStore should load autosave toggles from localStorage');
  assert.equal(uiStoreText.includes('localStorage.setItem('), true, 'uiStore should persist autosave toggles to localStorage');
  assert.equal(uiStoreText.includes('sessionStorage.getItem('), true, 'uiStore should read legacy autosave keys from sessionStorage for migration');
  assert.equal(uiStoreText.includes('sessionStorage.removeItem('), true, 'uiStore should clear migrated legacy session autosave keys');
  assert.equal(uiStoreText.includes('indexlab-runtime-autosave'), true, 'uiStore should own runtime autosave key');
  assert.equal(uiStoreText.includes('storage:autoSaveEnabled'), true, 'uiStore should own storage autosave key');
  assert.equal(uiStoreText.includes('studio:autoSaveAllEnabled'), true, 'uiStore should own studio auto-save-all key');
  assert.equal(uiStoreText.includes('llmSettings:autoSaveEnabled'), true, 'uiStore should own a global llm settings autosave key');
  assert.equal(uiStoreText.includes('llmSettings:autoSave:'), false, 'uiStore should not use category-scoped llm autosave keys');
  assert.equal(settingsAuthorityText.includes('useUiSettingsAuthority'), true, 'settings bootstrap should sync ui settings authority');
  assert.equal(uiSettingsAuthorityText.includes('/ui-settings'), true, 'ui settings authority should own ui settings API route usage');
  assert.equal(indexingPageText.includes('runtimeAutoSaveEnabled'), true, 'Indexing page runtime autosave should read from uiStore');
  assert.equal(indexingPageText.includes('setRuntimeAutoSaveEnabled'), true, 'Indexing page runtime autosave should write through uiStore');
  assert.equal(indexingPageText.includes('indexlab-runtime-autosave'), false, 'Indexing page should not read/write runtime autosave session key directly');
  assert.equal(indexingPageText.includes('localStorage'), false, 'Indexing page autosave should not use localStorage');
  assert.equal(storagePageText.includes('storage:autoSave:main'), false, 'Storage page should not own autosave mode tab-store key');
  assert.equal(storagePageText.includes('storageAutoSaveEnabled'), true, 'Storage page should consume storage autosave mode from uiStore');
  assert.equal(llmSettingsPageText.includes('llmSettingsAutoSaveEnabled'), true, 'LLM settings autosave should read from uiStore');
  assert.equal(llmSettingsPageText.includes('setLlmSettingsAutoSaveEnabled'), true, 'LLM settings autosave should write through uiStore');
  assert.equal(llmSettingsPageText.includes('llmSettings:autoSave:'), false, 'LLM settings page should not read/write autosave session key directly');
  assert.equal(llmSettingsPageText.includes('localStorage'), false, 'LLM settings autosave should not use localStorage');
});

test('indexlab picker state (brand/model/variant/run) is session-scoped', () => {
  const indexlabStoreText = readText(INDEXLAB_STORE);
  assert.equal(indexlabStoreText.includes('sessionStorage'), true, 'indexlabStore should persist picker state in sessionStorage');
  assert.equal(indexlabStoreText.includes('localStorage'), false, 'indexlabStore should not use localStorage');
});

test('field contract workbench state is session-scoped', () => {
  const workbenchText = readText(FIELD_RULES_WORKBENCH);
  assert.equal(workbenchText.includes('readWorkbenchSessionState'), true, 'workbench should load session-scoped state');
  assert.equal(workbenchText.includes('writeWorkbenchSessionState'), true, 'workbench should persist session-scoped state');
  assert.equal(workbenchText.includes('localStorage'), false, 'workbench should not use localStorage');
});

test('review grid state is session-scoped', () => {
  const reviewPageText = readText(REVIEW_PAGE);
  assert.equal(reviewPageText.includes('readReviewGridSessionState'), true, 'review grid should load session-scoped state');
  assert.equal(reviewPageText.includes('writeReviewGridSessionState'), true, 'review grid should persist session-scoped state');
  assert.equal(reviewPageText.includes('localStorage'), false, 'review grid should not use localStorage');
});

test('component review nested state is session-scoped', () => {
  const enumSubTabText = readText(ENUM_SUBTAB);
  const componentSubTabText = readText(COMPONENT_SUBTAB);
  const dataTableText = readText(DATA_TABLE);

  assert.equal(enumSubTabText.includes('componentReview:enumField:'), true, 'enum sub-tab field selection should use a persisted key');
  assert.equal(componentSubTabText.includes('componentReview:table:'), true, 'component sub-tab table should provide a persisted key');
  assert.equal(dataTableText.includes('sessionStorage'), true, 'DataTable should persist optional table state in sessionStorage');
  assert.equal(dataTableText.includes('localStorage'), false, 'DataTable should not use localStorage');
});

test('GUI source has no localStorage persistence', () => {
  const sourceFiles = walkGuiSource(GUI_SRC_ROOT);
  const persistenceFiles = sourceFiles.filter((filePath) => {
    const resolvedPath = path.resolve(filePath);
    return resolvedPath !== SETTINGS_PROPAGATION_CONTRACT && resolvedPath !== UI_STORE;
  });
  const persistenceSourceText = persistenceFiles.map(readText).join('\n');
  assert.equal(
    persistenceSourceText.includes('localStorage'),
    false,
    'GUI source should not persist UI state via localStorage outside sanctioned stores',
  );

  const uiStoreText = readText(UI_STORE);
  assert.equal(
    uiStoreText.includes('localStorage'),
    true,
    'uiStore should own localStorage persistence for global autosave preferences',
  );

  const propagationText = readText(SETTINGS_PROPAGATION_CONTRACT);
  assert.equal(
    propagationText.includes('localStorage'),
    true,
    'settings propagation transport may use localStorage events for cross-tab invalidation',
  );
});

test('documented toggle and tab keys are implemented in GUI source', () => {
  const docText = readText(GUI_PERSISTENCE_DOC);
  const toggleSection = extractSection(docText, '## Persisted Toggle Registry', '## Persisted Tab Registry');
  const tabSection = docText.includes('## Persisted Picker Registry')
    ? extractSection(docText, '## Persisted Tab Registry', '## Persisted Picker Registry')
    : extractSection(docText, '## Persisted Tab Registry', '## What Not To Persist');
  const toggleKeys = extractBacktickKeys(toggleSection);
  const tabKeys = extractBacktickKeys(tabSection);

  assert.ok(toggleKeys.length > 0, 'toggle registry keys should be present in the contract doc');
  assert.ok(tabKeys.length > 0, 'tab registry keys should be present in the contract doc');

  const sourceFiles = walkGuiSource(GUI_SRC_ROOT);
  const sourceText = sourceFiles.map(readText).join('\n');

  for (const key of toggleKeys) {
    assert.equal(keyInSource(sourceText, key), true, `missing persisted toggle key usage: ${key}`);
  }
  for (const key of tabKeys) {
    assert.equal(keyInSource(sourceText, key), true, `missing persisted tab key usage: ${key}`);
  }
});
