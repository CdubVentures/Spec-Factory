import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');
const LLM_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const STUDIO_PAGE = path.resolve('tools/gui-react/src/pages/studio/StudioPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('settings surfaces show persistence outcome truth before generic clean-state labels', () => {
  const storageText = readText(STORAGE_PAGE);
  const llmText = readText(LLM_SETTINGS_PAGE);
  const runtimePanelText = readText(RUNTIME_PANEL);
  const studioText = readText(STUDIO_PAGE);

  assert.match(
    storageText,
    /isStorageSaving[\s\S]*statusKind === 'error'[\s\S]*!storageSettingsReady[\s\S]*isDirty[\s\S]*All changes saved\./,
    'storage status should prioritize saving/error/loading/dirty states before clean-state labels',
  );
  assert.match(
    llmText,
    /isSaving[\s\S]*saveStatus\.kind === 'error'[\s\S]*saveStatus\.kind === 'partial'[\s\S]*dirty[\s\S]*All changes saved\./,
    'llm settings status should prioritize saving/error\/partial\/dirty states before clean-state labels',
  );
  assert.match(
    runtimePanelText,
    /runtimeSettingsSaving[\s\S]*runtimeSettingsLocked[\s\S]*runtimeSettingsSaveState === 'error'[\s\S]*runtimeSettingsSaveState === 'partial'[\s\S]*runtimeSettingsDirty[\s\S]*all changes saved\./,
    'runtime status should prioritize saving/loading/error/partial/dirty states before clean-state labels',
  );
  assert.match(
    runtimePanelText,
    /convergenceSaving[\s\S]*convergenceSettingsSaveState === 'error'[\s\S]*convergenceSettingsSaveState === 'partial'[\s\S]*convergenceDirty[\s\S]*all changes saved\./,
    'convergence status should prioritize saving/error/partial/dirty states before clean-state labels',
  );
  assert.match(
    studioText,
    /saveStudioDocsMut\.isPending[\s\S]*saveStudioDocsMut\.isError[\s\S]*hasUnsavedChanges[\s\S]*effectiveAutoSaveEnabled[\s\S]*All saved/,
    'studio status should prioritize saving/error/unsaved states before clean-state labels',
  );
});
