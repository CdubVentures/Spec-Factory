import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_AUTHORITY = path.resolve('tools/gui-react/src/stores/settingsAuthority.ts');
const APP_SHELL = path.resolve('tools/gui-react/src/components/layout/AppShell.tsx');
const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');
const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');
const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings UI reactivity uses propagation + authority snapshots without page refresh hacks', () => {
  const settingsAuthorityText = readText(SETTINGS_AUTHORITY);
  const appShellText = readText(APP_SHELL);
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsText = readText(PIPELINE_SETTINGS_PAGE);
  const storagePageText = readText(STORAGE_PAGE);
  const llmSettingsPageText = readText(LLM_SETTINGS_PAGE);

  assert.equal(
    settingsAuthorityText.includes('subscribeSettingsPropagation'),
    true,
    'settings bootstrap should subscribe to propagation events for live updates',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'runtime'") && settingsAuthorityText.includes('runtimeReloadRef.current'),
    true,
    'runtime propagation should trigger shared authority reload',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'convergence'") && settingsAuthorityText.includes('convergenceReloadRef.current'),
    true,
    'convergence propagation should trigger shared authority reload',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'storage'") && settingsAuthorityText.includes('storageReloadRef.current'),
    true,
    'storage propagation should trigger shared authority reload',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'ui'") && settingsAuthorityText.includes('uiReloadRef.current'),
    true,
    'ui propagation should trigger shared authority reload',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'llm'") && settingsAuthorityText.includes('llmSettingsRoutesQueryKey(scopedCategory)'),
    true,
    'llm propagation should invalidate scoped llm query keys and reload active scope',
  );
  assert.equal(
    settingsAuthorityText.includes("case 'source-strategy'") && settingsAuthorityText.includes('sourceStrategyQueryKey(scopedCategory)'),
    true,
    'source-strategy propagation should invalidate scoped source-strategy query keys and reload active scope',
  );

  assert.equal(
    appShellText.includes('useSettingsAuthorityStore'),
    true,
    'app shell should consume shared authority snapshot state for reactivity',
  );
  assert.equal(
    indexingPageText.includes('useSettingsAuthorityStore'),
    true,
    'indexing page should gate behavior from shared authority snapshot state',
  );
  assert.equal(
    pipelineSettingsText.includes('useSettingsAuthorityStore'),
    true,
    'pipeline settings should gate behavior from shared authority snapshot state',
  );
  assert.equal(
    storagePageText.includes('useSettingsAuthorityStore'),
    true,
    'storage page should gate behavior from shared authority snapshot state',
  );
  assert.equal(
    llmSettingsPageText.includes('useSettingsAuthorityStore'),
    true,
    'llm settings page should gate behavior from shared authority snapshot state',
  );

  assert.equal(
    settingsAuthorityText.includes('window.location.reload'),
    false,
    'settings bootstrap should not require hard refresh hacks for reactivity',
  );
  assert.equal(
    appShellText.includes('window.location.reload'),
    false,
    'app shell should not use hard refresh hacks for settings reactivity',
  );
  assert.equal(
    indexingPageText.includes('window.location.reload'),
    false,
    'indexing page should not use hard refresh hacks for settings reactivity',
  );
  assert.equal(
    pipelineSettingsText.includes('window.location.reload'),
    false,
    'pipeline settings should not use hard refresh hacks for settings reactivity',
  );
  assert.equal(
    storagePageText.includes('window.location.reload'),
    false,
    'storage page should not use hard refresh hacks for settings reactivity',
  );
  assert.equal(
    llmSettingsPageText.includes('window.location.reload'),
    false,
    'llm settings page should not use hard refresh hacks for settings reactivity',
  );
});
