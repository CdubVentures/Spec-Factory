import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const RUNTIME_SETTINGS_FLOW_CARD = path.resolve('tools/gui-react/src/pages/pipeline-settings/RuntimeSettingsFlowCard.tsx');
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

  assert.equal(settingsAuthorityText.includes('useRuntimeSettingsReader'), true, 'settings authority should compose runtime settings reader slice for bootstrap hydration');
  assert.equal(settingsAuthorityText.includes('useConvergenceSettingsReader'), true, 'settings authority should compose convergence settings reader slice for bootstrap hydration');
  assert.equal(settingsAuthorityText.includes('useRuntimeSettingsAuthority({'), false, 'settings authority bootstrap should not instantiate runtime writer authority for read-only hydration');
  assert.equal(settingsAuthorityText.includes('useConvergenceSettingsAuthority({'), false, 'settings authority bootstrap should not instantiate convergence writer authority for read-only hydration');
  assert.equal(settingsAuthorityText.includes('useStorageSettingsReader'), true, 'settings authority should compose storage settings reader slice for bootstrap hydration');
  assert.equal(settingsAuthorityText.includes('useSourceStrategyReader'), true, 'settings authority should compose source strategy reader slice for bootstrap hydration');
  assert.equal(settingsAuthorityText.includes('useLlmSettingsReader'), true, 'settings authority should compose llm settings reader slice for bootstrap hydration');
  assert.equal(settingsAuthorityText.includes('readSourceStrategySnapshot'), true, 'settings authority readiness checks should use source strategy snapshot reader helper');
  assert.equal(settingsAuthorityText.includes('readLlmSettingsSnapshot'), true, 'settings authority readiness checks should use llm snapshot reader helper');
  assert.equal(settingsAuthorityText.includes('useStorageSettingsAuthority({'), false, 'settings authority bootstrap should not instantiate storage writer authority for read-only hydration');
  assert.equal(settingsAuthorityText.includes('useSourceStrategyAuthority({'), false, 'settings authority bootstrap should not instantiate source strategy writer authority for read-only hydration');
  assert.equal(settingsAuthorityText.includes('useLlmSettingsAuthority({'), false, 'settings authority bootstrap should not instantiate llm writer authority for read-only hydration');
  assert.equal(settingsAuthorityText.includes('runtimeAutoSaveEnabled'), true, 'settings authority should include runtime autosave state');
  assert.equal(settingsAuthorityText.includes('llmSettingsAutoSaveEnabled'), true, 'settings authority should include llm autosave state');
  assert.equal(settingsAuthorityText.includes('uiSettingsPersistState'), true, 'settings authority should include ui settings persistence status in canonical snapshot');
  assert.equal(settingsAuthorityText.includes('uiSettingsPersistMessage'), true, 'settings authority should include ui settings persistence error details in canonical snapshot');
  assert.equal(settingsAuthorityText.includes("setUiSettingsPersistState('saving')"), true, 'settings authority should mark ui settings status as saving when autosave persistence starts');
  assert.equal(settingsAuthorityText.includes("setUiSettingsPersistState('error')"), true, 'settings authority should mark ui settings status as error on persistence failure');
  assert.equal(settingsAuthorityText.includes('onPersisted: () => {'), true, 'settings authority should consume ui settings persisted callback for status clearing');
  assert.equal(settingsAuthorityText.includes('runSettingsStartupHydrationPipeline'), true, 'settings authority should use a unified startup hydration pipeline');
  assert.equal(settingsAuthorityText.includes('runCategoryScopedSettingsHydrationPipeline'), true, 'settings authority should use a category-scoped hydration pipeline for category changes');
  assert.equal(settingsAuthorityText.includes('isSettingsAuthoritySnapshotReady'), true, 'settings authority should expose a shared readiness selector');
  assert.equal(settingsAuthorityText.includes('runtimeReload: runtimeReloadRef.current'), true, 'startup hydration pipeline should include runtime reload in the pipeline contract');
  assert.equal(settingsAuthorityText.includes('convergenceReload: convergenceReloadRef.current'), true, 'startup hydration pipeline should include convergence reload in the pipeline contract');
  assert.equal(settingsAuthorityText.includes('uiReload: uiReloadRef.current'), true, 'startup hydration pipeline should include ui-settings reload in the pipeline contract');
  assert.equal(settingsAuthorityText.includes('enabled: false'), true, 'settings authority bootstrap should disable auto-query mode and hydrate through the shared pipeline');
  assert.equal(appShellText.includes('useSettingsAuthorityBootstrap'), true, 'App shell should bootstrap settings authority once at app startup');
  assert.equal(appShellText.includes('useSettingsAuthorityStore'), true, 'App shell should read canonical settings snapshot from shared authority store');
  assert.equal(appShellText.includes('isSettingsAuthoritySnapshotReady'), true, 'App shell should evaluate settings readiness through shared selector');
  assert.equal(appShellText.includes('Hydrating settings...'), true, 'App shell should block first paint until settings hydration is ready');
  assert.equal(appShellText.includes('Saving autosave preference changes...'), true, 'App shell should expose ui settings save-in-progress status');
  assert.equal(appShellText.includes('Failed to persist autosave preference changes. UI reverted to last persisted values.'), true, 'App shell should expose ui settings persistence failure status');
});

