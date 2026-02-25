import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const INDEXING_PAGE = path.resolve('tools/gui-react/src/pages/indexing/IndexingPage.tsx');
const RUNTIME_PANEL = path.resolve('tools/gui-react/src/pages/indexing/panels/RuntimePanel.tsx');
const PIPELINE_SETTINGS_PAGE = path.resolve('tools/gui-react/src/pages/pipeline-settings/PipelineSettingsPage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('indexing settings save state is not cleared on dirty edits', () => {
  const indexingPageText = readText(INDEXING_PAGE);

  assert.equal(
    indexingPageText.includes("if (!runtimeSettingsDirty) return;"),
    false,
    'runtime save error/partial state should remain visible after failed persistence while settings stay dirty',
  );
  assert.equal(
    indexingPageText.includes("setRuntimeSettingsSaveState('idle');"),
    false,
    'indexing page should not reset runtime save state to idle on dirty edits',
  );
  assert.equal(
    indexingPageText.includes("if (!convergenceDirty) return;"),
    false,
    'convergence save error/partial state should remain visible after failed persistence while settings stay dirty',
  );
  assert.equal(
    indexingPageText.includes("setConvergenceSettingsSaveState('idle');"),
    false,
    'indexing page should not reset convergence save state to idle on dirty edits',
  );
});

test('runtime panel status precedence shows save error/partial before dirty state', () => {
  const runtimePanelText = readText(RUNTIME_PANEL);

  assert.match(
    runtimePanelText,
    /runtimeSettingsSaveState === 'error'[\s\S]*runtimeSettingsSaveState === 'partial'[\s\S]*runtimeSettingsDirty/,
    'runtime status text precedence should keep error/partial messaging ahead of generic unsaved text',
  );
  assert.match(
    runtimePanelText,
    /convergenceSettingsSaveState === 'error'[\s\S]*convergenceSettingsSaveState === 'partial'[\s\S]*convergenceDirty/,
    'convergence status text precedence should keep error/partial messaging ahead of generic unsaved text',
  );
});

test('pipeline settings status is not reset to idle by dirty edits', () => {
  const pipelineSettingsText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    pipelineSettingsText.includes("if (dirty && saveStatus.kind !== 'idle') {"),
    false,
    'pipeline settings should not clear save error/partial state simply because the form remains dirty',
  );
  assert.match(
    pipelineSettingsText,
    /saveStatus\.kind === 'error'[\s\S]*saveStatus\.kind === 'partial'[\s\S]*dirty[\s\S]*'Unsaved changes'/,
    'pipeline status text precedence should keep error/partial messaging ahead of generic unsaved text',
  );
  assert.equal(
    pipelineSettingsText.includes("setSourceStrategySaveState({ kind: 'idle', message: '' });"),
    false,
    'source strategy status should not be force-reset to idle before mutation outcomes resolve',
  );
  assert.match(
    pipelineSettingsText,
    /sourceStrategySaving[\s\S]*sourceStrategySaveState\.kind === 'error'[\s\S]*sourceStrategySaveState\.kind === 'ok'/,
    'source strategy status should show in-flight state first, then persisted error/success outcomes',
  );
});
