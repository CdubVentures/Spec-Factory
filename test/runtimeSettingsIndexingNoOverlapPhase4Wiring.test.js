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

test('phase-4 runtime settings overlap guard locks Indexing runtime editor to read-only', () => {
  const runtimePanelText = readText(RUNTIME_PANEL);

  assert.equal(
    runtimePanelText.includes('const runtimeSettingsEditorMovedToPipeline = true;'),
    true,
    'runtime panel should hard-lock settings editor after migration',
  );
  assert.match(
    runtimePanelText,
    /if \(runtimeSettingsEditorMovedToPipeline\)[\s\S]*Runtime and convergence settings now live in[\s\S]*Pipeline Settings/,
    'runtime panel should render explicit migration notice in read-only mode',
  );
  assert.equal(
    runtimePanelText.includes('single settings writer surface'),
    true,
    'runtime panel should explain no-overlap ownership reason',
  );
});

test('phase-4 ownership keeps editing surface in Pipeline Settings while Indexing stays telemetry-only', () => {
  const indexingPageText = readText(INDEXING_PAGE);
  const pipelineSettingsPageText = readText(PIPELINE_SETTINGS_PAGE);

  assert.equal(
    indexingPageText.includes('<RuntimePanel'),
    true,
    'indexing page should keep runtime panel for telemetry visibility',
  );
  assert.equal(
    pipelineSettingsPageText.includes('<RuntimeSettingsFlowCard />'),
    true,
    'pipeline settings should remain the runtime settings editing surface',
  );
});