test('settings matrix wiring uses shared authority paths across surfaces', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsText = readText(PIPELINE_SETTINGS_PAGE);
  const runtimeSettingsFlowCardText = readText(RUNTIME_SETTINGS_FLOW_CARD);
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);
  const llmSettingsAuthorityText = readText(LLM_SETTINGS_AUTHORITY);
  const uiStoreText = readText(UI_STORE);
  const studioPageText = readText(STUDIO_PAGE);

  assert.equal(indexingPageText.includes('useRuntimeSettingsReader'), true, 'Indexing page should consume runtime settings through reader authority');
  assert.equal(indexingPageText.includes('useRuntimeSettingsAuthority'), false, 'Indexing page should not instantiate runtime writer authority');
  assert.equal(indexingPageText.includes('useSettingsAuthorityStore'), true, 'Indexing page should read readiness from settings authority store');
  assert.equal(indexingPageText.includes('/runtime-settings'), false, 'Indexing page should not directly own runtime settings endpoint');
  assert.equal(pipelineSettingsText.includes('<RuntimeSettingsFlowCard'), true, 'Pipeline settings should render runtime settings editor surface');
  assert.equal(runtimeSettingsFlowCardText.includes('useRuntimeSettingsEditorAdapter<RuntimeDraft>'), true, 'Pipeline runtime flow should own runtime editor adapter wiring');

  assert.equal(indexingPageText.includes('useConvergenceSettingsAuthority'), false, 'Indexing page should not instantiate convergence writer authority');
  assert.equal(pipelineSettingsText.includes('useConvergenceSettingsAuthority'), true, 'Pipeline settings page should subscribe to convergence settings authority');
  assert.equal(pipelineSettingsText.includes('useSourceStrategyAuthority'), true, 'Pipeline settings page should subscribe to source strategy writer authority');
  assert.equal(indexingPageText.includes('useSourceStrategyAuthority'), false, 'Indexing page should not instantiate source strategy writer authority');
  assert.equal(pipelineSettingsText.includes('useSettingsAuthorityStore'), true, 'Pipeline settings page should read readiness from settings authority store');
  assert.equal(indexingPageText.includes('/convergence-settings'), false, 'Indexing page should not directly own convergence settings endpoint');
  assert.equal(pipelineSettingsText.includes('/convergence-settings'), false, 'Pipeline settings page should not directly own convergence settings endpoint');
  assert.equal(indexingPageText.includes('/source-strategy'), false, 'Indexing page should not directly own source strategy endpoint');
  assert.equal(pipelineSettingsText.includes('/source-strategy'), false, 'Pipeline settings page should not directly own source strategy endpoint');
  assert.equal(pipelineSettingsText.includes('void reload();'), true, 'Pipeline settings page should expose convergence reload through authority hook');

  assert.equal(uiStoreText.includes('llmSettings:autoSaveEnabled'), true, 'uiStore should own global llm autosave key');
  assert.equal(uiStoreText.includes('llmSettings:autoSave:'), false, 'uiStore should not use category-scoped llm autosave keys');
  assert.equal(llmSettingsPageText.includes('llmSettingsAutoSaveEnabled'), true, 'LLM settings page should subscribe to llm autosave state from uiStore');
  assert.equal(llmSettingsPageText.includes('setLlmSettingsAutoSaveEnabled'), true, 'LLM settings page should write llm autosave state through uiStore');
  assert.equal(llmSettingsPageText.includes('useSettingsAuthorityStore'), true, 'LLM settings page should read readiness from settings authority store');
  assert.equal(llmSettingsPageText.includes('llmSettingsReady'), true, 'LLM settings page should gate controls on shared llm readiness state');
  assert.equal(llmSettingsPageText.includes('llmSettings:autoSave:'), false, 'LLM settings page should not directly own llm autosave key string');
  assert.equal(llmSettingsAuthorityText.includes('/llm-settings/'), true, 'LLM settings authority should own llm settings route usage');
  assert.equal(llmSettingsPageText.includes('useLlmSettingsAuthority'), true, 'LLM settings page should subscribe to llm settings authority');
  assert.equal(llmSettingsPageText.includes('/llm-settings/'), false, 'LLM settings page should not directly own llm settings routes');

  assert.equal(studioPageText.includes('useStudioPersistenceAuthority'), true, 'Studio page should use studio persistence authority for map/draft saves');
  assert.equal(studioPageText.includes('/save-drafts'), false, 'Studio page should not directly own save-drafts route usage');
  assert.equal(studioPageText.includes('api.put<unknown>(`/studio/${category}/field-studio-map`'), false, 'Studio page should not directly own field-studio-map write route usage');
});
