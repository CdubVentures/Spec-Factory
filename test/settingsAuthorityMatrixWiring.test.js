import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');
const LLM_SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/llmSettingsAuthority.ts');
const UI_STORE = path.resolve('tools/gui-react/src/stores/uiStore.ts');
const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings authority bootstrap composes runtime, convergence, and autosave slices once at app start', () => {
  assert.equal(fs.existsSync(SETTINGS_AUTHORITY), true, 'settings authority module should exist');

  const settingsAuthorityText = readText(SETTINGS_AUTHORITY);
  const appShellText = readText(APP_SHELL);

  assert.equal(settingsAuthorityText.includes('useRuntimeSettingsAuthority'), true, 'settings authority should compose runtime settings authority slice');
  assert.equal(settingsAuthorityText.includes('useConvergenceSettingsAuthority'), true, 'settings authority should compose convergence settings authority slice');
  assert.equal(settingsAuthorityText.includes('runtimeAutoSaveEnabled'), true, 'settings authority should include runtime autosave state');
  assert.equal(settingsAuthorityText.includes('llmSettingsAutoSaveEnabled'), true, 'settings authority should include llm autosave state');
  assert.equal(settingsAuthorityText.includes('runtime.reload()'), true, 'settings authority bootstrap should trigger runtime settings hydrate/reload');
  assert.equal(settingsAuthorityText.includes('convergence.reload()'), true, 'settings authority bootstrap should trigger convergence settings hydrate/reload');
  assert.equal(appShellText.includes('useSettingsAuthorityBootstrap'), true, 'App shell should bootstrap settings authority once at app startup');
});

test('settings matrix wiring uses shared authority paths across surfaces', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsText = readText(PIPELINE_SETTINGS_PAGE);
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);
  const llmSettingsAuthorityText = readText(LLM_SETTINGS_AUTHORITY);
  const uiStoreText = readText(UI_STORE);
  const studioPageText = readText(STUDIO_PAGE);

  assert.equal(indexingPageText.includes('useRuntimeSettingsAuthority'), true, 'Indexing page should subscribe to runtime settings authority');
  assert.equal(indexingPageText.includes('/runtime-settings'), false, 'Indexing page should not directly own runtime settings endpoint');

  assert.equal(indexingPageText.includes('useConvergenceSettingsAuthority'), true, 'Indexing page should subscribe to convergence settings authority');
  assert.equal(pipelineSettingsText.includes('useConvergenceSettingsAuthority'), true, 'Pipeline settings page should subscribe to convergence settings authority');
  assert.equal(indexingPageText.includes('/convergence-settings'), false, 'Indexing page should not directly own convergence settings endpoint');
  assert.equal(pipelineSettingsText.includes('/convergence-settings'), false, 'Pipeline settings page should not directly own convergence settings endpoint');
  assert.equal(indexingPageText.includes('reloadConvergenceSettings'), true, 'Indexing page should expose convergence reload through authority hook');
  assert.equal(pipelineSettingsText.includes('void reload();'), true, 'Pipeline settings page should expose convergence reload through authority hook');

  assert.equal(uiStoreText.includes('llmSettings:autoSaveEnabled'), true, 'uiStore should own global llm autosave key');
  assert.equal(uiStoreText.includes('llmSettings:autoSave:'), false, 'uiStore should not use category-scoped llm autosave keys');
  assert.equal(llmSettingsPageText.includes('llmSettingsAutoSaveEnabled'), true, 'LLM settings page should subscribe to llm autosave state from uiStore');
  assert.equal(llmSettingsPageText.includes('setLlmSettingsAutoSaveEnabled'), true, 'LLM settings page should write llm autosave state through uiStore');
  assert.equal(llmSettingsPageText.includes('llmSettings:autoSave:'), false, 'LLM settings page should not directly own llm autosave key string');
  assert.equal(llmSettingsAuthorityText.includes('/llm-settings/'), true, 'LLM settings authority should own llm settings route usage');
  assert.equal(llmSettingsPageText.includes('useLlmSettingsAuthority'), true, 'LLM settings page should subscribe to llm settings authority');
  assert.equal(llmSettingsPageText.includes('/llm-settings/'), false, 'LLM settings page should not directly own llm settings routes');

  assert.equal(studioPageText.includes('useStudioPersistenceAuthority'), true, 'Studio page should use studio persistence authority for map/draft saves');
  assert.equal(studioPageText.includes('/save-drafts'), false, 'Studio page should not directly own save-drafts route usage');
  assert.equal(studioPageText.includes('api.put<unknown>(`/studio/${category}/field-studio-map`'), false, 'Studio page should not directly own field-studio-map write route usage');
});
